import { Keypair, TransactionBuilder, Networks, BASE_FEE, Server } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface ContractInteractionConfig {
  network: 'testnet' | 'mainnet';
  contractAddress: string;
  secretKey: string;
  rpcUrl: string;
  horizonUrl: string;
}

export interface PaymentRequest {
  meterId: string;
  amount: bigint;
  tokenAddress: string;
  from: string;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  amount?: bigint;
  meterId?: string;
}

/**
 * Contract Integration Class for NEPA Billing System
 */
export class ContractIntegration {
  private config: ContractInteractionConfig;
  private server: Server;
  private keypair: Keypair;

  constructor(config: ContractInteractionConfig) {
    this.config = config;
    this.server = new Server(config.horizonUrl);
    this.keypair = Keypair.fromSecret(config.secretKey);
  }

  /**
   * Process a payment through the smart contract
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      console.log(`💳 Processing payment of ${request.amount} for meter ${request.meterId}`);

      // Get source account
      const account = await this.server.getAccount(request.from);

      // Create payment transaction
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase()
      })
        .addOperation({
          type: 'payment',
          destination: this.config.contractAddress,
          asset: 'native', // XLM
          amount: request.amount.toString(),
          source: request.from
        })
        .setTimeout(30)
        .build();

      // Add memo with meter ID
      transaction.addMemo(Memo.text(`PAYMENT:${request.meterId}`));

      // Sign transaction
      transaction.sign(this.keypair);

      // Submit transaction
      const result = await this.server.submitTransaction(transaction);

      if (result.successful) {
        console.log(`✅ Payment successful! Hash: ${result.hash}`);
        return {
          success: true,
          transactionHash: result.hash,
          amount: request.amount,
          meterId: request.meterId
        };
      } else {
        console.error('❌ Payment transaction failed:', result.resultXdr);
        return {
          success: false,
          error: 'Transaction failed on network'
        };
      }

    } catch (error) {
      console.error('❌ Payment processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get total paid amount for a meter
   */
  async getTotalPaid(meterId: string): Promise<bigint> {
    try {
      console.log(`📊 Querying total paid for meter ${meterId}`);

      // This would typically query the contract's storage
      // For now, we'll simulate by querying transaction history
      
      const transactions = await this.server
        .transactions()
        .forAccount(this.config.contractAddress)
        .limit(100)
        .call();

      let total = BigInt(0);
      
      for (const record of transactions.records) {
        if (record.memo && record.memo.includes(meterId)) {
          // Parse payment amount from transaction
          const amount = this.parsePaymentAmount(record);
          total += amount;
        }
      }

      console.log(`💰 Total paid for ${meterId}: ${total} stroops`);
      return total;

    } catch (error) {
      console.error('❌ Failed to get total paid:', error);
      return BigInt(0);
    }
  }

  /**
   * Get meter status from contract
   */
  async getMeterStatus(meterId: string): Promise<any> {
    try {
      console.log(`🔍 Getting status for meter ${meterId}`);

      // This would typically call the contract's get_meter_status function
      // For now, return a simulated status
      const totalPaid = await this.getTotalPaid(meterId);
      
      return {
        meterId,
        totalPaid,
        status: totalPaid > BigInt(10000000) ? 'PAID' : 'PENDING', // 1 XLM threshold
        lastPayment: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Failed to get meter status:', error);
      return null;
    }
  }

  /**
   * Listen for contract events
   */
  async listenForEvents(callback: (event: any) => void): Promise<void> {
    try {
      console.log('👂 Starting to listen for contract events...');

      // Set up event stream for contract account
      const es = new this.server.EventSource(
        `${this.config.horizonUrl}/accounts/${this.config.contractAddress}/effects`
      );

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Filter for payment events
          if (data.type === 'payment' && data.asset_type === 'native') {
            const meterId = this.extractMeterIdFromMemo(data.memo);
            if (meterId) {
              callback({
                type: 'payment_received',
                meterId,
                amount: BigInt(data.amount),
                from: data.from,
                timestamp: data.created_at,
                transactionHash: data.transaction_hash
              });
            }
          }
        } catch (error) {
          console.error('Error processing event:', error);
        }
      };

      es.onerror = (error) => {
        console.error('Event stream error:', error);
      };

      console.log('✅ Event listener started');
      
    } catch (error) {
      console.error('❌ Failed to start event listener:', error);
      throw error;
    }
  }

  /**
   * Validate contract address
   */
  async validateContract(): Promise<boolean> {
    try {
      console.log('🔍 Validating contract address...');
      
      const account = await this.server.loadAccount(this.config.contractAddress);
      
      // Check if account has the required balance and flags
      if (account.balance > 0) {
        console.log('✅ Contract address is valid');
        return true;
      } else {
        console.log('❌ Contract address has no balance');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Contract address validation failed:', error);
      return false;
    }
  }

  /**
   * Get contract configuration
   */
  async getContractConfig(): Promise<any> {
    try {
      console.log('⚙️ Getting contract configuration...');
      
      // This would typically query contract storage
      // For now, return default configuration
      return {
        feeRate: 1000, // 0.1%
        minPayment: BigInt(1000000), // 0.1 XLM
        maxPayment: BigInt(10000000000), // 1000 XLM
        admin: this.keypair.publicKey(),
        network: this.config.network,
        contractAddress: this.config.contractAddress
      };

    } catch (error) {
      console.error('❌ Failed to get contract config:', error);
      return null;
    }
  }

  private getNetworkPassphrase(): string {
    return this.config.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  }

  private parsePaymentAmount(record: any): bigint {
    // Extract payment amount from transaction record
    // This is a simplified implementation
    return BigInt(record.amount || '0');
  }

  private extractMeterIdFromMemo(memo: string): string | null {
    if (memo && memo.startsWith('PAYMENT:')) {
      return memo.replace('PAYMENT:', '');
    }
    return null;
  }
}

/**
 * Create contract integration instance with environment variables
 */
export function createContractIntegration(): ContractIntegration {
  const config: ContractInteractionConfig = {
    network: (process.env.STELLAR_NETWORK as 'testnet' | 'mainnet') || 'testnet',
    contractAddress: process.env.CONTRACT_ADDRESS || '',
    secretKey: process.env.STELLAR_SECRET_KEY || '',
    rpcUrl: process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org:443',
    horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
  };

  if (!config.contractAddress) {
    throw new Error('CONTRACT_ADDRESS environment variable is not set');
  }

  if (!config.secretKey) {
    throw new Error('STELLAR_SECRET_KEY environment variable is not set');
  }

  return new ContractIntegration(config);
}

/**
 * Process payment with error handling
 */
export async function processPaymentWithRetry(
  integration: ContractIntegration,
  request: PaymentRequest,
  maxRetries: number = 3
): Promise<PaymentResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await integration.processPayment(request);
      
      if (result.success) {
        return result;
      }
      
      if (attempt === maxRetries) {
        return result;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      
    } catch (error) {
      if (attempt === maxRetries) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  return {
    success: false,
    error: 'Max retries exceeded'
  };
}
