# Webhook Integration Guide

This guide shows you how to emit webhook events from your existing business logic.

## Quick Integration Examples

### 1. Payment Success Event

In your payment processing code (e.g., `PaymentController.ts`):

```typescript
import { webhookEventEmitter } from './WebhookEventEmitter';
import { WebhookEventType } from './WebhookEventEmitter';

// After successful payment
const payment = await processPaymentLogic();

// Emit webhook event
webhookEventEmitter.emitPaymentSuccess({
  paymentId: payment.id,
  userId: payment.userId,
  billId: payment.billId,
  amount: payment.amount,
  method: payment.method,
  transactionId: payment.transactionId,
  timestamp: Date.now(),
});
```

### 2. Payment Failed Event

```typescript
webhookEventEmitter.emitPaymentFailed({
  paymentId: payment.id,
  userId: payment.userId,
  billId: payment.billId,
  amount: payment.amount,
  method: payment.method,
  timestamp: Date.now(),
});
```

### 3. Bill Created Event

In your bill creation code (e.g., `BillingService.ts`):

```typescript
import { webhookEventEmitter } from './WebhookEventEmitter';

// After creating a bill
const bill = await createBillLogic();

webhookEventEmitter.emitBillCreated({
  billId: bill.id,
  userId: bill.userId,
  utilityId: bill.utilityId,
  amount: bill.amount.toNumber(),
  dueDate: bill.dueDate.toISOString(),
  status: bill.status,
  timestamp: Date.now(),
});
```

### 4. Bill Paid Event

```typescript
webhookEventEmitter.emitBillPaid({
  billId: bill.id,
  userId: bill.userId,
  utilityId: bill.utilityId,
  amount: bill.amount.toNumber(),
  dueDate: bill.dueDate.toISOString(),
  status: 'PAID',
  timestamp: Date.now(),
});
```

### 5. Bill Overdue Event

```typescript
webhookEventEmitter.emitBillOverdue({
  billId: bill.id,
  userId: bill.userId,
  utilityId: bill.utilityId,
  amount: bill.amount.toNumber(),
  dueDate: bill.dueDate.toISOString(),
  status: 'OVERDUE',
  timestamp: Date.now(),
});
```

### 6. Bill Updated Event

```typescript
webhookEventEmitter.emitBillUpdated({
  billId: bill.id,
  userId: bill.userId,
  utilityId: bill.utilityId,
  amount: bill.amount.toNumber(),
  dueDate: bill.dueDate.toISOString(),
  status: bill.status,
  timestamp: Date.now(),
});
```

### 7. User Created Event

In your user registration code (e.g., `auth.ts`):

```typescript
import { webhookEventEmitter } from './WebhookEventEmitter';

// After user creation
const user = await createUserLogic();

webhookEventEmitter.emitUserCreated({
  userId: user.id,
  email: user.email,
  name: user.name,
  timestamp: Date.now(),
});
```

### 8. User Updated Event

```typescript
webhookEventEmitter.emitUserUpdated({
  userId: user.id,
  email: user.email,
  name: user.name,
  timestamp: Date.now(),
});
```

### 9. Document Uploaded Event

In your document upload code (e.g., `DocumentController.ts`):

```typescript
import { webhookEventEmitter } from './WebhookEventEmitter';

// After document upload
const document = await uploadDocumentLogic();

webhookEventEmitter.emitDocumentUploaded({
  documentId: document.id,
  userId: document.userId,
  filename: document.filename,
  mimeType: document.mimeType,
  size: document.size,
  timestamp: Date.now(),
});
```

### 10. Report Generated Event

In your reporting code (e.g., `AnalyticsController.ts`):

```typescript
import { webhookEventEmitter } from './WebhookEventEmitter';

// After report generation
const report = await generateReportLogic();

webhookEventEmitter.emitReportGenerated({
  reportId: report.id,
  userId: report.createdBy,
  title: report.title,
  type: report.type,
  timestamp: Date.now(),
});
```

## Integration Checklist

