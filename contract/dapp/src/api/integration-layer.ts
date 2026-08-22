import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { EventEmitter } from 'events';

export interface APIConfig {
  baseURL: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  rateLimitRPS: number;
  auth?: {
    type: 'oauth' | 'apikey' | 'bearer';
    credentials: any;
  };
  headers?: Record<string, string>;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of cached items
  strategy: 'lru' | 'fifo' | 'lfu';
}

export interface IntegrationMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  rateLimitHits: number;
  cacheHits: number;
  cacheMisses: number;
  lastError?: string;
  lastErrorTime?: Date;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  responseTime?: number;
  cached?: boolean;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
}

export class IntegrationLayer extends EventEmitter {
  private axiosInstance: AxiosInstance;
  private config: APIConfig;
  private rateLimitConfig: RateLimitConfig;
  private cacheConfig: CacheConfig;
  private metrics: IntegrationMetrics;
  private cache: Map<string, { data: any; timestamp: number; hits: number }>;
  private rateLimitTracker: Map<string, number[]>;
  private requestQueue: Map<string, Promise<any>>;
  private webhooks: Map<string, WebhookConfig>;

  constructor(config: APIConfig, rateLimitConfig?: RateLimitConfig, cacheConfig?: CacheConfig) {
    super();
    this.config = config;
    this.rateLimitConfig = rateLimitConfig || {
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    };
    this.cacheConfig = cacheConfig || {
      enabled: true,
      ttl: 300000, // 5 minutes
      maxSize: 1000,
      strategy: 'lru'
    };

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      rateLimitHits: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    this.cache = new Map();
    this.rateLimitTracker = new Map();
    this.requestQueue = new Map();
    this.webhooks = new Map();

    this.setupAxiosInstance();
    this.startMetricsCollection();
  }

