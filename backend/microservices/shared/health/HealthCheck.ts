export interface HealthCheckResult {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  name: string;
  latency?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface HealthCheckResponse {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  service: string;
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
  metrics?: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

export interface HealthCheckConfig {
  name: string;
  check: () => Promise<HealthCheckResult>;
  interval?: number;
  timeout?: number;
  critical?: boolean;
}

export class HealthCheck {
  private checks: Map<string, HealthCheckConfig> = new Map();
  private results: Map<string, HealthCheckResult> = new Map();
  private serviceName: string;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  register(config: HealthCheckConfig): void {
    this.checks.set(config.name, config);
    console.log(`Health check registered: ${config.name}`);
  }

  unregister(name: string): void {
    this.checks.delete(name);
    this.results.delete(name);
    console.log(`Health check unregistered: ${name}`);
  }

  async executeCheck(name: string): Promise<HealthCheckResult> {
    const config = this.checks.get(name);
    if (!config) {
      return {
        status: 'DOWN',
        name,
        error: 'Health check not found'
      };
    }

    try {
      const startTime = Date.now();
      
      const timeoutPromise = new Promise<HealthCheckResult>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), config.timeout || 5000);
      });

      const result = await Promise.race([config.check(), timeoutPromise]);
      const latency = Date.now() - startTime;

      this.results.set(name, {
        ...result,
        latency
      });

      return this.results.get(name)!;
    } catch (error) {
      const errorResult: HealthCheckResult = {
        status: 'DOWN',
        name,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      this.results.set(name, errorResult);
      return errorResult;
    }
  }

  async executeAllChecks(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};

    for (const [name] of this.checks) {
      results[name] = await this.executeCheck(name);
    }

    return results;
  }

  async getHealth(): Promise<HealthCheckResponse> {
    const checks = await this.executeAllChecks();
    
    const checkArray = Object.values(checks);
    const criticalChecks = checkArray.filter(c => {
      const config = this.checks.get(c.name);
      return config?.critical;
    });

    let overallStatus: 'UP' | 'DOWN' | 'DEGRADED' = 'UP';

    // If any critical check is down, service is down
    if (criticalChecks.some(c => c.status === 'DOWN')) {
      overallStatus = 'DOWN';
    } 
    // If any non-critical check is down, service is degraded
    else if (checkArray.some(c => c.status === 'DOWN')) {
      overallStatus = 'DEGRADED';
    }

    return {
      status: overallStatus,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      checks,
      metrics: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };
  }

  startPeriodicChecks(intervalMs: number = 30000): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      await this.executeAllChecks();
    }, intervalMs);

    console.log(`Periodic health checks started (interval: ${intervalMs}ms)`);
  }

  stopPeriodicChecks(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Periodic health checks stopped');
    }
  }

  getCheckResults(): Map<string, HealthCheckResult> {
    return new Map(this.results);
  }
}

// Pre-built health check functions
export const HealthCheckFunctions = {
  database: async (queryFn: () => Promise<any>): Promise<HealthCheckResult> => {
    try {
      const startTime = Date.now();
      await queryFn();
      const latency = Date.now() - startTime;
      
      return {
        status: 'UP',
        name: 'database',
        latency
      };
    } catch (error) {
      return {
        status: 'DOWN',
        name: 'database',
        error: error instanceof Error ? error.message : 'Database connection failed'
      };
    }
  },

  messageBroker: async (connectionFn: () => Promise<any>): Promise<HealthCheckResult> => {
    try {
      const startTime = Date.now();
      await connectionFn();
      const latency = Date.now() - startTime;
      
      return {
        status: 'UP',
        name: 'messageBroker',
        latency
      };
    } catch (error) {
      return {
        status: 'DOWN',
        name: 'messageBroker',
        error: error instanceof Error ? error.message : 'Message broker connection failed'
      };
    }
  },

  redis: async (pingFn: () => Promise<any>): Promise<HealthCheckResult> => {
    try {
      const startTime = Date.now();
      await pingFn();
      const latency = Date.now() - startTime;
      
      return {
        status: 'UP',
        name: 'redis',
        latency
      };
    } catch (error) {
      return {
        status: 'DOWN',
        name: 'redis',
        error: error instanceof Error ? error.message : 'Redis connection failed'
      };
    }
  },

  externalService: async (url: string): Promise<HealthCheckResult> => {
    try {
      const startTime = Date.now();
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      const latency = Date.now() - startTime;
      
      return {
        status: response.ok ? 'UP' : 'DOWN',
        name: 'externalService',
        latency,
        metadata: { url, statusCode: response.status }
      };
    } catch (error) {
      return {
        status: 'DOWN',
        name: 'externalService',
        error: error instanceof Error ? error.message : 'External service check failed',
        metadata: { url }
      };
    }
  },

  diskSpace: async (path: string, thresholdPercent: number = 90): Promise<HealthCheckResult> => {
    try {
      // This would use a library like 'systeminformation' in production
      // For now, return a mock implementation
      const usagePercent = Math.random() * 100;
      
      return {
        status: usagePercent < thresholdPercent ? 'UP' : 'DOWN',
        name: 'diskSpace',
        metadata: { path, usagePercent: usagePercent.toFixed(2), thresholdPercent }
      };
    } catch (error) {
      return {
        status: 'DOWN',
        name: 'diskSpace',
        error: error instanceof Error ? error.message : 'Disk space check failed'
      };
    }
  },

  memory: async (thresholdPercent: number = 90): Promise<HealthCheckResult> => {
    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = memoryUsage.heapTotal;
      const usedMemory = memoryUsage.heapUsed;
      const usagePercent = (usedMemory / totalMemory) * 100;
      
      return {
        status: usagePercent < thresholdPercent ? 'UP' : 'DOWN',
        name: 'memory',
        metadata: { 
          usagePercent: usagePercent.toFixed(2),
          usedMemory: `${(usedMemory / 1024 / 1024).toFixed(2)} MB`,
          totalMemory: `${(totalMemory / 1024 / 1024).toFixed(2)} MB`,
          thresholdPercent 
        }
      };
    } catch (error) {
      return {
        status: 'DOWN',
        name: 'memory',
        error: error instanceof Error ? error.message : 'Memory check failed'
      };
    }
  },

  custom: async (name: string, checkFn: () => Promise<any>): Promise<HealthCheckResult> => {
    try {
      const startTime = Date.now();
      await checkFn();
      const latency = Date.now() - startTime;
      
      return {
        status: 'UP',
        name,
        latency
      };
    } catch (error) {
      return {
        status: 'DOWN',
        name,
        error: error instanceof Error ? error.message : 'Custom check failed'
      };
    }
  }
};

// Express middleware for health check endpoint
export function createHealthCheckMiddleware(healthCheck: HealthCheck) {
  return async (req: any, res: any) => {
    const health = await healthCheck.getHealth();
    const statusCode = health.status === 'UP' ? 200 : health.status === 'DEGRADED' ? 200 : 503;
    res.status(statusCode).json(health);
  };
}

// Liveness probe (is the service running?)
export function createLivenessMiddleware(healthCheck: HealthCheck) {
  return async (req: any, res: any) => {
    res.status(200).json({ status: 'UP' });
  };
}

// Readiness probe (is the service ready to accept traffic?)
export function createReadinessMiddleware(healthCheck: HealthCheck) {
  return async (req: any, res: any) => {
    const health = await healthCheck.getHealth();
    const statusCode = health.status === 'UP' ? 200 : 503;
    res.status(statusCode).json({ status: health.status });
  };
}
