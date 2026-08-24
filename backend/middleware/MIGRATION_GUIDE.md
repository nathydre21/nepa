# Migration Guide: Upgrading to Comprehensive Logging System

This guide helps you migrate from the old logging system to the new comprehensive logging system.

## Overview of Changes

The new logging system provides:
- ✅ Structured logging with consistent format
- ✅ Multiple log levels and categories
- ✅ Automatic log rotation and compression
- ✅ Real-time monitoring and alerting
- ✅ Log aggregation and analytics
- ✅ Better performance and reliability

## Step 1: Update Imports

### Old Code
```typescript
// Old imports
import { logger } from '../services/logger';
import { requestLogger } from '../src/utils/logger';
```

### New Code
```typescript
// New imports
import { logger, loggingMiddleware, setupGlobalErrorHandling } from '../middleware/logger';
```

## Step 2: Update Express Setup

### Old Code
```typescript
import { requestLogger } from '../services/logger';

app.use(requestLogger);
```

### New Code
```typescript
import { loggingMiddleware, setupGlobalErrorHandling } from '../middleware/logger';

// Apply logging middleware
app.use(loggingMiddleware);

// Setup global error handling
setupGlobalErrorHandling(app);
```

## Step 3: Update Logging Calls

### Basic Logging

#### Old Code
```typescript
console.log('User logged in');
console.error('Error occurred');
```

#### New Code
```typescript
logger.info('User logged in');
logger.error('Error occurred');
```

### Logging with Context

#### Old Code
```typescript
logger.info(`User ${userId} performed action`);
```

#### New Code
```typescript
logger.info('User performed action', {
  userId,
  action: 'login',
  ip: req.ip
});
```

### Error Logging

#### Old Code
```typescript
try {
  // code
} catch (error) {
  console.error('Error:', error.message);
}
```

#### New Code
```typescript
try {
  // code
} catch (error) {
  logger.logError(error as Error, {
    userId,
    operation: 'payment-processing',
    category: LogCategory.APPLICATION
  });
}
```

## Step 4: Add Specialized Logging

### Security Events

```typescript
// New capability
logger.security('Failed login attempt', {
  userId: email,
  ip: req.ip,
  reason: 'invalid_credentials'
});
```

### Audit Trail

```typescript
// New capability
logger.audit({
  action: 'user.update',
  resource: 'user',
  resourceId: userId,
  userId: adminId,
  changes: { email: newEmail },
  result: 'success'
});
```

### Performance Monitoring

```typescript
// New capability
const start = Date.now();
// ... operation
const duration = Date.now() - start;

logger.performance({
  operation: 'database-query',
  duration,
  threshold: 1000
}, {
  query: 'SELECT * FROM users'
});
```

### Business Metrics

```typescript
// New capability
logger.metric({
  name: 'payment.processed',
  value: amount,
  unit: 'USD',
  tags: {
    method: 'credit_card',
    status: 'success'
  }
});
```

## Step 5: Update Service-Specific Loggers

### Old Code (services/logger.ts)
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console()
  ]
});

export default logger;
```

### New Code
```typescript
import { logger } from '../middleware/logger';

// Use the centralized logger
export default logger;

// Or create a child logger with service context
export const serviceLogger = logger.child({
  service: 'user-service',
  version: '1.0.0'
});
```

## Step 6: Update Microservices

### Old Code (microservices/shared/utils/logger.ts)
```typescript
export const createLogger = (serviceName: string) => {
  return winston.createLogger({
    level: 'info',
    defaultMeta: { service: serviceName },
    transports: [new winston.transports.Console()]
  });
};
```

### New Code
```typescript
import { logger } from '../../../middleware/logger';

export const createLogger = (serviceName: string) => {
  return logger.child({
    service: serviceName,
    category: LogCategory.APPLICATION
  });
};
```

## Step 7: Environment Variables

Add these to your `.env` file:

```bash
# Logging Configuration
NODE_ENV=production
LOG_LEVEL=info
LOG_PATH=logs
LOG_SILENT=false

# Monitoring
LOG_MONITORING_ENABLED=true

# External Services (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#alerts

