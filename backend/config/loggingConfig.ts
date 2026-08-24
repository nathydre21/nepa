/**
 * Logging Configuration
 * Central configuration for the comprehensive logging system
 */

import { MonitoringConfig } from '../middleware/logMonitoring';

export const loggingConfig = {
  // Log levels by environment
  logLevel: {
    development: 'debug',
    test: 'warn',
    staging: 'info',
    production: 'info'
  },

  // Log rotation settings
  rotation: {
    maxSize: '50m',
    maxFiles: {
      application: '30d',
      error: '90d',
      security: '365d',
      performance: '14d',
      metrics: '30d'
    },
    compress: true,
    datePattern: 'YYYY-MM-DD'
  },

  // Performance thresholds
  performance: {
    slowRequestThreshold: 1000, // ms
    verySlowRequestThreshold: 5000, // ms
    databaseQueryThreshold: 500, // ms
    externalApiThreshold: 3000 // ms
  },

  // Monitoring configuration
  monitoring: {
    enabled: process.env.LOG_MONITORING_ENABLED === 'true',
    alertThresholds: {
      errorRate: 10, // errors per minute
      slowRequestThreshold: 1000, // ms
      memoryUsageThreshold: 85 // percentage
    },
    externalServices: {
      slack: process.env.SLACK_WEBHOOK_URL ? {
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || '#alerts'
      } : undefined,
      datadog: process.env.DATADOG_API_KEY ? {
        apiKey: process.env.DATADOG_API_KEY,
        appKey: process.env.DATADOG_APP_KEY || ''
      } : undefined,
      elasticsearch: process.env.ELASTICSEARCH_NODE ? {
        node: process.env.ELASTICSEARCH_NODE,
        index: process.env.ELASTICSEARCH_INDEX || 'logs'
      } : undefined
    }
  } as MonitoringConfig,

  // Aggregation settings
  aggregation: {
    enabled: true,
    maxLogs: 10000,
    aggregationWindow: 60000, // 1 minute
    flushInterval: 300000 // 5 minutes
  },

  // Security settings
  security: {
    maskSensitiveData: true,
    sensitiveFields: [
      'password',
      'token',
      'apiKey',
      'secret',
      'creditCard',
      'ssn',
      'authorization'
    ],
    logFailedAuthAttempts: true,
    logSecurityEvents: true
  },

  // Context settings
  context: {
    includeUserAgent: true,
    includeIp: true,
    includeHeaders: false, // Set to true for debugging
    includeBody: false, // Set to true for debugging (be careful with sensitive data)
    maxBodySize: 1000 // characters
  },

  // File paths
  paths: {
    logs: process.env.LOG_PATH || 'logs',
    application: 'application',
    error: 'error',
    security: 'security',
    performance: 'performance',
    metrics: 'metrics'
  }
};

export default loggingConfig;