  private setupAxiosInstance(): void {
    this.axiosInstance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NEPA-Integration-Layer/1.0',
        ...this.config.headers
      }
    });

    // Request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.addAuthentication(config);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for metrics and caching
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.recordSuccess(response);
        return response;
      },
      (error) => {
        this.recordFailure(error);
        return Promise.reject(error);
      }
    );
  }

  private addAuthentication(config: AxiosRequestConfig): void {
    if (!this.config.auth) return;

    switch (this.config.auth.type) {
      case 'oauth':
        config.headers.Authorization = `Bearer ${this.config.auth.credentials.accessToken}`;
        break;
      case 'apikey':
        config.headers['X-API-Key'] = this.config.auth.credentials.apiKey;
        break;
      case 'bearer':
        config.headers.Authorization = `Bearer ${this.config.auth.credentials.token}`;
        break;
    }
  }

  async request<T = any>(config: AxiosRequestConfig): Promise<APIResponse<T>> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(config);

    try {
      // Check cache first
      if (this.cacheConfig.enabled && config.method?.toLowerCase() === 'get') {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          this.metrics.cacheHits++;
          return {
            success: true,
            data: cached,
            cached: true,
            responseTime: Date.now() - startTime
          };
        }
        this.metrics.cacheMisses++;
      }

      // Check rate limiting
      await this.checkRateLimit();

      // Make the request with retry logic
      const response = await this.makeRequestWithRetry(config);

      // Cache successful GET requests
      if (this.cacheConfig.enabled && config.method?.toLowerCase() === 'get') {
        this.setCache(cacheKey, response.data);
      }

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        data: response.data,
        statusCode: response.status,
        responseTime
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      // Emit webhook for failures if configured
      await this.emitWebhook('api_failure', {
        error: error.message,
        config,
        responseTime
      });

      return {
        success: false,
        error: error.message,
        statusCode: error.response?.status,
        responseTime
      };
    }
  }

  private async makeRequestWithRetry(config: AxiosRequestConfig): Promise<AxiosResponse> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.metrics.totalRequests++;
        return await this.axiosInstance.request(config);
      } catch (error: any) {
        lastError = error;

        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.windowMs;
    const key = this.config.baseURL;

    let requests = this.rateLimitTracker.get(key) || [];

    // Remove old requests outside the window
    requests = requests.filter(timestamp => timestamp > windowStart);

    if (requests.length >= this.rateLimitConfig.maxRequests) {
      this.metrics.rateLimitHits++;
      const oldestRequest = Math.min(...requests);
      const waitTime = oldestRequest + this.rateLimitConfig.windowMs - now;

      if (waitTime > 0) {
        await this.delay(waitTime);
      }
    }

    requests.push(now);
    this.rateLimitTracker.set(key, requests);
  }

  private generateCacheKey(config: AxiosRequestConfig): string {
    const keyData = {
      url: config.url,
      method: config.method,
      params: config.params,
      data: config.data
    };
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  private getFromCache(key: string): any {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.cacheConfig.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update hit count for LRU strategy
    item.hits++;
    return item.data;
  }

  private setCache(key: string, data: any): void {
    // Check cache size limit
    if (this.cache.size >= this.cacheConfig.maxSize) {
      this.evictFromCache();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      hits: 0
    });
  }

  private evictFromCache(): void {
    switch (this.cacheConfig.strategy) {
      case 'lru':
        this.evictLRU();
        break;
      case 'fifo':
        this.evictFIFO();
        break;
      case 'lfu':
        this.evictLFU();
        break;
    }
  }

  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private evictFIFO(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }

  private evictLFU(): void {
    let leastUsedKey = '';
    let leastHits = Infinity;

    for (const [key, item] of this.cache.entries()) {
      if (item.hits < leastHits) {
        leastHits = item.hits;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
    }
  }

  private recordSuccess(response: AxiosResponse): void {
    this.metrics.successfulRequests++;
    this.updateAverageResponseTime(response.config.metadata?.responseTime || 0);

    this.emit('api_success', {
      statusCode: response.status,
      url: response.config.url,
      method: response.config.method
    });
  }

  private recordFailure(error: any): void {
    this.metrics.failedRequests++;
    this.metrics.lastError = error.message;
    this.metrics.lastErrorTime = new Date();

    this.emit('api_failure', {
      error: error.message,
      statusCode: error.response?.status,
      url: error.config?.url,
      method: error.config?.method
    });
  }

  private updateAverageResponseTime(responseTime: number): void {
    const totalRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests;
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      this.emit('metrics_update', this.getMetrics());
    }, 60000); // Emit metrics every minute
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API methods
  getMetrics(): IntegrationMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      rateLimitHits: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  updateConfig(newConfig: Partial<APIConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.setupAxiosInstance();
  }

  updateRateLimitConfig(newConfig: Partial<RateLimitConfig>): void {
    this.rateLimitConfig = { ...this.rateLimitConfig, ...newConfig };
  }

  updateCacheConfig(newConfig: Partial<CacheConfig>): void {
    this.cacheConfig = { ...this.cacheConfig, ...newConfig };
  }

  // Webhook management
  addWebhook(id: string, config: WebhookConfig): void {
    this.webhooks.set(id, config);
  }

  removeWebhook(id: string): void {
    this.webhooks.delete(id);
  }

  private async emitWebhook(event: string, data: any): Promise<void> {
    for (const [id, webhook] of this.webhooks.entries()) {
      if (webhook.events.includes(event)) {
        try {
          await this.sendWebhook(webhook, event, data);
        } catch (error) {
          console.error(`Webhook ${id} failed:`, error);
        }
      }
    }
  }

  private async sendWebhook(webhook: WebhookConfig, event: string, data: any): Promise<void> {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data
    };

    const signature = this.generateWebhookSignature(payload, webhook.secret);

    await axios.post(webhook.url, payload, {
      headers: {
        'X-Webhook-Signature': signature,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  private generateWebhookSignature(payload: any, secret: string): string {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  // Health check
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const startTime = Date.now();
      await this.axiosInstance.get('/health', { timeout: 5000 });
      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        details: {
          responseTime,
          metrics: this.getMetrics(),
          cacheSize: this.cache.size,
          rateLimitEntries: this.rateLimitTracker.size
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error.message,
          metrics: this.getMetrics()
        }
      };
    }
  }

  // HTTP methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<APIResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<APIResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<APIResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<APIResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  // Batch requests
  async batchRequests<T = any>(requests: AxiosRequestConfig[]): Promise<APIResponse<T>[]> {
    const promises = requests.map(config => this.request<T>(config));
    return Promise.all(promises);
  }

  // Streaming support for large responses
  async streamRequest(config: AxiosRequestConfig): Promise<NodeJS.ReadableStream> {
    const response = await this.axiosInstance.request({
      ...config,
      responseType: 'stream'
    });

    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;

    return response.data;
  }
}
