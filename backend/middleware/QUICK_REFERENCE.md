# Logging System - Quick Reference

## Import

```typescript
import { logger, loggingMiddleware, setupGlobalErrorHandling } from './middleware/logger';
```

## Express Setup

```typescript
app.use(loggingMiddleware);
setupGlobalErrorHandling(app);
```

## Basic Logging

```typescript
logger.error('Error message');
logger.warn('Warning message');
logger.info('Info message');
logger.debug('Debug message');
```

## Logging with Context

```typescript
logger.info('User action', {
  userId: '123',
  action: 'login',
  ip: req.ip
});
```

## Error Logging

```typescript
try {
  // code
} catch (error) {
  logger.logError(error as Error, {
    userId,
    operation: 'payment'
  });
}
```

## Specialized Logging

```typescript
// Security
logger.security('Failed login', { userId, ip });

// Audit
logger.audit({
  action: 'user.update',
  resource: 'user',
  resourceId: '123',
  userId: 'admin',
  result: 'success'
});

// Performance
logger.performance({
  operation: 'db-query',
  duration: 1500,
  threshold: 1000
});

// Metrics
logger.metric({
  name: 'payment.processed',
  value: 99.99,
  unit: 'USD',
  tags: { method: 'card' }
});

// Database
logger.database('Query executed', { query, duration });

// External API
logger.externalApi('API called', { provider, duration });

// Webhook
logger.webhook('Webhook delivered', { url, statusCode });
```

## Child Logger

```typescript
const serviceLogger = logger.child({
  service: 'user-service',
  version: '1.0.0'
});

serviceLogger.info('Service started');
```

## Context Propagation

```typescript
import { logContextStorage } from './middleware/logger';

logContextStorage.run({ userId, operation }, async () => {
  logger.info('Step 1'); // Includes userId and operation
  logger.info('Step 2'); // Includes userId and operation
});
```

## Log Levels

| Level | When to Use |
|-------|-------------|
| error | Critical errors |
| warn | Warnings |
| info | General info |
| http | HTTP requests |
| debug | Debugging |
| verbose | Detailed info |
| silly | Trace info |

## Log Categories

- `APPLICATION` - General application logs
- `SECURITY` - Security events
- `AUDIT` - Audit trail
- `PERFORMANCE` - Performance metrics
- `BUSINESS` - Business metrics
- `DATABASE` - Database operations
- `EXTERNAL_API` - External API calls
- `WEBHOOK` - Webhook events

## Environment Variables

```bash
NODE_ENV=production
LOG_LEVEL=info
LOG_PATH=logs
LOG_MONITORING_ENABLED=true
SERVICE_NAME=nepa-backend
SLACK_WEBHOOK_URL=https://...
SLACK_CHANNEL=#alerts
```

## Monitoring

```typescript
import { createLogMonitor } from './middleware/logMonitoring';

const monitor = createLogMonitor(config);

monitor.on('alert', (alert) => {
  // Handle alert
});
```

## Aggregation

```typescript
import { createLogAggregator } from './middleware/logAggregation';

const aggregator = createLogAggregator();

// Query logs
const logs = aggregator.query({
  level: LogLevel.ERROR,
  startTime: new Date(Date.now() - 3600000),
  limit: 100
});

// Get stats
const stats = aggregator.getStats();
```

## Common Patterns

### Request Handler
```typescript
app.get('/api/users', async (req, res, next) => {
  try {
    logger.info('Fetching users', { userId: req.user?.id });
    const users = await getUsers();
    logger.metric({ name: 'users.fetched', value: users.length });
    res.json(users);
  } catch (error) {
    logger.logError(error as Error, { endpoint: '/api/users' });
    next(error);
  }
});
```

### Database Query
```typescript
async function query(sql: string) {
  const start = Date.now();
  logger.database('Executing query', { sql });
  
  try {
    const result = await db.query(sql);
    const duration = Date.now() - start;
    
    logger.database('Query completed', { sql, duration, rows: result.length });
    
    if (duration > 500) {
      logger.performance({ operation: 'db-query', duration, threshold: 500 });
    }
    
    return result;
  } catch (error) {
    logger.logError(error as Error, { category: LogCategory.DATABASE, sql });
    throw error;
  }
}
```

### External API Call
```typescript
async function callAPI(url: string) {
  const start = Date.now();
  logger.externalApi('Calling API', { url });
  
  try {
    const response = await fetch(url);
    const duration = Date.now() - start;
    
    logger.externalApi('API responded', { url, duration, status: response.status });
    return response;
  } catch (error) {
    logger.logError(error as Error, { category: LogCategory.EXTERNAL_API, url });
    throw error;
  }
}
```

## Best Practices

✅ Use appropriate log levels  
✅ Include context (userId, correlationId, etc.)  
✅ Don't log sensitive data (passwords, tokens)  
✅ Use structured logging (objects, not strings)  
✅ Log errors with stack traces  
✅ Monitor critical patterns  
✅ Set appropriate retention periods  

❌ Don't use console.log  
❌ Don't log in tight loops  
❌ Don't log full request/response bodies  
❌ Don't ignore log rotation  

## Files

- `middleware/logger.ts` - Core logging
- `middleware/logMonitoring.ts` - Monitoring
- `middleware/logAggregation.ts` - Aggregation
- `config/loggingConfig.ts` - Configuration
- `middleware/README.md` - Full documentation
- `middleware/MIGRATION_GUIDE.md` - Migration help
- `middleware/loggingExample.ts` - Examples

## Testing

```bash
npm test tests/unit/logging.test.ts
```
