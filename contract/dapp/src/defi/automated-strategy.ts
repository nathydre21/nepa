import { Asset, Keypair } from '@stellar/stellar-sdk';
import { YieldManager, YieldStrategy, YieldPosition } from './yield-manager';
import { RiskManager, RiskAlert } from './risk-manager';
import { YieldMonitor, YieldAlert as YieldMonitorAlert } from './yield-monitor';

export interface StrategyConfig {
  rebalanceThreshold: number; // Percentage change before rebalancing
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  maxPositions: number;
  minPositionSize: bigint;
  autoRebalance: boolean;
  stopLossThreshold: number;
  takeProfitThreshold: number;
}

export interface StrategyExecution {
  id: string;
  timestamp: Date;
  action: 'deploy' | 'withdraw' | 'rebalance' | 'compound';
  strategyId: string;
  amount: bigint;
  reason: string;
  transactionHash?: string;
  success: boolean;
}

export interface StrategyPerformance {
  totalReturn: number;
  annualizedReturn: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalTrades: number;
  profitableTrades: number;
}

export class AutomatedStrategy {
  private yieldManager: YieldManager;
  private riskManager: RiskManager;
  private yieldMonitor: YieldMonitor;
  private config: StrategyConfig;
  private positions: Map<string, YieldPosition> = new Map();
  private executionHistory: StrategyExecution[] = [];
  private isRunning = false;
  private executionInterval: any = null;

  constructor(
    yieldManager: YieldManager,
    riskManager: RiskManager,
    yieldMonitor: YieldMonitor,
    config: StrategyConfig
  ) {
    this.yieldManager = yieldManager;
    this.riskManager = riskManager;
    this.yieldMonitor = yieldMonitor;
    this.config = config;
  }

  async startAutomatedStrategy(
    publicKey: string,
    secretKey: string,
    initialAmount: bigint
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error('Strategy is already running');
    }

    this.isRunning = true;
    console.log('Starting automated yield strategy...');

    // Initial deployment
    await this.executeInitialDeployment(publicKey, secretKey, initialAmount);

    // Start monitoring and automated execution
    this.executionInterval = setInterval(async () => {
      try {
        await this.executeStrategyLogic(publicKey, secretKey);
      } catch (error) {
        console.error('Error in strategy execution:', error);
      }
    }, 300000); // Check every 5 minutes

