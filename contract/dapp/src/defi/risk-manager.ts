import { Asset, LiquidityPoolId } from '@stellar/stellar-sdk';
import { RiskMetrics, YieldPosition } from './yield-manager';

export interface RiskThreshold {
  maxVolatility: number;
  minLiquidity: bigint;
  maxImpermanentLoss: number;
  maxConcentration: number;
  maxDrawdown: number;
}

export interface RiskAlert {
  id: string;
  type: 'volatility' | 'liquidity' | 'impermanent_loss' | 'concentration' | 'drawdown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  poolId?: LiquidityPoolId;
  asset?: Asset;
  currentValue: number;
  threshold: number;
}

export interface PortfolioRisk {
  overallRisk: 'low' | 'medium' | 'high';
  diversificationScore: number;
  concentrationRisk: number;
  liquidityRisk: number;
  marketRisk: number;
  smartContractRisk: number;
  recommendations: string[];
}

export class RiskManager {
  private thresholds: RiskThreshold;
  private alerts: RiskAlert[] = [];
  private monitoringInterval: any = null;

  constructor(thresholds?: Partial<RiskThreshold>) {
    this.thresholds = {
      maxVolatility: 0.15,
      minLiquidity: BigInt(1000000), // 0.1 XLM
      maxImpermanentLoss: 0.10,
      maxConcentration: 0.40, // 40% max in single pool
      maxDrawdown: 0.20, // 20% max drawdown
      ...thresholds
    };
  }

  startRiskMonitoring(callback: (alert: RiskAlert) => void): void {
    this.monitoringInterval = setInterval(async () => {
      const newAlerts = await this.performRiskAssessment();
      newAlerts.forEach(alert => {
        this.alerts.push(alert);
        callback(alert);
      });
    }, 60000); // Check every minute
  }

  stopRiskMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  async assessRisk(metrics: RiskMetrics, poolId?: LiquidityPoolId): Promise<RiskAlert[]> {
    const alerts: RiskAlert[] = [];

    if (metrics.volatility > this.thresholds.maxVolatility) {
      alerts.push({
        id: `volatility-${Date.now()}`,
        type: 'volatility',
        severity: this.getSeverity(metrics.volatility, this.thresholds.maxVolatility),
        message: `Volatility (${(metrics.volatility * 100).toFixed(2)}%) exceeds threshold (${(this.thresholds.maxVolatility * 100).toFixed(2)}%)`,
        timestamp: new Date(),
        poolId,
        currentValue: metrics.volatility,
        threshold: this.thresholds.maxVolatility
      });
    }

    if (metrics.liquidityDepth < this.thresholds.minLiquidity) {
      alerts.push({
        id: `liquidity-${Date.now()}`,
        type: 'liquidity',
        severity: this.getSeverity(Number(metrics.liquidityDepth), Number(this.thresholds.minLiquidity), true),
        message: `Liquidity depth (${Number(metrics.liquidityDepth)}) below minimum (${Number(this.thresholds.minLiquidity)})`,
        timestamp: new Date(),
        poolId,
        currentValue: Number(metrics.liquidityDepth),
        threshold: Number(this.thresholds.minLiquidity)
      });
    }

    if (metrics.impermanentLoss > this.thresholds.maxImpermanentLoss) {
      alerts.push({
        id: `il-${Date.now()}`,
        type: 'impermanent_loss',
        severity: this.getSeverity(metrics.impermanentLoss, this.thresholds.maxImpermanentLoss),
        message: `Impermanent loss (${(metrics.impermanentLoss * 100).toFixed(2)}%) exceeds threshold (${(this.thresholds.maxImpermanentLoss * 100).toFixed(2)}%)`,
        timestamp: new Date(),
        poolId,
        currentValue: metrics.impermanentLoss,
        threshold: this.thresholds.maxImpermanentLoss
      });
    }

    return alerts;
  }

  async assessPortfolioRisk(
    positions: Array<{ amount: bigint; asset: Asset; poolId: LiquidityPoolId }>,
    totalValue: bigint
  ): Promise<PortfolioRisk> {
    const concentrationRisk = this.calculateConcentrationRisk(positions, totalValue);
    const diversificationScore = this.calculateDiversificationScore(positions);
    const liquidityRisk = await this.calculatePortfolioLiquidityRisk(positions);
    const marketRisk = await this.calculateMarketRisk(positions);
    const smartContractRisk = this.calculateSmartContractRisk(positions);

    const overallRisk = this.calculateOverallRisk([
      concentrationRisk,
      liquidityRisk,
      marketRisk,
      smartContractRisk
    ]);

    const recommendations = this.generateRecommendations({
      concentrationRisk,
      diversificationScore,
      liquidityRisk,
      marketRisk,
      smartContractRisk
    });

    return {
      overallRisk,
      diversificationScore,
      concentrationRisk,
      liquidityRisk,
      marketRisk,
      smartContractRisk,
      recommendations
    };
  }

