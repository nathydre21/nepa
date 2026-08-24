# Comprehensive Logging System

A complete logging solution with structured logging, log levels, rotation, aggregation, and monitoring.

## Features

✅ **Structured Logging** - JSON format with consistent schema  
✅ **Multiple Log Levels** - error, warn, info, http, debug, verbose, silly  
✅ **Log Rotation** - Daily rotation with size limits and compression  
✅ **Log Aggregation** - Collect and analyze logs efficiently  
✅ **Real-time Monitoring** - Pattern detection and alerting  
✅ **Correlation IDs** - Track requests across services  
✅ **Context Propagation** - Maintain context across async operations  
✅ **Performance Tracking** - Monitor slow requests and operations  
✅ **Security Auditing** - Track security events and authentication  
✅ **Business Metrics** - Log and aggregate business KPIs  
✅ **External Integration** - Slack, Datadog, Elasticsearch support  

## Quick Start

### Basic Usage

```typescript
import { logger } from './middleware/logger';

// Simple logging
logger.info('Application started');
logger.error('Something went wrong');
logger.debug('Debug information');

// Logging with context
logger.info('User logged in', {
  userId: '123',
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
});

// Error logging
try {
  // ... code
} catch (error) {
  logger.logError(error, {
    userId: '123',
    operation: 'payment-processing'
  });
}
```

### Express Integration

```typescript
import express from 'express';
import { loggingMiddleware, setupGlobalErrorHandling } from './middleware/logger';

const app = express();

// Add logging middleware
app.use(loggingMiddleware);

// Your routes here
app.get('/api/users', (req, res) => {
  logger.info('Fetching users');
  res.json({ users: [] });
});

// Setup global error handling
setupGlobalErrorHandling(app);

app.listen(3000);
```

## Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `error` | Critical errors that need immediate attention | Database connection failed |
| `warn` | Warning conditions that should be reviewed | High memory usage, slow queries |
| `info` | General informational messages | User logged in, payment processed |
| `http` | HTTP request/response logging | GET /api/users 200 150ms |
| `debug` | Detailed debugging information | Variable values, function calls |
| `verbose` | Very detailed information | Full request/response bodies |
| `silly` | Extremely detailed trace information | Internal state changes |

## Log Categories

Organize logs by category for better filtering and analysis:

```typescript
import { logger, LogCategory } from './middleware/logger';

// Security events
logger.security('Failed login attempt', {
  userId: '123',
  ip: '192.168.1.1'
});

// Audit trail
logger.audit({
  action: 'user.update',
  resource: 'user',
  resourceId: '123',
  userId: 'admin',
  changes: { email: 'new@example.com' },
  result: 'success'
});

// Performance monitoring
logger.performance({
  operation: 'database-query',
  duration: 1500,
  threshold: 1000
}, {
  query: 'SELECT * FROM users'
});

// Business metrics
logger.metric({
  name: 'payment.processed',
  value: 99.99,
  unit: 'USD',
  tags: { method: 'credit_card', status: 'success' }
});

// Database operations
logger.database('Query executed', {
  query: 'SELECT * FROM users',
  duration: 45
});

// External API calls
logger.externalApi('Payment gateway called', {
  provider: 'stripe',
  duration: 250,
  statusCode: 200
});

// Webhook events
logger.webhook('Webhook delivered', {
  url: 'https://example.com/webhook',
  event: 'payment.success',
  statusCode: 200
});
```

## Log Rotation

Logs are automatically rotated based on configuration:

- **Application logs**: 30 days retention, 50MB max size
- **Error logs**: 90 days retention, 50MB max size
- **Security logs**: 365 days retention, 50MB max size
- **Performance logs**: 14 days retention, 50MB max size
- **Metrics logs**: 30 days retention, 50MB max size

Files are compressed after rotation to save disk space.

## Log Monitoring

### Pattern Detection

The monitoring system automatically detects critical patterns:

```typescript
import { createLogMonitor } from './middleware/logMonitoring';
import { loggingConfig } from './config/loggingConfig';

const monitor = createLogMonitor(loggingConfig.monitoring);

// Add custom pattern
monitor.addPattern({
  id: 'custom-error',
  name: 'Custom Error Pattern',
  pattern: /custom.*error/i,
  level: LogLevel.ERROR,
  threshold: 5,
  timeWindow: 60000, // 1 minute
  action: 'alert'
});

// Listen for alerts
monitor.on('alert', (alert) => {
  console.log('Alert triggered:', alert);
  // Send notification, page on-call engineer, etc.
});
```

