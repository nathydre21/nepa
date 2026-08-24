/**
 * databases/ConnectionPoolManager.ts
 *
 * Manages Prisma database connection pools across all backend services.
 *
 * Key capabilities:
 *  - Usage-pattern-based pool sizing (auto-scale up/down based on rolling
 *    utilisation and p95 response time)
 *  - Per-service connection timeout enforcement
 *  - Rich performance monitoring (rolling window metrics, percentiles, alerts)
 */

import {
  userClient,
  notificationClient,
  documentClient,
  utilityClient,
  paymentClient,
  billingClient,
  analyticsClient,
  webhookClient,
} from './clients';

// ─── Configuration ─────────────────────────────────────────────────────────────

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  /** How long (ms) to wait for a connection before giving up. */
  connectionTimeoutMs: number;
  /** How long (ms) an idle connection lives before being closed. */
  idleTimeoutMs: number;
  /** Interval (ms) between scheduled health checks. */
  healthCheckIntervalMs: number;
  /** Utilisation ratio (0–1) above which the pool is scaled up. Default 0.85 */
  scaleUpThreshold: number;
  /** Utilisation ratio (0–1) below which the pool is scaled down. Default 0.30 */
  scaleDownThreshold: number;
  /** p95 response-time ceiling (ms) before the pool is marked degraded. Default 800 */
  degradedResponseTimeMs: number;
  /** Absolute maximum connections regardless of auto-scaling. Default 100 */
  hardMaxConnections: number;
}

// ─── Stats / Results ───────────────────────────────────────────────────────────

export interface PoolStats {
  serviceName: string;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  avgResponseTime: number;
  /** p95 response time from the rolling metrics window. */
  p95ResponseTime: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: Date;
  /** Current utilisation as a 0–100 percentage. */
  utilizationPct: number;
  /** How many times the pool has been auto-scaled since startup. */
  resizeCount: number;
}

export interface HealthCheckResult {
  serviceName: string;
  isHealthy: boolean;
  responseTime: number;
  error?: string;
  timedOut?: boolean;
}

/** Aggregated performance metrics for a single service. */
export interface ServicePerformanceMetrics {
  avg: number;
  min: number;
  max: number;
  p95: number;
  samples: number;
  /** Samples collected in the last `windowMs` milliseconds. */
  recentSamples: number;
  /** Alert: true when p95 exceeds the configured `degradedResponseTimeMs`. */
  slowQueryAlert: boolean;
}

// ─── Internal bookkeeping ──────────────────────────────────────────────────────

interface TimestampedMetric {
  responseTime: number;
  timestamp: number; // epoch ms
}