  getAlerts(severity?: 'low' | 'medium' | 'high' | 'critical'): RiskAlert[] {
    if (severity) {
      return this.alerts.filter(alert => alert.severity === severity);
    }
    return [...this.alerts];
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  updateThresholds(newThresholds: Partial<RiskThreshold>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }

  getThresholds(): RiskThreshold {
    return { ...this.thresholds };
  }

  private async performRiskAssessment(): Promise<RiskAlert[]> {
    // This would typically fetch real-time data from multiple pools
    // For now, return empty array - in production would monitor all active positions
    return [];
  }

  private getSeverity(
    current: number,
    threshold: number,
    inverse: boolean = false
  ): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = inverse ? threshold / current : current / threshold;

    if (ratio >= 2) return 'critical';
    if (ratio >= 1.5) return 'high';
    if (ratio >= 1.2) return 'medium';
    return 'low';
  }

  private calculateConcentrationRisk(
    positions: Array<{ amount: bigint; asset: Asset; poolId: LiquidityPoolId }>,
    totalValue: bigint
  ): number {
    if (totalValue === BigInt(0)) return 0;

    const maxPosition = Math.max(...positions.map(p => Number(p.amount)));
    return maxPosition / Number(totalValue);
  }

  private calculateDiversificationScore(
    positions: Array<{ amount: bigint; asset: Asset; poolId: LiquidityPoolId }>
  ): number {
    if (positions.length === 0) return 0;
    if (positions.length === 1) return 0;

    const uniqueAssets = new Set(positions.map(p => p.asset.toString())).size;
    const uniquePools = new Set(positions.map(p => p.poolId.toString())).size;

    // Score based on asset and pool diversification
    return (uniqueAssets / positions.length + uniquePools / positions.length) / 2;
  }

  private async calculatePortfolioLiquidityRisk(
    positions: Array<{ amount: bigint; asset: Asset; poolId: LiquidityPoolId }>
  ): Promise<number> {
    // Simplified calculation - in reality would fetch real liquidity data
    return Math.random() * 0.3; // 0% to 30% liquidity risk
  }

  private async calculateMarketRisk(
    positions: Array<{ amount: bigint; asset: Asset; poolId: LiquidityPoolId }>
  ): Promise<number> {
    // Simplified calculation - in reality would analyze market conditions
    return Math.random() * 0.4; // 0% to 40% market risk
  }

  private calculateSmartContractRisk(
    positions: Array<{ amount: bigint; asset: Asset; poolId: LiquidityPoolId }>
  ): number {
    // Simplified calculation - in reality would assess contract audits, age, etc.
    return 0.1; // 10% smart contract risk (assumed low for established protocols)
  }

  private calculateOverallRisk(riskFactors: number[]): 'low' | 'medium' | 'high' {
    const avgRisk = riskFactors.reduce((sum, risk) => sum + risk, 0) / riskFactors.length;

    if (avgRisk <= 0.2) return 'low';
    if (avgRisk <= 0.4) return 'medium';
    return 'high';
  }

  private generateRecommendations(risks: {
    concentrationRisk: number;
    diversificationScore: number;
    liquidityRisk: number;
    marketRisk: number;
    smartContractRisk: number;
  }): string[] {
    const recommendations: string[] = [];

    if (risks.concentrationRisk > this.thresholds.maxConcentration) {
      recommendations.push('Consider diversifying across multiple pools to reduce concentration risk');
    }

    if (risks.diversificationScore < 0.5) {
      recommendations.push('Increase diversification by adding assets from different pools');
    }

    if (risks.liquidityRisk > 0.3) {
      recommendations.push('Some positions have low liquidity - consider reducing exposure or monitoring closely');
    }

    if (risks.marketRisk > 0.35) {
      recommendations.push('Market conditions are volatile - consider reducing risk exposure');
    }

    if (risks.smartContractRisk > 0.2) {
      recommendations.push('Review smart contract audits and consider using more established protocols');
    }

    if (recommendations.length === 0) {
      recommendations.push('Risk levels are within acceptable thresholds');
    }

    return recommendations;
  }
}
