import { EventEmitter } from 'events';
import { IntegrationLayer, IntegrationMetrics } from './integration-layer';

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  operation: string;
  message: string;
  metadata?: Record<string, any>;
  correlationId?: string;
  userId?: string;
  duration?: number;
  statusCode?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface AlertConfig {
  enabled: boolean;
  thresholds: {
    errorRate: number; // percentage
    responseTime: number; // milliseconds
    rateLimitHits: number;
    cacheHitRate: number; // percentage
  };
  cooldown: number; // milliseconds between alerts
  channels: Array<{
    type: 'email' | 'webhook' | 'slack' | 'teams';
    config: Record<string, any>;
  }>;
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  responseTime: number;
  details: {
    metrics: IntegrationMetrics;
    recentErrors: LogEntry[];
    activeConnections: number;
  };
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    duration: number;
  }>;
}

export interface MonitoringConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  retentionPeriod: number; // days
  maxLogEntries: number;
  alertConfig: AlertConfig;
  healthCheckInterval: number; // milliseconds
  metricsInterval: number; // milliseconds
}

export class IntegrationMonitor extends EventEmitter {
  private logs: LogEntry[] = [];
  private healthChecks: Map<string, HealthCheck> = new Map();
  private services: Map<string, IntegrationLayer> = new Map();
  private config: MonitoringConfig;
  private metricsHistory: Map<string, Array<{ timestamp: Date; metrics: IntegrationMetrics }>> = new Map();
  private alertCooldowns: Map<string, Date> = new Map();
  private healthCheckInterval?: any;
  private metricsInterval?: any;

  constructor(config: MonitoringConfig) {
    super();
    this.config = config;
    this.startMonitoring();
  }

  registerService(name: string, service: IntegrationLayer): void {
    this.services.set(name, service);
    this.metricsHistory.set(name, []);
    
    // Listen to service events
    service.on('api_success', (data) => {
      this.log('info', name, 'api_request', 'API request successful', {
        statusCode: data.statusCode,
        url: data.url,
        method: data.method
      });
    });

    service.on('api_failure', (data) => {
      this.log('error', name, 'api_request', 'API request failed', {
        statusCode: data.statusCode,
        url: data.url,
        method: data.method,
        error: data.error
      });
    });

    service.on('metrics_update', (metrics: IntegrationMetrics) => {
      this.recordMetrics(name, metrics);
    });

    this.log('info', name, 'service_registration', 'Service registered for monitoring');
  }

  unregisterService(name: string): void {
    this.services.delete(name);
    this.metricsHistory.delete(name);
    this.healthChecks.delete(name);
    this.log('info', name, 'service_unregistration', 'Service unregistered from monitoring');
  }

  log(
    level: LogEntry['level'],
    service: string,
    operation: string,
    message: string,
    metadata?: Record<string, any>,
    correlationId?: string,
    userId?: string,
    duration?: number,
    statusCode?: number,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) return;

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      service,
      operation,
      message,
      metadata,
      correlationId,
      userId,
      duration,
      statusCode,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    this.addLogEntry(logEntry);
    this.emit('log', logEntry);