interface ServiceState {
  config: PoolConfig;
  metrics: TimestampedMetric[];
  resizeCount: number;
  /** Running utilisation samples used for trend-based scaling decisions. */
  utilizationHistory: number[];
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: PoolConfig = {
  minConnections: 2,
  maxConnections: 20,
  connectionTimeoutMs: 30_000,
  idleTimeoutMs: 300_000,
  healthCheckIntervalMs: 60_000,
  scaleUpThreshold: 0.85,
  scaleDownThreshold: 0.30,
  degradedResponseTimeMs: 800,
  hardMaxConnections: 100,
};

/** Rolling window kept for performance metrics (5 minutes). */
const METRICS_WINDOW_MS = 5 * 60 * 1_000;
/** Maximum samples retained per service regardless of age. */
const MAX_METRICS_SAMPLES = 500;
/** Number of recent utilisation samples used for scaling decisions. */
const UTILISATION_HISTORY_SIZE = 10;

// ─── Service registry ──────────────────────────────────────────────────────────

const CLIENT_MAP = {
  'user-service': userClient,
  'notification-service': notificationClient,
  'document-service': documentClient,
  'utility-service': utilityClient,
  'payment-service': paymentClient,
  'billing-service': billingClient,
  'analytics-service': analyticsClient,
  'webhook-service': webhookClient,
} as const;

type ServiceName = keyof typeof CLIENT_MAP;
const SERVICE_NAMES = Object.keys(CLIENT_MAP) as ServiceName[];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Calculate the p-th percentile of a sorted numeric array (ascending). */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

/** Clamp a number between min and max inclusive. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Promise that rejects after `ms` milliseconds with a timeout error. */
function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Connection timeout after ${ms}ms`)), ms)
  );
}

// ─── Main class ────────────────────────────────────────────────────────────────

export class ConnectionPoolManager {
  /** Per-service state (config + rolling metrics + resize counter). */
  private readonly state = new Map<string, ServiceState>();

  /** Active setInterval handles for health monitoring. */
  private readonly healthCheckIntervals = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.initializeServices();
  }

  // ── Initialisation ──────────────────────────────────────────────────────────

  private initializeServices(): void {
    for (const name of SERVICE_NAMES) {
      this.state.set(name, {
        config: { ...DEFAULT_CONFIG },
        metrics: [],
        resizeCount: 0,
        utilizationHistory: [],
      });
    }
  }

  private getState(serviceName: string): ServiceState {
    const s = this.state.get(serviceName);
    if (!s) throw new Error(`Unknown service: ${serviceName}`);
    return s;
  }

  // ── Client access with timeout ──────────────────────────────────────────────

  /**
   * Retrieve the Prisma client for `serviceName`, recording a performance
   * sample and enforcing the configured connection timeout.
   */
  async getServiceClient(serviceName: string): Promise<any> {
    const client = CLIENT_MAP[serviceName as ServiceName];
    if (!client) throw new Error(`Unknown service: ${serviceName}`);

    const { config } = this.getState(serviceName);
    const start = Date.now();

    try {
      // Enforce connection timeout: health check must complete within the limit.
      await Promise.race([
        this.performHealthCheck(serviceName),
        rejectAfter(config.connectionTimeoutMs),
      ]);

      return client;
    } finally {
      this.recordMetric(serviceName, Date.now() - start);
    }
  }

  // ── Metrics recording ───────────────────────────────────────────────────────

  private recordMetric(serviceName: string, responseTime: number): void {
    const s = this.state.get(serviceName);
    if (!s) return;

    const now = Date.now();
    s.metrics.push({ responseTime, timestamp: now });

    // 1. Evict samples outside the rolling window.
    const cutoff = now - METRICS_WINDOW_MS;
    s.metrics = s.metrics.filter(m => m.timestamp >= cutoff);

    // 2. Hard cap to avoid unbounded growth during very high throughput.
    if (s.metrics.length > MAX_METRICS_SAMPLES) {
      s.metrics.splice(0, s.metrics.length - MAX_METRICS_SAMPLES);
    }
  }

  // ── Health check ────────────────────────────────────────────────────────────

  /**
   * Probe a single service with a lightweight SQL round-trip.
   * Returns the result even on failure (never throws).
   */
  async performHealthCheck(serviceName: string): Promise<HealthCheckResult> {
    const start = Date.now();

    // Guard against infinite recursion: use the raw client directly here
    // instead of going through getServiceClient().
    const client = CLIENT_MAP[serviceName as ServiceName];
    if (!client) {
      return { serviceName, isHealthy: false, responseTime: 0, error: `Unknown service: ${serviceName}` };
    }

    try {
      await (client as any).$queryRaw`SELECT 1`;
      return { serviceName, isHealthy: true, responseTime: Date.now() - start };
    } catch (err) {
      const isTimeout = err instanceof Error && err.message.includes('timeout');
      return {
        serviceName,
        isHealthy: false,
        responseTime: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
        timedOut: isTimeout,
      };
    }
  }

  /** Health-check every registered service concurrently. */
  async getAllHealthChecks(): Promise<HealthCheckResult[]> {
    return Promise.all(SERVICE_NAMES.map(s => this.performHealthCheck(s)));
  }

  // ── Pool statistics ─────────────────────────────────────────────────────────

  /**
   * Return live pool statistics for a single service, including real
   * connection counts queried from `pg_stat_activity`.
   */
  async getPoolStats(serviceName: string): Promise<PoolStats> {
    const s = this.getState(serviceName);
    const healthCheck = await this.performHealthCheck(serviceName);

    // ── Connection counts ──
    let activeConnections = 0;
    let idleConnections = 0;
    let totalConnections = 0;

    try {
      const client = CLIENT_MAP[serviceName as ServiceName] as any;
      const result = await client.$queryRaw<any[]>`
        SELECT
          count(*) FILTER (WHERE state = 'active') AS active,
          count(*) FILTER (WHERE state = 'idle')   AS idle,
          count(*)                                  AS total
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
      const row = result[0];
      activeConnections = Number(row?.active) || 0;
      idleConnections   = Number(row?.idle)   || 0;
      totalConnections  = Number(row?.total)  || 0;
    } catch {
      // pg_stat_activity may be unavailable in some environments; carry on.
    }

    // ── Derived metrics ──
    const times = s.metrics.map(m => m.responseTime).sort((a, b) => a - b);
    const avg   = times.length ? times.reduce((x, y) => x + y, 0) / times.length : 0;
    const p95   = percentile(times, 95);

    const utilizationPct = s.config.maxConnections > 0
      ? Math.round((totalConnections / s.config.maxConnections) * 100)
      : 0;

    // Track utilisation for trend-based scaling.
    s.utilizationHistory.push(utilizationPct);
    if (s.utilizationHistory.length > UTILISATION_HISTORY_SIZE) {
      s.utilizationHistory.shift();
    }

    // ── Health status ──
    let healthStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (!healthCheck.isHealthy) {
      healthStatus = 'unhealthy';
    } else if (
      p95 > s.config.degradedResponseTimeMs ||
      totalConnections > s.config.maxConnections * s.config.scaleUpThreshold
    ) {
      healthStatus = 'degraded';
    } else {
      healthStatus = 'healthy';
    }

    return {
      serviceName,
      totalConnections,
      activeConnections,
      idleConnections,
      waitingRequests: 0,
      avgResponseTime: Math.round(avg),
      p95ResponseTime: p95,
      healthStatus,
      lastHealthCheck: new Date(),
      utilizationPct,
      resizeCount: s.resizeCount,
    };
  }

  /** Return pool statistics for every service concurrently. */
  async getAllPoolStats(): Promise<PoolStats[]> {
    return Promise.all(SERVICE_NAMES.map(s => this.getPoolStats(s)));
  }

  // ── Configuration management ────────────────────────────────────────────────

  /** Partially update a service's pool configuration at runtime. */
  updatePoolConfig(serviceName: string, patch: Partial<PoolConfig>): void {
    const s = this.state.get(serviceName);
    if (!s) return; // silently ignore unknown services (matches existing behaviour)
    s.config = { ...s.config, ...patch };
  }

  // ── Usage-pattern-based auto-scaling ───────────────────────────────────────

  /**
   * Inspect recent utilisation trends for every service and adjust
   * `maxConnections` up or down accordingly.
   *
   * Scaling rules:
   *  - Scale UP  when the *average* utilisation over the history window
   *              exceeds `scaleUpThreshold` (default 85 %).
   *  - Scale DOWN when the *average* utilisation is below `scaleDownThreshold`
   *              (default 30 %) AND the current max is above the default.
   *
   * A 20 % headroom factor is added on scale-up so the pool isn't
   * immediately under pressure again.
   */
  async autoResizePools(): Promise<void> {
    const allStats = await this.getAllPoolStats();

    for (const stat of allStats) {
      const s = this.state.get(stat.serviceName);
      if (!s) continue;

      const { config } = s;
      const history = s.utilizationHistory;
      if (history.length < 2) continue; // not enough data yet

      const avgUtilisation = history.reduce((a, b) => a + b, 0) / history.length;

      if (avgUtilisation / 100 >= config.scaleUpThreshold) {
        // ── Scale up ──
        const desired = Math.round(config.maxConnections * 1.2); // +20 % headroom
        const newMax  = clamp(desired, config.maxConnections + 1, config.hardMaxConnections);

        if (newMax !== config.maxConnections) {
          this.updatePoolConfig(stat.serviceName, { maxConnections: newMax });
          s.resizeCount++;
          console.log(
            `[PoolManager] ↑ ${stat.serviceName}: maxConnections ${config.maxConnections} → ${newMax}` +
            ` (avg utilisation ${avgUtilisation.toFixed(1)} %)`
          );
        }
      } else if (avgUtilisation / 100 <= config.scaleDownThreshold && config.maxConnections > DEFAULT_CONFIG.maxConnections) {
        // ── Scale down ──
        const desired = Math.round(config.maxConnections * 0.8); // -20 %
        const newMax  = clamp(desired, DEFAULT_CONFIG.maxConnections, config.maxConnections - 1);

        if (newMax !== config.maxConnections) {
          this.updatePoolConfig(stat.serviceName, { maxConnections: newMax });
          s.resizeCount++;
          console.log(
            `[PoolManager] ↓ ${stat.serviceName}: maxConnections ${config.maxConnections} → ${newMax}` +
            ` (avg utilisation ${avgUtilisation.toFixed(1)} %)`
          );
        }
      }
    }
  }

  // ── Health monitoring ───────────────────────────────────────────────────────

  /**
   * Start a periodic background loop that:
   *  1. Health-checks all services.
   *  2. Logs any unhealthy services.
   *  3. Emits performance alerts when p95 response times cross the threshold.
   *  4. Calls `autoResizePools()` to keep pool sizes in line with demand.
   */
  startHealthMonitoring(intervalMs: number = DEFAULT_CONFIG.healthCheckIntervalMs): void {
    console.log(`[PoolManager] Starting health monitoring (interval: ${intervalMs}ms)`);

    // Clear any existing intervals first.
    this.stopHealthMonitoring();

    const tick = setInterval(async () => {
      try {
        await this.runMonitoringCycle();
      } catch (err) {
        console.error('[PoolManager] Health monitoring error:', err);
      }
    }, intervalMs);

    this.healthCheckIntervals.set('global', tick);
  }

  /** Single monitoring cycle — exposed so it can be called imperatively too. */
  async runMonitoringCycle(): Promise<void> {
    const [healthChecks, perfMetrics] = await Promise.all([
      this.getAllHealthChecks(),
      this.getPerformanceMetrics(),
    ]);

    // Report unhealthy services.
    const unhealthy = healthChecks.filter(h => !h.isHealthy);
    if (unhealthy.length > 0) {
      console.warn('[PoolManager] Unhealthy services:', unhealthy.map(h => ({
        service: h.serviceName,
        error: h.error,
        timedOut: h.timedOut,
      })));
    }

    // Report slow-query alerts.
    for (const [service, m] of Object.entries(perfMetrics)) {
      if (m.slowQueryAlert) {
        console.warn(
          `[PoolManager] Slow-query alert on ${service}: ` +
          `p95=${m.p95}ms (threshold: ${this.state.get(service)?.config.degradedResponseTimeMs}ms)`
        );
      }
    }

    await this.autoResizePools();
  }

  stopHealthMonitoring(): void {
    this.healthCheckIntervals.forEach(i => clearInterval(i));
    this.healthCheckIntervals.clear();
    console.log('[PoolManager] Health monitoring stopped');
  }

  // ── Performance metrics ─────────────────────────────────────────────────────

  /**
   * Return aggregated performance metrics for all services.
   * Metrics are computed from the rolling 5-minute window only.
   */
  getPerformanceMetrics(): Record<string, ServicePerformanceMetrics> {
    const result: Record<string, ServicePerformanceMetrics> = {};
    const now = Date.now();
    const recentCutoff = now - 60_000; // last 60 s = "recent"

    for (const [serviceName, s] of this.state.entries()) {
      const all    = s.metrics.map(m => m.responseTime);
      const recent = s.metrics.filter(m => m.timestamp >= recentCutoff).map(m => m.responseTime);

      if (all.length === 0) {
        result[serviceName] = { avg: 0, min: 0, max: 0, p95: 0, samples: 0, recentSamples: 0, slowQueryAlert: false };
        continue;
      }

      const sorted = [...all].sort((a, b) => a - b);
      const avg    = Math.round(all.reduce((x, y) => x + y, 0) / all.length);
      const p95    = percentile(sorted, 95);

      result[serviceName] = {
        avg,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95,
        samples: all.length,
        recentSamples: recent.length,
        slowQueryAlert: p95 > s.config.degradedResponseTimeMs,
      };
    }

    return result;
  }

  // ── Reporting ───────────────────────────────────────────────────────────────

  /** Print a formatted summary of pool stats and performance to the console. */
  async logDetailedStats(): Promise<void> {
    const [stats, perfMetrics] = await Promise.all([
      this.getAllPoolStats(),
      this.getPerformanceMetrics(),
    ]);

    console.log('\n[PoolManager] ── Pool Statistics ─────────────────────────');
    console.table(
      stats.map(s => ({
        service: s.serviceName,
        total: s.totalConnections,
        active: s.activeConnections,
        idle: s.idleConnections,
        utilPct: `${s.utilizationPct}%`,
        status: s.healthStatus,
        resizes: s.resizeCount,
      }))
    );

    console.log('\n[PoolManager] ── Performance Metrics (ms) ───────────────');
    console.table(
      Object.entries(perfMetrics).map(([svc, m]) => ({
        service: svc,
        avg: m.avg,
        min: m.min,
        max: m.max,
        p95: m.p95,
        samples: m.samples,
        recentSamples: m.recentSamples,
        alert: m.slowQueryAlert ? '⚠ slow' : 'ok',
      }))
    );
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  /** Stop monitoring and gracefully disconnect every Prisma client. */
  async cleanup(): Promise<void> {
    this.stopHealthMonitoring();

    await Promise.all(
      Object.values(CLIENT_MAP).map(client =>
        client ? (client as any).$disconnect().catch(console.error) : Promise.resolve()
      )
    );

    console.log('[PoolManager] Cleanup complete');
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────

export default new ConnectionPoolManager();
