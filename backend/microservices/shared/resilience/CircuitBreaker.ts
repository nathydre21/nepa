import { EventEmitter } from 'events';

export interface CircuitBreakerConfig {
  timeout: number;              // Request timeout in ms
  errorThresholdPercentage: number; // Error threshold to open circuit
  resetTimeout: number;        // Time before attempting to close circuit
  rollingCountTimeout: number; // Time window for error calculation
  rollingCountBuckets: number; // Number of buckets in rolling window
  volumeThreshold: number;     // Minimum requests before circuit can open
}

export interface CircuitBreakerState {
  closed: boolean;
  open: boolean;
  halfOpen: boolean;
}

export interface CircuitBreakerStats {
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  failureRate: number;
  state: CircuitBreakerState;
}

type FallbackFunction<T> = (...args: any[]) => T | Promise<T>;

export class CircuitBreaker extends EventEmitter {
  private config: CircuitBreakerConfig;
  private state: 'closed' | 'open' | 'halfOpen' = 'closed';
  private stats = {
    totalRequests: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    rollingBuckets: new Array<number>(this.config.rollingCountBuckets).fill(0)
  };
  private nextAttemptTime = 0;
  private rollingBucketIndex = 0;
  private lastBucketTime = Date.now();

  constructor(
    private action: (...args: any[]) => Promise<any>,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    super();
    
    this.config = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      volumeThreshold: 10,
      ...config
    };

    this.startRollingBucketTimer();
  }

  async fire<T>(...args: any[]): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttemptTime) {
        this.emit('reject');
        throw new Error('Circuit breaker is OPEN');
      }
      this.transitionToHalfOpen();
    }

    try {
      const result = await this.executeWithTimeout(this.action(...args));
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  async executeWithTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), this.config.timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private onSuccess(): void {
    this.stats.totalSuccesses++;
    this.stats.totalRequests++;
    this.recordSuccess();

    if (this.state === 'halfOpen') {
      this.transitionToClosed();
    }

    this.emit('success');
  }

  private onFailure(): void {
    this.stats.totalFailures++;
    this.stats.totalRequests++;
    this.recordFailure();

    if (this.shouldOpenCircuit()) {
      this.transitionToOpen();
    }

    this.emit('failure');
  }

  private recordSuccess(): void {
    this.updateRollingBucket(0);
  }

  private recordFailure(): void {
    this.updateRollingBucket(1);
  }

  private updateRollingBucket(value: number): void {
    this.stats.rollingBuckets[this.rollingBucketIndex] = value;
  }

  private startRollingBucketTimer(): void {
    const bucketDuration = this.config.rollingCountTimeout / this.config.rollingCountBuckets;

    setInterval(() => {
      this.rollingBucketIndex = (this.rollingBucketIndex + 1) % this.config.rollingCountBuckets;
      this.stats.rollingBuckets[this.rollingBucketIndex] = 0;
      this.lastBucketTime = Date.now();
    }, bucketDuration);
  }

  private getRollingFailureCount(): number {
    return this.stats.rollingBuckets.reduce((sum, bucket) => sum + bucket, 0);
  }

  private getRollingRequestCount(): number {
    return this.stats.rollingBuckets.length;
  }

  private shouldOpenCircuit(): boolean {
    const failureCount = this.getRollingFailureCount();
    const requestCount = this.getRollingRequestCount();

    if (requestCount < this.config.volumeThreshold) {
      return false;
    }

    const failureRate = (failureCount / requestCount) * 100;
    return failureRate >= this.config.errorThresholdPercentage;
  }

  private transitionToOpen(): void {
    this.state = 'open';
    this.nextAttemptTime = Date.now() + this.config.resetTimeout;
    this.emit('open');
  }

  private transitionToHalfOpen(): void {
    this.state = 'halfOpen';
    this.emit('halfOpen');
  }

  private transitionToClosed(): void {
    this.state = 'closed';
    this.emit('close');
  }

  getState(): 'closed' | 'open' | 'halfOpen' {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    const failureCount = this.getRollingFailureCount();
    const requestCount = this.getRollingRequestCount();
    const failureRate = requestCount > 0 ? (failureCount / requestCount) * 100 : 0;

    return {
      totalRequests: this.stats.totalRequests,
      totalFailures: this.stats.totalFailures,
      totalSuccesses: this.stats.totalSuccesses,
      failureRate,
      state: {
        closed: this.state === 'closed',
        open: this.state === 'open',
        halfOpen: this.state === 'halfOpen'
      }
    };
  }

  reset(): void {
    this.state = 'closed';
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      rollingBuckets: new Array(this.config.rollingCountBuckets).fill(0)
    };
    this.rollingBucketIndex = 0;
    this.nextAttemptTime = 0;
    this.emit('reset');
  }

  isOpen(): boolean {
    return this.state === 'open';
  }

  isClosed(): boolean {
    return this.state === 'closed';
  }

  isHalfOpen(): boolean {
    return this.state === 'halfOpen';
  }
}

export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  private constructor() {}

  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
    }
    return CircuitBreakerRegistry.instance;
  }

  register(name: string, action: (...args: any[]) => Promise<any>, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const breaker = new CircuitBreaker(action, config);
    this.circuitBreakers.set(name, breaker);
    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }

  getAll(): Map<string, CircuitBreaker> {
    return this.circuitBreakers;
  }

  remove(name: string): boolean {
    return this.circuitBreakers.delete(name);
  }

  reset(name: string): boolean {
    const breaker = this.circuitBreakers.get(name);
    if (breaker) {
      breaker.reset();
      return true;
    }
    return false;
  }

  resetAll(): void {
    this.circuitBreakers.forEach(breaker => breaker.reset());
  }

  getStats(name: string): CircuitBreakerStats | undefined {
    const breaker = this.circuitBreakers.get(name);
    return breaker?.getStats();
  }

  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();
    this.circuitBreakers.forEach((breaker, name) => {
      stats.set(name, breaker.getStats());
    });
    return stats;
  }
}

export function createCircuitBreaker(
  name: string,
  action: (...args: any[]) => Promise<any>,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  const registry = CircuitBreakerRegistry.getInstance();
  return registry.register(name, action, config);
}

export function getCircuitBreaker(name: string): CircuitBreaker | undefined {
  const registry = CircuitBreakerRegistry.getInstance();
  return registry.get(name);
}