- [ ] Import `webhookEventEmitter` in controllers/services
- [ ] Add webhook event emission after business logic completion
- [ ] Test webhook delivery with `/api/webhooks/testing/create-event`
- [ ] Verify webhook logs in `/api/webhooks/:webhookId/logs`
- [ ] Monitor delivery stats in `/api/webhooks/:webhookId/stats`
- [ ] Set up error handling for failed webhooks
- [ ] Configure retry policies based on use case
- [ ] Document webhook endpoints for API consumers
- [ ] Set up monitoring and alerting
- [ ] Test with staging environment

## Testing Webhooks During Development

### Using ngrok for Local Testing

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok tunnel
ngrok http 3000

# Use the ngrok URL in webhook registration
# Example: https://xxxx-xx-xx-xxx-xxx.ngrok-free.app/webhook
```

### Manual Testing with curl

```bash
# Test webhook signature verification
curl -X POST https://your-webhook-url.com/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $(openssl dgst -sha256 -hmac 'your_secret' <<< '{\"test\":true}'|cut -d' ' -f2)" \
  -H "X-Webhook-ID: webhook_123" \
  -H "X-Event-Type: payment.success" \
  -d '{"test":true}'
```

### Webhook Debugging Tools

1. **Webhook.cool** - Test webhooks online
2. **RequestBin** - Capture webhook requests
3. **Hookbin** - Simple webhook testing
4. **ngrok** - Local webhook tunnel

## Error Handling Best Practices

```typescript
import { webhookEventEmitter } from './WebhookEventEmitter';

// 1. Wrap webhook events in try-catch
try {
  webhookEventEmitter.emitPaymentSuccess(paymentData);
} catch (error) {
  logger.error('Failed to emit webhook event', error);
  // Continue with normal flow - webhook failures shouldn't block business operations
}

// 2. Use event listeners for debugging
webhookEventEmitter.on('error', (error) => {
  logger.error('Webhook error:', error);
});

// 3. Test webhook delivery before deploying
const result = await webhookService.testWebhook(webhookId);
if (!result.success) {
  logger.warn('Webhook test failed, check configuration');
}
```

## Monitoring Webhook Health

### Set Up Alerts

```typescript
import { webhookMonitor } from './WebhookMonitor';

// Check webhook health periodically
setInterval(async () => {
  try {
    const health = await webhookMonitor.checkWebhookHealth(webhookId);
    
    if (!health.isHealthy) {
      // Alert on unhealthy webhook
      notificationService.alertWebhookUnhealthy(webhookId, health);
    }
  } catch (error) {
    logger.error('Health check failed:', error);
  }
}, 5 * 60 * 1000); // Check every 5 minutes
```

### Generate Reports

```typescript
// Weekly performance report
const report = await webhookMonitor.generatePerformanceReport(userId);
console.log('Success Rate:', report.metrics.successRate);
console.log('Failed Events:', report.topFailedEvents);
console.log('Recommendations:', report.recommendations);
```

## Performance Optimization Tips

1. **Use Async Event Emission**
   - Don't wait for webhook delivery
   - Let it run in background

2. **Batch Event Processing**
   - Combine multiple events if possible
   - Reduce API calls

3. **Cache Webhook Configuration**
   - Store active webhooks in cache
   - Reduce database queries

4. **Configure Appropriate Timeouts**
   - Set timeouts based on expectation
   - Balance between reliability and performance

5. **Use Connection Pooling**
   - Improve HTTP performance
   - Reuse connections

## Security Reminders

✅ **Always verify webhook signatures** on the receiving end
✅ **Use HTTPS only** - reject HTTP URLs
✅ **Never log webhook secrets** in plain text
✅ **Validate all webhook payload data**
✅ **Implement rate limiting** on webhook endpoints
✅ **Use strong secrets** (automatically generated)
✅ **Rotate secrets regularly** if compromised
✅ **Sanitize sensitive data** before sending

## Support & Issues

- Check webhook logs: `/api/webhooks/:webhookId/logs`
- Debug failed events: `/api/webhooks/testing/debug/:eventId`
- View delivery attempts: Event includes `deliveryAttempts` array
- Test webhook: `POST /api/webhooks/:webhookId/test`