    // Check for alerts
    if (level === 'error') {
      this.checkAlerts(service, logEntry);
    }
  }

  private shouldLog(level: LogEntry['level']): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.logLevel);
    const entryLevel = levels.indexOf(level);
    return entryLevel >= configLevel;
  }

  private addLogEntry(entry: LogEntry): void {
    this.logs.push(entry);
    
    // Maintain log size limit
    if (this.logs.length > this.config.maxLogEntries) {
      this.logs = this.logs.slice(-this.config.maxLogEntries);
    }

    // Clean old logs based on retention period
    const cutoffDate = new Date(Date.now() - this.config.retentionPeriod * 24 * 60 * 60 * 1000);
    this.logs = this.logs.filter(log => log.timestamp > cutoffDate);
  }

  private recordMetrics(serviceName: string, metrics: IntegrationMetrics): void {
    const history = this.metricsHistory.get(serviceName) || [];
    history.push({
      timestamp: new Date(),
      metrics: { ...metrics }
    });

    // Keep only last 100 entries
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.metricsHistory.set(serviceName, history);
    this.emit('metrics_recorded', { serviceName, metrics });
  }

  private startMonitoring(): void {
    // Health check interval
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);

    // Metrics collection interval
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsInterval);
  }

  private async performHealthChecks(): Promise<void> {
    for (const [serviceName, service] of this.services.entries()) {
      try {
        const startTime = Date.now();
        const healthResult = await service.healthCheck();
        const responseTime = Date.now() - startTime;

        const recentErrors = this.getRecentErrors(serviceName, 5);
        const metrics = service.getMetrics();

        const healthCheck: HealthCheck = {
          service: serviceName,
          status: this.determineHealthStatus(healthResult, metrics, recentErrors),
          timestamp: new Date(),
          responseTime,
          details: {
            metrics,
            recentErrors,
            activeConnections: this.getActiveConnections(serviceName)
          },
          checks: [
            {
              name: 'api_connectivity',
              status: healthResult.healthy ? 'pass' : 'fail',
              message: healthResult.healthy ? 'API is reachable' : 'API is not responding',
              duration: responseTime
            },
            {
              name: 'error_rate',
              status: metrics.failedRequests / metrics.totalRequests < 0.05 ? 'pass' : 'fail',
              message: `Error rate: ${((metrics.failedRequests / metrics.totalRequests) * 100).toFixed(2)}%`,
              duration: 0
            },
            {
              name: 'response_time',
              status: metrics.averageResponseTime < 5000 ? 'pass' : 'warn',
              message: `Average response time: ${metrics.averageResponseTime.toFixed(2)}ms`,
              duration: 0
            },
            {
              name: 'rate_limit',
              status: metrics.rateLimitHits < 10 ? 'pass' : 'warn',
              message: `Rate limit hits: ${metrics.rateLimitHits}`,
              duration: 0
            }
          ]
        };

        this.healthChecks.set(serviceName, healthCheck);
        this.emit('health_check', healthCheck);

        // Check for health-based alerts
        if (healthCheck.status !== 'healthy') {
          this.checkHealthAlerts(serviceName, healthCheck);
        }

      } catch (error) {
        this.log('error', serviceName, 'health_check', 'Health check failed', undefined, undefined, undefined, undefined, undefined, error as Error);
      }
    }
  }

  private determineHealthStatus(
    healthResult: { healthy: boolean },
    metrics: IntegrationMetrics,
    recentErrors: LogEntry[]
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (!healthResult.healthy) return 'unhealthy';

    const errorRate = metrics.totalRequests > 0 ? metrics.failedRequests / metrics.totalRequests : 0;
    const avgResponseTime = metrics.averageResponseTime;

    if (errorRate > 0.1 || avgResponseTime > 10000) {
      return 'unhealthy';
    }

    if (errorRate > 0.05 || avgResponseTime > 5000 || recentErrors.length > 3) {
      return 'degraded';
    }

    return 'healthy';
  }

  private getRecentErrors(serviceName: string, limit: number): LogEntry[] {
    return this.logs
      .filter(log => log.service === serviceName && log.level === 'error')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  private getActiveConnections(serviceName: string): number {
    // This would typically track active connections
    // For now, return a mock value
    return Math.floor(Math.random() * 10);
  }

  private async collectMetrics(): Promise<void> {
    for (const [serviceName, service] of this.services.entries()) {
      const metrics = service.getMetrics();
      this.recordMetrics(serviceName, metrics);
    }
  }

  private checkAlerts(serviceName: string, logEntry: LogEntry): void {
    if (!this.config.alertConfig.enabled) return;

    const cooldownKey = `${serviceName}_error`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);
    
    if (lastAlert && Date.now() - lastAlert.getTime() < this.config.alertConfig.cooldown) {
      return;
    }

    this.triggerAlert(serviceName, 'high_error_rate', {
      message: `High error rate detected in ${serviceName}`,
      severity: 'warning',
      metadata: {
        error: logEntry.message,
        operation: logEntry.operation,
        timestamp: logEntry.timestamp
      }
    });

    this.alertCooldowns.set(cooldownKey, new Date());
  }

  private checkHealthAlerts(serviceName: string, healthCheck: HealthCheck): void {
    if (!this.config.alertConfig.enabled) return;

    const cooldownKey = `${serviceName}_health`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);
    
    if (lastAlert && Date.now() - lastAlert.getTime() < this.config.alertConfig.cooldown) {
      return;
    }

    const severity = healthCheck.status === 'unhealthy' ? 'critical' : 'warning';
    
    this.triggerAlert(serviceName, 'health_issue', {
      message: `Health issue detected in ${serviceName}: ${healthCheck.status}`,
      severity,
      metadata: {
        status: healthCheck.status,
        responseTime: healthCheck.responseTime,
        checks: healthCheck.checks
      }
    });

    this.alertCooldowns.set(cooldownKey, new Date());
  }

  private async triggerAlert(serviceName: string, alertType: string, alertData: {
    message: string;
    severity: 'info' | 'warning' | 'critical';
    metadata?: Record<string, any>;
  }): Promise<void> {
    this.emit('alert', {
      serviceName,
      alertType,
      timestamp: new Date(),
      ...alertData
    });

    // Send to configured channels
    for (const channel of this.config.alertConfig.channels) {
      try {
        await this.sendAlertToChannel(channel, alertData);
      } catch (error) {
        this.log('error', 'monitor', 'alert_delivery', `Failed to send alert to ${channel.type}`, {
          channel: channel.type,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  private async sendAlertToChannel(
    channel: AlertConfig['channels'][0],
    alertData: { message: string; severity: string; metadata?: Record<string, any> }
  ): Promise<void> {
    switch (channel.type) {
      case 'webhook':
        await this.sendWebhookAlert(channel.config.url, alertData);
        break;
      case 'email':
        // Email implementation would go here
        console.log('Email alert:', alertData);
        break;
      case 'slack':
        await this.sendSlackAlert(channel.config, alertData);
        break;
      case 'teams':
        await this.sendTeamsAlert(channel.config, alertData);
        break;
    }
  }

  private async sendWebhookAlert(url: string, alertData: any): Promise<void> {
    const axios = require('axios');
    await axios.post(url, {
      alert: alertData,
      timestamp: new Date().toISOString()
    });
  }

  private async sendSlackAlert(config: any, alertData: any): Promise<void> {
    const axios = require('axios');
    const color = alertData.severity === 'critical' ? 'danger' : alertData.severity === 'warning' ? 'warning' : 'good';
    
    await axios.post(config.webhookUrl, {
      attachments: [{
        color,
        title: 'NEPA Integration Alert',
        text: alertData.message,
        fields: Object.entries(alertData.metadata || {}).map(([key, value]) => ({
          title: key,
          value: String(value),
          short: true
        })),
        timestamp: new Date().toISOString()
      }]
    });
  }

  private async sendTeamsAlert(config: any, alertData: any): Promise<void> {
    const axios = require('axios');
    const themeColor = alertData.severity === 'critical' ? 'FF0000' : alertData.severity === 'warning' ? 'FFA500' : '00FF00';
    
    await axios.post(config.webhookUrl, {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor,
      title: "NEPA Integration Alert",
      text: alertData.message,
      sections: [{
        facts: Object.entries(alertData.metadata || {}).map(([key, value]) => ({
          name: key,
          value: String(value)
        }))
      }]
    });
  }

  // Public API methods
  getLogs(options?: {
    service?: string;
    level?: LogEntry['level'];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    correlationId?: string;
  }): LogEntry[] {
    let filteredLogs = [...this.logs];

    if (options?.service) {
      filteredLogs = filteredLogs.filter(log => log.service === options.service);
    }

    if (options?.level) {
      filteredLogs = filteredLogs.filter(log => log.level === options.level);
    }

    if (options?.startDate) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= options.startDate!);
    }

    if (options?.endDate) {
      filteredLogs = filteredLogs.filter(log => log.timestamp <= options.endDate!);
    }

    if (options?.correlationId) {
      filteredLogs = filteredLogs.filter(log => log.correlationId === options.correlationId);
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return options?.limit ? filteredLogs.slice(0, options.limit) : filteredLogs;
  }

  getHealthChecks(): Map<string, HealthCheck> {
    return new Map(this.healthChecks);
  }

  getServiceMetrics(serviceName: string, period?: 'hour' | 'day' | 'week'): Array<{ timestamp: Date; metrics: IntegrationMetrics }> {
    const history = this.metricsHistory.get(serviceName) || [];
    
    if (!period) return history;

    const now = new Date();
    const cutoffTime = {
      hour: new Date(now.getTime() - 60 * 60 * 1000),
      day: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    }[period];

    return history.filter(entry => entry.timestamp >= cutoffTime!);
  }

  getMonitoringSummary(): {
    totalServices: number;
    healthyServices: number;
    degradedServices: number;
    unhealthyServices: number;
    totalLogs: number;
    errorLogs: number;
    averageResponseTime: number;
    totalRequests: number;
    errorRate: number;
  } {
    const services = Array.from(this.healthChecks.values());
    const healthy = services.filter(s => s.status === 'healthy').length;
    const degraded = services.filter(s => s.status === 'degraded').length;
    const unhealthy = services.filter(s => s.status === 'unhealthy').length;

    const errorLogs = this.logs.filter(log => log.level === 'error').length;
    
    // Calculate overall metrics
    let totalRequests = 0;
    let totalResponseTime = 0;
    let totalFailedRequests = 0;

    for (const service of this.services.values()) {
      const metrics = service.getMetrics();
      totalRequests += metrics.totalRequests;
      totalResponseTime += metrics.averageResponseTime * metrics.totalRequests;
      totalFailedRequests += metrics.failedRequests;
    }

    const averageResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    const errorRate = totalRequests > 0 ? totalFailedRequests / totalRequests : 0;

    return {
      totalServices: services.length,
      healthyServices: healthy,
      degradedServices: degraded,
      unhealthyServices: unhealthy,
      totalLogs: this.logs.length,
      errorLogs,
      averageResponseTime,
      totalRequests,
      errorRate
    };
  }

  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart monitoring if intervals changed
    if (newConfig.healthCheckInterval || newConfig.metricsInterval) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }

  clearLogs(): void {
    this.logs = [];
  }

  exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.logs, null, 2);
    }

    // CSV format
    const headers = ['timestamp', 'level', 'service', 'operation', 'message', 'correlationId', 'userId', 'duration', 'statusCode'];
    const csvRows = [headers.join(',')];

    for (const log of this.logs) {
      const row = [
        log.timestamp.toISOString(),
        log.level,
        log.service,
        log.operation,
        `"${log.message.replace(/"/g, '""')}"`, // Escape quotes
        log.correlationId || '',
        log.userId || '',
        log.duration || '',
        log.statusCode || ''
      ];
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }
}