### Built-in Patterns

- Database connection errors
- Authentication failures
- Payment processing failures
- High memory usage
- Rate limit exceeded
- External API timeouts

## Log Aggregation

Collect and analyze logs efficiently:

```typescript
import { createLogAggregator } from './middleware/logAggregation';

const aggregator = createLogAggregator();

// Query logs
const recentErrors = aggregator.query({
  level: LogLevel.ERROR,
  startTime: new Date(Date.now() - 3600000), // Last hour
  limit: 100
});

// Get statistics
const stats = aggregator.getStats();
console.log('Total logs:', stats.totalLogs);
console.log('By level:', stats.byLevel);
console.log('By category:', stats.byCategory);
```

## Context Propagation

Maintain context across async operations:

```typescript
import { logContextStorage } from './middleware/logger';

async function processPayment(userId: string) {
  // Set context for this operation
  return logContextStorage.run({
    userId,
    operation: 'payment-processing',
    correlationId: generateId()
  }, async () => {
    // All logs within this scope will include the context
    logger.info('Starting payment processing');
    
    await validatePayment();
    await chargeCard();
    await sendReceipt();
    
    logger.info('Payment processing completed');
  });
}
```

## Child Loggers

Create loggers with default context:

```typescript
const userLogger = logger.child({
  userId: '123',
  service: 'user-service'
});

// All logs from this logger will include userId and service
userLogger.info('User action performed');
userLogger.error('User operation failed');
```

## External Integrations

### Slack Alerts

Configure Slack webhook in environment variables:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#alerts
LOG_MONITORING_ENABLED=true
```

### Elasticsearch

Send logs to Elasticsearch for advanced analysis:

```bash
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_INDEX=logs
```

### Datadog

Integrate with Datadog for metrics and monitoring:

```bash
DATADOG_API_KEY=your-api-key
DATADOG_APP_KEY=your-app-key
```

## Configuration

All logging configuration is centralized in `config/loggingConfig.ts`:

```typescript
import { loggingConfig } from './config/loggingConfig';

// Customize settings
loggingConfig.performance.slowRequestThreshold = 2000;
loggingConfig.monitoring.alertThresholds.errorRate = 20;
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `LOG_LEVEL` | Minimum log level | info (prod), debug (dev) |
| `LOG_PATH` | Directory for log files | logs |
| `LOG_SILENT` | Disable all logging | false |
| `LOG_MONITORING_ENABLED` | Enable monitoring | false |
| `SERVICE_NAME` | Service identifier | nepa-backend |
| `SLACK_WEBHOOK_URL` | Slack webhook for alerts | - |
| `SLACK_CHANNEL` | Slack channel for alerts | #alerts |

## Best Practices

1. **Use appropriate log levels** - Don't log everything as `info`
2. **Include context** - Add userId, correlationId, etc.
3. **Don't log sensitive data** - Passwords, tokens, credit cards
4. **Use structured logging** - Pass objects, not concatenated strings
5. **Log errors with stack traces** - Use `logger.logError(error, context)`
6. **Monitor critical patterns** - Set up alerts for important events
7. **Aggregate similar logs** - Reduce noise and storage
8. **Set appropriate retention** - Balance compliance and storage costs

## Performance Considerations

- Logs are written asynchronously to avoid blocking
- File rotation prevents disk space issues
- Aggregation reduces duplicate log entries
- Metrics are buffered and flushed periodically
- Console logging is disabled in production by default

## Troubleshooting

### Logs not appearing

Check log level configuration and ensure it's not set to `silent`.

### High disk usage

Verify rotation settings and retention periods. Consider reducing retention or increasing rotation frequency.

### Missing correlation IDs

Ensure `correlationIdMiddleware` is applied before other middleware.

### Alerts not firing

Verify monitoring is enabled and external service credentials are correct.

## API Reference

See inline documentation in:
- `middleware/logger.ts` - Core logging functionality
- `middleware/logMonitoring.ts` - Monitoring and alerting
- `middleware/logAggregation.ts` - Log aggregation
- `config/loggingConfig.ts` - Configuration options
