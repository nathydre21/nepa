import { Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { YieldPosition } from './yield-manager';

export interface DistributionRule {
  id: string;
  name: string;
  description: string;
  type: 'percentage' | 'fixed' | 'tiered';
  recipient: string;
  allocation: number; // Percentage or fixed amount
  minAmount?: bigint;
  maxAmount?: bigint;
  isActive: boolean;
}

export interface DistributionEvent {
  id: string;
  timestamp: Date;
  totalYield: bigint;
  totalDistributed: bigint;
  distributions: Distribution[];
  transactionHash?: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface Distribution {
  recipient: string;
  amount: bigint;
  asset: Asset;
  ruleId: string;
  percentage: number;
}

export interface DistributionConfig {
  autoDistribute: boolean;
  distributionFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  minDistributionAmount: bigint;
  maxGasFee: bigint;
  emergencyStop: boolean;
}

export class YieldDistributor {
  private distributionRules: Map<string, DistributionRule> = new Map();
  private distributionHistory: DistributionEvent[] = [];
  private config: DistributionConfig;
  private isDistributing = false;
  private distributionInterval: any = null;

  constructor(config: DistributionConfig) {
    this.config = config;
    this.initializeDefaultRules();
  }

  async startAutoDistribution(
    publicKey: string,
    secretKey: string,
    positions: YieldPosition[]
  ): Promise<void> {
    if (this.isDistributing) {
      throw new Error('Distribution is already running');
    }

    this.isDistributing = true;
    
    const frequencyMs = this.getFrequencyMs(this.config.distributionFrequency);
    
    this.distributionInterval = setInterval(async () => {
      try {
        await this.executeDistribution(publicKey, secretKey, positions);
      } catch (error) {
        console.error('Auto distribution failed:', error);
      }
    }, frequencyMs);

    console.log(`Auto distribution started with ${this.config.distributionFrequency} frequency`);
  }

  stopAutoDistribution(): void {
    if (this.distributionInterval) {
      clearInterval(this.distributionInterval);
      this.distributionInterval = null;
    }
    this.isDistributing = false;
    console.log('Auto distribution stopped');
  }

  async executeDistribution(
    publicKey: string,
    secretKey: string,
    positions: YieldPosition[]
  ): Promise<DistributionEvent> {
    if (this.config.emergencyStop) {
      throw new Error('Distribution is stopped due to emergency setting');
    }

    const totalYield = await this.calculateTotalYield(positions);
    
    if (totalYield < this.config.minDistributionAmount) {
      throw new Error(`Total yield (${totalYield}) below minimum distribution amount (${this.config.minDistributionAmount})`);
    }

    const distributions = await this.calculateDistributions(totalYield);
    const totalDistributed = distributions.reduce((sum, d) => sum + d.amount, BigInt(0));

    const event: DistributionEvent = {
      id: `dist-${Date.now()}`,
      timestamp: new Date(),
      totalYield,
      totalDistributed,
      distributions,
      status: 'pending'
    };

    try {
      const transactionHash = await this.sendDistributions(
        publicKey,
        secretKey,
        distributions
      );

      event.transactionHash = transactionHash;
      event.status = 'completed';

      // Update positions to reflect distributed yield
      await this.updatePositionsAfterDistribution(positions, totalDistributed);

    } catch (error) {
      console.error('Distribution failed:', error);
      event.status = 'failed';
      throw error;
    }

    this.distributionHistory.push(event);
    return event;
  }

  addDistributionRule(rule: DistributionRule): void {
    this.distributionRules.set(rule.id, rule);
  }

  removeDistributionRule(ruleId: string): boolean {
    return this.distributionRules.delete(ruleId);
  }

  updateDistributionRule(ruleId: string, updates: Partial<DistributionRule>): boolean {
    const rule = this.distributionRules.get(ruleId);
    if (!rule) return false;

    const updatedRule = { ...rule, ...updates };
    this.distributionRules.set(ruleId, updatedRule);
    return true;
  }

  getDistributionRules(): DistributionRule[] {
    return Array.from(this.distributionRules.values()).filter(rule => rule.isActive);
  }

  getDistributionHistory(limit?: number): DistributionEvent[] {
    const history = [...this.distributionHistory].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
    return limit ? history.slice(0, limit) : history;
  }

  async getDistributionSummary(): Promise<{
    totalDistributed: bigint;
    distributionsThisPeriod: bigint;
    averageDistribution: bigint;
    recipientCount: number;
    activeRules: number;
  }> {
    const completedDistributions = this.distributionHistory.filter(d => d.status === 'completed');
    const totalDistributed = completedDistributions.reduce((sum, d) => sum + d.totalDistributed, BigInt(0));
    
    const periodStart = this.getPeriodStart();
    const distributionsThisPeriod = completedDistributions
      .filter(d => d.timestamp >= periodStart)
      .reduce((sum, d) => sum + d.totalDistributed, BigInt(0));

    const averageDistribution = completedDistributions.length > 0 
      ? totalDistributed / BigInt(completedDistributions.length)
      : BigInt(0);

    const recipients = new Set(
      completedDistributions.flatMap(d => d.distributions.map(dist => dist.recipient))
    ).size;

    return {
      totalDistributed,
      distributionsThisPeriod,
      averageDistribution,
      recipientCount: recipients,
      activeRules: this.getDistributionRules().length
    };
  }

  updateConfig(newConfig: Partial<DistributionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart auto-distribution if it's running and frequency changed
    if (this.isDistributing && newConfig.distributionFrequency) {
      // Note: In a real implementation, you'd want to restart the interval
      console.log('Distribution frequency updated. Restart may be required.');
    }
  }

  getConfig(): DistributionConfig {
    return { ...this.config };
  }

  async estimateDistributionFees(distributions: Distribution[]): Promise<bigint> {
    // Estimate transaction fees based on number of operations
    const baseFee = BigInt(100); // Base fee per operation
    const operationsCount = distributions.length;
    return baseFee * BigInt(operationsCount);
  }

  private initializeDefaultRules(): void {
    // Default distribution rules for the NEPA platform
    const defaultRules: DistributionRule[] = [
      {
        id: 'platform-fee',
        name: 'Platform Fee',
        description: 'Platform operational fee (2%)',
        type: 'percentage',
        recipient: 'PLATFORM_WALLET_ADDRESS',
        allocation: 0.02,
        isActive: true
      },
      {
        id: 'treasury',
        name: 'Treasury',
        description: 'Treasury allocation (3%)',
        type: 'percentage',
        recipient: 'TREASURY_WALLET_ADDRESS',
        allocation: 0.03,
        isActive: true
      },
      {
        id: 'rewards',
        name: 'User Rewards',
        description: 'User rewards pool (10%)',
        type: 'percentage',
        recipient: 'REWARDS_WALLET_ADDRESS',
        allocation: 0.10,
        isActive: true
      },
      {
        id: 'reinvestment',
        name: 'Reinvestment',
        description: 'Auto-reinvestment (85%)',
        type: 'percentage',
        recipient: 'REINVESTMENT_ADDRESS',
        allocation: 0.85,
        isActive: true
      }
    ];

    defaultRules.forEach(rule => this.distributionRules.set(rule.id, rule));
  }

  private async calculateTotalYield(positions: YieldPosition[]): Promise<bigint> {
    // In a real implementation, this would calculate actual earned yield
    return positions.reduce((total, position) => {
      // Mock calculation - in reality would fetch from blockchain
      const mockYield = position.amount * BigInt(5) / BigInt(1000); // 0.5% yield
      return total + mockYield;
    }, BigInt(0));
  }

  private async calculateDistributions(totalYield: bigint): Promise<Distribution[]> {
    const activeRules = this.getDistributionRules();
    const distributions: Distribution[] = [];

    for (const rule of activeRules) {
      let amount: bigint;

      switch (rule.type) {
        case 'percentage':
          amount = totalYield * BigInt(Math.floor(rule.allocation * 10000)) / BigInt(10000);
          break;
        case 'fixed':
          amount = BigInt(rule.allocation);
          break;
        case 'tiered':
          amount = await this.calculateTieredDistribution(rule, totalYield);
          break;
        default:
          continue;
      }

      // Apply min/max constraints
      if (rule.minAmount && amount < rule.minAmount) continue;
      if (rule.maxAmount && amount > rule.maxAmount) amount = rule.maxAmount;

      distributions.push({
        recipient: rule.recipient,
        amount,
        asset: Asset.native(), // Assuming XLM for simplicity
        ruleId: rule.id,
        percentage: rule.allocation
      });
    }

    return distributions;
  }

  private async calculateTieredDistribution(rule: DistributionRule, totalYield: bigint): Promise<bigint> {
    // Simplified tiered calculation
    if (totalYield > BigInt(1000000)) { // > 0.1 XLM
      return totalYield * BigInt(1500) / BigInt(10000); // 15%
    } else if (totalYield > BigInt(500000)) { // > 0.05 XLM
      return totalYield * BigInt(1000) / BigInt(10000); // 10%
    } else {
      return totalYield * BigInt(500) / BigInt(10000); // 5%
    }
  }

  private async sendDistributions(
    publicKey: string,
    secretKey: string,
    distributions: Distribution[]
  ): Promise<string> {
    const keypair = Keypair.fromSecret(secretKey);
    const server = new (require('@stellar/stellar-sdk').Server)('https://horizon-testnet.stellar.org');
    const account = await server.loadAccount(publicKey);

    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: 'Test SDF Network ; September 2015'
    });

    // Add payment operations for each distribution
    distributions.forEach(distribution => {
      transaction.addOperation(Operation.payment({
        destination: distribution.recipient,
        asset: distribution.asset,
        amount: distribution.amount.toString()
      }));
    });

    const builtTransaction = transaction.setTimeout(30).build();
    builtTransaction.sign(keypair);

    const result = await server.sendTransaction(builtTransaction);
    
    if (!result.result.successful) {
      throw new Error(`Transaction failed: ${result.result.resultXdr}`);
    }

    return result.hash;
  }

  private async updatePositionsAfterDistribution(
    positions: YieldPosition[],
    distributedAmount: bigint
  ): Promise<void> {
    // In a real implementation, this would update position records
    // to reflect that yield has been distributed
    console.log(`Updated positions after distributing ${distributedAmount} in yield`);
  }

  private getFrequencyMs(frequency: string): number {
    const frequencies = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000
    };
    return frequencies[frequency] || frequencies.daily;
  }

  private getPeriodStart(): Date {
    const now = new Date();
    switch (this.config.distributionFrequency) {
      case 'hourly':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'daily':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }
}
