import { Keypair, TransactionBuilder, Networks, Horizon, BASE_FEE } from '@stellar/stellar-sdk';
import axios from 'axios';

export interface ContractConfig {
  network: 'testnet' | 'mainnet';
  contractAddress: string;
  secretKey: string;
  horizonUrl: string;
}

export interface PaymentData {
  meterId: string;
  amount: string;
  from: string;
  tokenAddress?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  amount?: string;
  meterId?: string;
}

/**
 * Contract Manager for NEPA Billing System
 */
export class ContractManager {
  private config: ContractConfig;
  private server: Horizon.Server;
  private keypair: Keypair;

  constructor(config: ContractConfig) {
    this.config = config;
    this.server = new Horizon.Server(config.horizonUrl);
    this.keypair = Keypair.fromSecret(config.secretKey);
  }

  /**
   * Process payment through the contract
   */
  async processPayment(payment: PaymentData): Promise<PaymentResult> {
    try {
      console.log(`Processing payment: ${payment.amount} for meter ${payment.meterId}`);

      // Get source account
      const account = await this.server.loadAccount(payment.from);

      // Create transaction
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase()
      })
        .addOperation({
          type: 'payment',
          destination: this.config.contractAddress,
          asset: 'native', // XLM
          amount: payment.amount
        })
        .setTimeout(30)
        .build();

      // Add memo with meter ID
      transaction.memo = Horizon.Memo.text(`PAYMENT:${payment.meterId}`);

      // Sign transaction
      transaction.sign(this.keypair);

      // Submit transaction
      const result = await this.server.submitTransaction(transaction);

      if (result.successful) {
        return {
          success: true,
          transactionHash: result.hash,
          amount: payment.amount,
          meterId: payment.meterId
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed'
        };
      }

    } catch (error) {
      console.error('Payment processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get total paid amount for a meter
   */
  async getTotalPaid(meterId: string): Promise<string> {
    try {
      const transactions = await this.server
        .transactions()
        .forAccount(this.config.contractAddress)
        .limit(100)
        .call();

      let total = '0';
      
      for (const record of transactions.records) {
        if (record.memo && record.memo.includes(meterId)) {
          const operations = await this.server
            .operations()
            .forTransaction(record.id)
            .call();

          for (const op of operations.records) {
            if (op.type === 'payment' && op.asset_type === 'native') {
              total = (parseFloat(total) + parseFloat(op.amount)).toString();
            }
          }
        }
      }

      return total;

    } catch (error) {
      console.error('Failed to get total paid:', error);
      return '0';
    }
  }

  /**
   * Get meter status
   */
  async getMeterStatus(meterId: string): Promise<any> {
    try {
      const totalPaid = await this.getTotalPaid(meterId);
      
      return {
        meterId,
        totalPaid,
        status: parseFloat(totalPaid) >= 1.0 ? 'PAID' : 'PENDING',
        lastPayment: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to get meter status:', error);
      return null;
    }
  }

  /**
   * Listen for contract events (polling implementation)
   */
  async listenForEvents(callback: (event: any) => void): Promise<void> {
    console.log('Starting event listener...');
    
    const pollInterval = 5000; // 5 seconds
    let lastLedger = 0;

    const poll = async () => {
      try {
        const ledgers = await this.server
          .ledgers()
          .limit(1)
          .order('desc')
          .call();

        if (ledgers.records.length > 0) {
          const latestLedger = ledgers.records[0].sequence;
          
          if (latestLedger > lastLedger) {
            // Check for new transactions
            const transactions = await this.server
              .transactions()
              .forAccount(this.config.contractAddress)
              .limit(10)
              .order('desc')
              .call();

            for (const record of transactions.records) {
              if (record.ledger_attr > lastLedger && record.memo) {
                const meterId = this.extractMeterIdFromMemo(record.memo);
                if (meterId) {
                  callback({
                    type: 'payment_received',
                    meterId,
                    transactionHash: record.hash,
                    timestamp: record.created_at
                  });
                }
              }
            }
            
            lastLedger = latestLedger;
          }
        }
      } catch (error) {
        console.error('Event polling error:', error);
      }
    };

    // Start polling
    setInterval(poll, pollInterval);
  }

  /**
   * Validate contract
   */
  async validateContract(): Promise<boolean> {
    try {
      const account = await this.server.loadAccount(this.config.contractAddress);
      return account.balances.length > 0;
    } catch (error) {
      console.error('Contract validation failed:', error);
      return false;
    }
  }

  private getNetworkPassphrase(): string {
    return this.config.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  }

  private extractMeterIdFromMemo(memo: string): string | null {
    if (memo && memo.startsWith('PAYMENT:')) {
      return memo.replace('PAYMENT:', '');
    }
    return null;
  }
}

/**
 * Create contract manager from environment variables
 */
export function createContractManager(): ContractManager {
  const config: ContractConfig = {
    network: (process.env.STELLAR_NETWORK as 'testnet' | 'mainnet') || 'testnet',
    contractAddress: process.env.CONTRACT_ADDRESS || '',
    secretKey: process.env.STELLAR_SECRET_KEY || '',
    horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
  };

  if (!config.contractAddress || !config.secretKey) {
    throw new Error('Missing required environment variables');
  }

  return new ContractManager(config);
}