# Service Identification
SERVICE_NAME=nepa-backend
```

## Step 8: Update Error Handlers

### Old Code
```typescript
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});
```

### New Code
```typescript
import { errorLogger } from '../middleware/logger';

// Error logger is automatically included in setupGlobalErrorHandling
// But you can also use it manually:
app.use(errorLogger);

app.use((err, req, res, next) => {
  // Error is already logged by errorLogger middleware
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal Server Error'
  });
});
```

## Step 9: Remove Old Logging Files

After migration, you can safely remove or deprecate:

1. `src/utils/logger.ts` - Replace with new logger
2. Old winston configurations in individual services
3. Custom console.log statements throughout the codebase

## Step 10: Testing

Run the test suite to ensure everything works:

```bash
npm test tests/unit/logging.test.ts
```

## Common Patterns

### Pattern 1: Request Handler with Logging

```typescript
export const handler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Processing request', {
      userId: req.user?.id,
      endpoint: req.originalUrl
    });

    const result = await processRequest(req);

    logger.metric({
      name: 'request.success',
      value: 1,
      tags: { endpoint: req.originalUrl }
    });

    res.json(result);
  } catch (error) {
    logger.logError(error as Error, {
      userId: req.user?.id,
      endpoint: req.originalUrl
    });
    next(error);
  }
};
```

### Pattern 2: Database Operations

```typescript
async function queryDatabase(query: string) {
  const start = Date.now();

  logger.database('Executing query', { query });

  try {
    const result = await db.query(query);
    const duration = Date.now() - start;

    logger.database('Query completed', {
      query,
      duration,
      rowCount: result.length
    });

    if (duration > 500) {
      logger.performance({
        operation: 'database-query',
        duration,
        threshold: 500
      }, { query });
    }

    return result;
  } catch (error) {
    logger.logError(error as Error, {
      category: LogCategory.DATABASE,
      query
    });
    throw error;
  }
}
```

### Pattern 3: External API Calls

```typescript
async function callExternalApi(url: string, options: any) {
  const start = Date.now();

  logger.externalApi('Calling external API', {
    url,
    method: options.method
  });

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - start;

    logger.externalApi('External API responded', {
      url,
      duration,
      statusCode: response.status
    });

    return response;
  } catch (error) {
    logger.logError(error as Error, {
      category: LogCategory.EXTERNAL_API,
      url
    });
    throw error;
  }
}
```

## Troubleshooting

### Issue: Logs not appearing

**Solution**: Check that `LOG_SILENT` is not set to `true` and `LOG_LEVEL` is appropriate.

### Issue: Too many log files

**Solution**: Adjust retention periods in `config/loggingConfig.ts`:

```typescript
rotation: {
  maxFiles: {
    application: '14d',  // Reduce from 30d
    error: '30d',        // Reduce from 90d
  }
}
```

### Issue: Performance impact

**Solution**: Increase log level in production:

```bash
LOG_LEVEL=warn  # Only log warnings and errors
```

### Issue: Missing correlation IDs

**Solution**: Ensure `correlationIdMiddleware` is applied early:

```typescript
app.use(loggingMiddleware);  // This includes correlationIdMiddleware
```

## Benefits After Migration

1. **Structured Data**: All logs are in JSON format, easy to parse and analyze
2. **Better Debugging**: Correlation IDs track requests across services
3. **Compliance**: Audit logs with long retention for compliance requirements
4. **Performance**: Identify slow operations automatically
5. **Alerting**: Get notified of critical issues in real-time
6. **Analytics**: Query and analyze logs programmatically
7. **Cost Savings**: Automatic log rotation prevents disk space issues

## Next Steps

1. ✅ Complete the migration
2. ✅ Run tests to verify functionality
3. ✅ Configure monitoring and alerting
4. ✅ Set up external integrations (Slack, Datadog, etc.)
5. ✅ Train team on new logging patterns
6. ✅ Update documentation and runbooks

## Support

For questions or issues:
- Check the [README.md](./README.md) for detailed documentation
- Review [loggingExample.ts](./loggingExample.ts) for usage examples
- Run tests: `npm test tests/unit/logging.test.ts`