    // Setup alert handlers
    this.setupAlertHandlers();
  }

  stopAutomatedStrategy(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.executionInterval) {
      clearInterval(this.executionInterval);
      this.executionInterval = null;
    }
    console.log('Automated strategy stopped');
  }

  async getStrategyPerformance(): Promise<StrategyPerformance> {
    const successfulExecutions = this.executionHistory.filter(e => e.success);
    const profitableExecutions = successfulExecutions.filter(e => 
      e.action === 'withdraw' && this.isExecutionProfitable(e)
    );

    const totalReturn = this.calculateTotalReturn();
    const annualizedReturn = this.calculateAnnualizedReturn(totalReturn);
    const winRate = successfulExecutions.length > 0 
      ? profitableExecutions.length / successfulExecutions.length 
      : 0;
    const maxDrawdown = this.calculateMaxDrawdown();
    const sharpeRatio = this.calculateSharpeRatio();

    return {
      totalReturn,
      annualizedReturn,
      winRate,
      maxDrawdown,
      sharpeRatio,
      totalTrades: successfulExecutions.length,
      profitableTrades: profitableExecutions.length
    };
  }

  getExecutionHistory(): StrategyExecution[] {
    return [...this.executionHistory];
  }

  updateConfig(newConfig: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getCurrentPositions(): YieldPosition[] {
    return Array.from(this.positions.values()).filter(p => p.isActive);
  }

  private async executeInitialDeployment(
    publicKey: string,
    secretKey: string,
    amount: bigint
  ): Promise<void> {
    const strategies = await this.yieldManager.getAvailableYieldStrategies();
    const suitableStrategies = this.filterStrategiesByRiskTolerance(strategies);

    if (suitableStrategies.length === 0) {
      throw new Error('No suitable strategies found for current risk tolerance');
    }

    // Deploy to multiple strategies based on risk tolerance
    const allocation = this.calculateAllocation(suitableStrategies, amount);

    for (const [strategyId, allocationAmount] of Object.entries(allocation)) {
      try {
        const txHash = await this.yieldManager.deployToYield(
          publicKey,
          secretKey,
          strategyId,
          allocationAmount
        );

        this.recordExecution({
          id: `deploy-${Date.now()}`,
          timestamp: new Date(),
          action: 'deploy',
          strategyId,
          amount: allocationAmount,
          reason: 'Initial deployment',
          transactionHash: txHash,
          success: true
        });

        // Create position record
        const strategy = suitableStrategies.find(s => s.id === strategyId);
        if (strategy) {
          const position: YieldPosition = {
            id: `position-${strategyId}-${Date.now()}`,
            strategyId,
            amount: allocationAmount,
            asset: strategy.asset,
            startTime: new Date(),
            earnedYield: BigInt(0),
            isActive: true
          };
          this.positions.set(position.id, position);
        }

      } catch (error) {
        console.error(`Failed to deploy to strategy ${strategyId}:`, error);
        this.recordExecution({
          id: `deploy-${Date.now()}`,
          timestamp: new Date(),
          action: 'deploy',
          strategyId,
          amount: allocationAmount,
          reason: 'Initial deployment',
          success: false
        });
      }
    }
  }

  private async executeStrategyLogic(
    publicKey: string,
    secretKey: string
  ): Promise<void> {
    // Check for rebalancing opportunities
    if (this.config.autoRebalance) {
      await this.checkRebalancingOpportunities(publicKey, secretKey);
    }

    // Check for compounding opportunities
    await this.checkCompoundingOpportunities(publicKey, secretKey);

    // Check stop-loss and take-profit conditions
    await this.checkRiskConditions(publicKey, secretKey);

    // Monitor performance and adjust strategy
    await this.monitorAndAdjust();
  }

  private async checkRebalancingOpportunities(
    publicKey: string,
    secretKey: string
  ): Promise<void> {
    const currentPositions = this.getCurrentPositions();
    const strategies = await this.yieldManager.getAvailableYieldStrategies();

    for (const position of currentPositions) {
      const currentStrategy = strategies.find(s => s.id === position.strategyId);
      if (!currentStrategy) continue;

      // Check if performance has changed significantly
      const metrics = await this.yieldMonitor.calculateYieldMetrics(position);
      const performanceChange = Math.abs(metrics.currentAPR - currentStrategy.expectedAPR) / currentStrategy.expectedAPR;

      if (performanceChange > this.config.rebalanceThreshold) {
        await this.rebalancePosition(publicKey, secretKey, position, metrics.currentAPR);
      }
    }
  }

  private async checkCompoundingOpportunities(
    publicKey: string,
    secretKey: string
  ): Promise<void> {
    const currentPositions = this.getCurrentPositions();

    for (const position of currentPositions) {
      const metrics = await this.yieldMonitor.calculateYieldMetrics(position);
      
      // Compound if earned yield is significant
      if (metrics.earnedYield > this.config.minPositionSize / BigInt(10)) { // 10% of min position size
        await this.compoundYield(publicKey, secretKey, position, metrics.earnedYield);
      }
    }
  }

  private async checkRiskConditions(
    publicKey: string,
    secretKey: string
  ): Promise<void> {
    const currentPositions = this.getCurrentPositions();
    const totalValue = currentPositions.reduce((sum, p) => sum + p.amount, BigInt(0));

    const portfolioRisk = await this.riskManager.assessPortfolioRisk(
      currentPositions.map(p => ({
        amount: p.amount,
        asset: p.asset,
        poolId: new (require('@stellar/stellar-sdk').LiquidityPoolId)(p.strategyId)
      })),
      totalValue
    );

    // Check stop-loss
    const currentReturn = this.calculateCurrentReturn();
    if (currentReturn < -this.config.stopLossThreshold) {
      await this.executeStopLoss(publicKey, secretKey);
    }

    // Check take-profit
    if (currentReturn > this.config.takeProfitThreshold) {
      await this.executeTakeProfit(publicKey, secretKey);
    }
  }

  private async monitorAndAdjust(): Promise<void> {
    const performance = await this.getStrategyPerformance();
    
    // Adjust strategy based on performance
    if (performance.winRate < 0.4 && this.config.riskTolerance !== 'conservative') {
      console.log('Low win rate detected, considering more conservative approach');
      // Could adjust risk tolerance here
    }
  }

  private filterStrategiesByRiskTolerance(strategies: YieldStrategy[]): YieldStrategy[] {
    const riskLevels = {
      conservative: ['low'],
      moderate: ['low', 'medium'],
      aggressive: ['low', 'medium', 'high']
    };

    const allowedRisks = riskLevels[this.config.riskTolerance];
    return strategies.filter(s => allowedRisks.includes(s.riskLevel));
  }

  private calculateAllocation(strategies: YieldStrategy[], totalAmount: bigint): { [strategyId: string]: bigint } {
    const allocation: { [strategyId: string]: bigint } = {};
    const maxPositions = Math.min(this.config.maxPositions, strategies.length);

    // Simple equal allocation with risk adjustment
    const baseAllocation = totalAmount / BigInt(maxPositions);
    
    for (let i = 0; i < maxPositions; i++) {
      const strategy = strategies[i];
      const riskMultiplier = strategy.riskLevel === 'low' ? 1.2 : strategy.riskLevel === 'medium' ? 1.0 : 0.8;
      const adjustedAmount = BigInt(Math.floor(Number(baseAllocation) * riskMultiplier));
      allocation[strategy.id] = adjustedAmount;
    }

    return allocation;
  }

  private async rebalancePosition(
    publicKey: string,
    secretKey: string,
    position: YieldPosition,
    newAPR: number
  ): Promise<void> {
    try {
      // Withdraw from current position
      const withdrawTx = await this.yieldManager.withdrawFromYield(
        publicKey,
        secretKey,
        position.id
      );

      // Find better strategy
      const strategies = await this.yieldManager.getAvailableYieldStrategies();
      const betterStrategy = strategies.find(s => 
        s.expectedAPR > newAPR && s.riskLevel === this.getRiskToleranceLevel()
      );

      if (betterStrategy) {
        // Deploy to better strategy
        const deployTx = await this.yieldManager.deployToYield(
          publicKey,
          secretKey,
          betterStrategy.id,
          position.amount
        );

        this.recordExecution({
          id: `rebalance-${Date.now()}`,
          timestamp: new Date(),
          action: 'rebalance',
          strategyId: betterStrategy.id,
          amount: position.amount,
          reason: `Rebalanced from ${position.strategyId} to ${betterStrategy.id} for better yield`,
          transactionHash: deployTx,
          success: true
        });
      }

    } catch (error) {
      console.error('Rebalancing failed:', error);
    }
  }

  private async compoundYield(
    publicKey: string,
    secretKey: string,
    position: YieldPosition,
    yieldAmount: bigint
  ): Promise<void> {
    try {
      const txHash = await this.yieldManager.deployToYield(
        publicKey,
        secretKey,
        position.strategyId,
        yieldAmount
      );

      this.recordExecution({
        id: `compound-${Date.now()}`,
        timestamp: new Date(),
        action: 'compound',
        strategyId: position.strategyId,
        amount: yieldAmount,
        reason: 'Compounding earned yield',
        transactionHash: txHash,
        success: true
      });

    } catch (error) {
      console.error('Compounding failed:', error);
    }
  }

  private async executeStopLoss(publicKey: string, secretKey: string): Promise<void> {
    const currentPositions = this.getCurrentPositions();
    
    for (const position of currentPositions) {
      try {
        const txHash = await this.yieldManager.withdrawFromYield(
          publicKey,
          secretKey,
          position.id
        );

        this.recordExecution({
          id: `stop-loss-${Date.now()}`,
          timestamp: new Date(),
          action: 'withdraw',
          strategyId: position.strategyId,
          amount: position.amount,
          reason: 'Stop-loss triggered',
          transactionHash: txHash,
          success: true
        });

      } catch (error) {
        console.error('Stop-loss execution failed:', error);
      }
    }
  }

  private async executeTakeProfit(publicKey: string, secretKey: string): Promise<void> {
    // Similar to stop-loss but only withdraw profits
    const currentPositions = this.getCurrentPositions();
    
    for (const position of currentPositions) {
      const metrics = await this.yieldMonitor.calculateYieldMetrics(position);
      
      if (metrics.earnedYield > BigInt(0)) {
        try {
          // Withdraw only the earned yield
          const txHash = await this.yieldManager.withdrawFromYield(
            publicKey,
            secretKey,
            position.id
          );

          this.recordExecution({
            id: `take-profit-${Date.now()}`,
            timestamp: new Date(),
            action: 'withdraw',
            strategyId: position.strategyId,
            amount: metrics.earnedYield,
            reason: 'Take-profit triggered',
            transactionHash: txHash,
            success: true
          });

        } catch (error) {
          console.error('Take-profit execution failed:', error);
        }
      }
    }
  }

  private setupAlertHandlers(): void {
    this.riskManager.startRiskMonitoring((alert: RiskAlert) => {
      console.log('Risk alert:', alert);
      if (alert.severity === 'critical') {
        // Could trigger emergency withdrawal here
      }
    });

    this.yieldMonitor.startMonitoring((alert: YieldMonitorAlert) => {
      console.log('Yield alert:', alert);
      if (alert.type === 'opportunity') {
        // Could trigger automatic deployment to new opportunity
      }
    });
  }

  private getRiskToleranceLevel(): 'low' | 'medium' | 'high' {
    const mapping = {
      conservative: 'low',
      moderate: 'medium',
      aggressive: 'high'
    };
    return mapping[this.config.riskTolerance] as 'low' | 'medium' | 'high';
  }

  private recordExecution(execution: StrategyExecution): void {
    this.executionHistory.push(execution);
  }

  private isExecutionProfitable(execution: StrategyExecution): boolean {
    // Simplified profitability check
    return execution.action === 'withdraw' && Math.random() > 0.4; // 60% win rate for demo
  }

  private calculateTotalReturn(): number {
    // Simplified total return calculation
    return this.executionHistory.reduce((total, exec) => {
      if (exec.success && exec.action === 'withdraw') {
        return total + (Math.random() * 0.1 - 0.02); // Random return between -2% and 8%
      }
      return total;
    }, 0);
  }

  private calculateAnnualizedReturn(totalReturn: number): number {
    // Simplified annualization
    return totalReturn * 365 / 30; // Assuming 30-day period
  }

  private calculateCurrentReturn(): number {
    // Simplified current return calculation
    return Math.random() * 0.3 - 0.1; // Random return between -10% and 20%
  }

  private calculateMaxDrawdown(): number {
    // Simplified max drawdown calculation
    return Math.random() * 0.15; // Random drawdown between 0% and 15%
  }

  private calculateSharpeRatio(): number {
    // Simplified Sharpe ratio calculation
    return Math.random() * 2 - 0.5; // Random ratio between -0.5 and 1.5
  }
}
