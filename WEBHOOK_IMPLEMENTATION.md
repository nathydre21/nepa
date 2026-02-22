# Webhook System Implementation Guide

## Overview

This document provides a complete guide to the webhook system implementation for the NEPA project. The webhook system enables real-time event notifications and external integrations with robust retry mechanisms, security features, and comprehensive monitoring.

## Features

✅ **Webhook Registration System**
- User-friendly webhook registration
- Support for multiple event types
- Custom headers and authentication
- HTTPS enforcement

✅ **Event-Driven Architecture**
- Real-time event triggering
- Multiple event types (payments, bills, users, documents, reports)
- Event payload customization
- Async event processing

✅ **Retry Mechanisms**
- Three retry strategies: EXPONENTIAL, LINEAR, FIXED
- Configurable max retries and delays
- Automatic retry scheduling
- Manual retry capabilities

✅ **Authentication & Security**
- HMAC-SHA256 webhook signature verification
- Payload validation
- IP rate limiting
- Sensitive data sanitization
- HTTPS-only webhooks

✅ **Logging & Monitoring**
- Comprehensive webhook logs
- Delivery attempt tracking
- Performance metrics
- Health status monitoring
- Real-time alerting

✅ **Management Interface**
- Dashboard for webhook overview
- Detailed webhook analytics
- Performance reports
- Failed delivery analysis
- Bulk retry operations

✅ **Testing Tools**
- Webhook testing interface
- Custom payload testing
- Test event creation
- Delivery debugging
- Test history tracking

## Database Schema

### Webhook Model
```typescript
model Webhook {
  id                String   @id @default(uuid())
  url               String   // HTTPS webhook endpoint
  events            String[] // Event types to listen to
  description       String?
  secret            String   // HMAC secret for signing
  isActive          Boolean  @default(true)
  retryPolicy       String   @default("EXPONENTIAL")
  maxRetries        Int      @default(3)
  retryDelaySeconds Int      @default(60)
  timeoutSeconds    Int      @default(30)
  headers           Json?    // Custom headers
  userId            String   // Owner of the webhook
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  user              User     @relation(fields: [userId], references: [id])
  hookedEvents      WebhookEvent[]
  logs              WebhookLog[]
}
```

### WebhookEvent Model
```typescript
model WebhookEvent {
  id          String   @id @default(uuid())
  webhookId   String
  eventType   String   // e.g., 'payment.success'
  payload     Json     // Event data
  deliveryUrl String
  status      String   @default("PENDING") // PENDING, DELIVERED, FAILED
  attempts    Int      @default(0)
  lastAttempt DateTime?
  nextRetry   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  webhook     Webhook  @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  deliveryAttempts WebhookAttempt[]
}
```

### WebhookAttempt Model
```typescript
model WebhookAttempt {
  id         String   @id @default(uuid())
  eventId    String
  statusCode Int?
  response   String?  // Response body
  error      String?  // Error message
  duration   Int?     // Response time in ms
  createdAt  DateTime @default(now())
  
  event      WebhookEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
}
```

### WebhookLog Model
```typescript
model WebhookLog {
  id        String   @id @default(uuid())
  webhookId String
  action    String   // CREATED, UPDATED, DELETED, TRIGGERED, FAILED
  details   String?
  status    String   // SUCCESS, FAILURE, WARNING
  createdAt DateTime @default(now())
  
  webhook   Webhook  @relation(fields: [webhookId], references: [id], onDelete: Cascade)
}
```

## API Endpoints

### Webhook Registration

#### Register a New Webhook
```http
POST /api/webhooks
Authorization: Bearer <API_KEY>

{
  "url": "https://example.com/webhook",
  "events": ["payment.success", "bill.created"],
  "description": "My webhook integration",
  "retryPolicy": "EXPONENTIAL",
  "maxRetries": 3,
  "retryDelaySeconds": 60,
  "timeoutSeconds": 30,
  "headers": {
    "X-Custom-Header": "value"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook registered successfully",
  "webhook": {
    "id": "webhook_123",
    "url": "https://example.com/webhook",
    "events": ["payment.success", "bill.created"],
    "secret": "whsec_xxx...",
    "createdAt": "2026-02-22T10:30:00Z"
  }
}
```

#### Get All Webhooks
```http
GET /api/webhooks
Authorization: Bearer <API_KEY>
```

#### Update Webhook
```http
PUT /api/webhooks/:webhookId
Authorization: Bearer <API_KEY>

{
  "url": "https://example.com/webhook/v2",
  "events": ["payment.success", "payment.failed"],
  "isActive": true,
  "maxRetries": 5
}
```

#### Delete Webhook
```http
DELETE /api/webhooks/:webhookId
Authorization: Bearer <API_KEY>
```

### Event Management

#### Get Webhook Events
```http
GET /api/webhooks/:webhookId/events?limit=50
Authorization: Bearer <API_KEY>
```

#### Get Webhook Statistics
```http
GET /api/webhooks/:webhookId/stats
Authorization: Bearer <API_KEY>

Response:
{
  "totalEvents": 1000,
  "successfulDeliveries": 950,
  "failedDeliveries": 50,
  "pendingDeliveries": 0,
  "successRate": 95.0,
  "averageResponseTime": 1250,
  "totalRetries": 75
}
```

#### Test Webhook
```http
POST /api/webhooks/:webhookId/test
Authorization: Bearer <API_KEY>

Response:
{
  "success": true,
  "statusCode": 200,
  "responseTime": 1250,
  "error": null
}
```

#### Retry Failed Event
```http
POST /api/webhooks/:webhookId/events/:eventId/retry
Authorization: Bearer <API_KEY>
```

### Management Routes

#### Dashboard
```http
GET /api/webhooks/admin/dashboard
Authorization: Bearer <API_KEY>
```

#### Webhook Details
```http
GET /api/webhooks/admin/:webhookId
Authorization: Bearer <API_KEY>
```

#### Performance Report
```http
GET /api/webhooks/admin/reports/performance?startDate=2026-02-15&endDate=2026-02-22
Authorization: Bearer <API_KEY>
```

#### Failed Deliveries
```http
GET /api/webhooks/admin/failed-deliveries?webhookId=&limit=50
Authorization: Bearer <API_KEY>
```

#### Bulk Retry
```http
POST /api/webhooks/admin/bulk-retry
Authorization: Bearer <API_KEY>

{
  "webhookId": "webhook_123",
  "eventIds": ["event_1", "event_2", "event_3"]
}
```

#### Export Data
```http
GET /api/webhooks/admin/export?format=json
Authorization: Bearer <API_KEY>
```

### Testing Routes

#### Create Test Event
```http
POST /api/webhooks/testing/create-event
Authorization: Bearer <API_KEY>

{
  "webhookId": "webhook_123",
  "eventType": "payment.success",
  "payload": {
    "paymentId": "pay_123",
    "amount": 100.00
  }
}
```

#### Get Test History
```http
GET /api/webhooks/testing/history/:webhookId?limit=20
Authorization: Bearer <API_KEY>
```

#### Debug Delivery
```http
GET /api/webhooks/testing/debug/:eventId
Authorization: Bearer <API_KEY>
```

## Webhook Payload Format

All webhook payloads follow this format:

```json
{
  "eventType": "payment.success",
  "data": {
    "paymentId": "pay_123",
    "userId": "user_456",
    "billId": "bill_789",
    "amount": 150.00,
    "method": "CARD",
    "transactionId": "txn_xyz",
    "timestamp": 1708598400000
  },
  "timestamp": 1708598400000
}
```

## Webhook Headers

All webhook requests include these headers:

```
Content-Type: application/json
X-Webhook-Signature: <HMAC-SHA256 signature>
X-Webhook-ID: <webhook_id>
X-Event-Type: <event_type>
X-Delivery-ID: <delivery_id>
```

### Verifying Webhook Signature

```typescript
import crypto from 'crypto';

const secret = 'your_webhook_secret';
const payload = req.body; // Raw body
const signature = req.headers['x-webhook-signature'];

const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

if (signature === expectedSignature) {
  // Webhook is authentic
}
```

## Event Types

The system supports the following event types:

- `payment.success` - Payment completed successfully
- `payment.failed` - Payment failed
- `bill.created` - New bill created
- `bill.paid` - Bill marked as paid
- `bill.overdue` - Bill is overdue
- `bill.updated` - Bill information updated
- `user.created` - New user registered
- `user.updated` - User profile updated
- `document.uploaded` - Document uploaded
- `report.generated` - Report generated

## Integration Examples

### Python
```python
import hmac
import hashlib
import json

@app.route('/webhook', methods=['POST'])
def webhook():
    payload = request.get_json()
    signature = request.headers.get('X-Webhook-Signature')
    secret = 'your_webhook_secret'
    
    # Verify signature
    expected_sig = hmac.new(
        secret.encode(),
        json.dumps(payload).encode(),
        hashlib.sha256
    ).hexdigest()
    
    if signature != expected_sig:
        return {'error': 'Invalid signature'}, 401
    
    # Process webhook
    event_type = payload['eventType']
    data = payload['data']
    
    return {'success': True}, 200
```

### Node.js
```javascript
const crypto = require('crypto');
const express = require('express');

app.post('/webhook', (req, res) => {
  const payload = req.body;
  const signature = req.headers['x-webhook-signature'];
  const secret = 'your_webhook_secret';
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook
  const { eventType, data, timestamp } = payload;
  
  res.json({ success: true });
});
```

### PHP
```php
<?php

$secret = 'your_webhook_secret';
$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'];

// Verify signature
$expectedSignature = hash_hmac('sha256', $payload, $secret);

if ($signature !== $expectedSignature) {
    http_response_code(401);
    exit('Invalid signature');
}

// Process webhook
$data = json_decode($payload, true);
$eventType = $data['eventType'];
$eventData = $data['data'];

http_response_code(200);
?>
```

## Retry Policies

### EXPONENTIAL (Default)
Delay = baseDelay × 2^attemptNumber

Example with 60s base delay:
- Attempt 1: 60s
- Attempt 2: 120s
- Attempt 3: 240s

### LINEAR
Delay = baseDelay × (attemptNumber + 1)

Example with 60s base delay:
- Attempt 1: 60s
- Attempt 2: 120s
- Attempt 3: 180s

### FIXED
Delay = baseDelay (constant)

Example with 60s base delay:
- Attempt 1: 60s
- Attempt 2: 60s
- Attempt 3: 60s

## Error Handling

### Common Error Responses

**400 Bad Request**
```json
{
  "success": false,
  "error": "URL and events array are required"
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "error": "Invalid signature"
}
```

**403 Forbidden**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**404 Not Found**
```json
{
  "success": false,
  "error": "Webhook not found"
}
```

**429 Too Many Requests**
```json
{
  "success": false,
  "error": "Webhook rate limit exceeded"
}
```

## Monitoring & Analytics

### Dashboard Metrics
- Total webhooks
- Active/inactive webhooks
- Total events
- Successful deliveries
- Failed deliveries
- Success rate
- Average response time
- Total retries

### Health Status
Each webhook is monitored for:
- Last delivery time
- Success rate
- Average response time
- Consecutive failures
- Health status (HEALTHY/UNHEALTHY)

A webhook is considered unhealthy if:
- Success rate < 80%
- More than 3 consecutive failures

### Recommendations
The system generates automatic recommendations:
- High failure rate alerts
- Performance optimization suggestions
- Inactive webhook cleanup
- Pending delivery investigation

## Best Practices

1. **Use HTTPS Only**
   - Always use HTTPS endpoints for webhooks
   - Verify SSL certificates

2. **Verify Signatures**
   - Always verify webhook signatures
   - Use constant-time comparison
   - Never trust unsigned webhooks

3. **Handle Retries**
   - Implement idempotency keys
   - Handle duplicate events gracefully
   - Return proper HTTP status codes

4. **Optimize Endpoints**
   - Keep webhook processing fast
   - Use 200-299 status codes for success
   - Return within timeout window

5. **Monitor Performance**
   - Track delivery rates
   - Monitor response times
   - Alert on failures
   - Review logs regularly

6. **Security**
   - Rotate webhook secrets regularly
   - Use rate limiting
   - Validate all input data
   - Never expose secrets in logs

## Troubleshooting

### High Failure Rate
1. Check webhook URL accessibility
2. Verify HTTPS certificate
3. Check network connectivity
4. Review error logs
5. Test with simple payload

### Slow Response Times
1. Optimize webhook endpoint
2. Check database queries
3. Reduce processing time
4. Increase timeout if needed
5. Profile endpoint performance

### Missing Events
1. Verify event subscription
2. Check webhook is active
3. Review event logs
4. Verify filters/conditions
5. Check authentication

### Signature Verification Failures
1. Verify secret is correct
2. Use raw body for verification
3. Check encoding (UTF-8)
4. Verify signature header name
5. Test with provided examples

## Database Migration

Run the following command to apply the webhook schema:

```bash
npm run prisma:migrate
```

This will:
1. Create Webhook table
2. Create WebhookEvent table
3. Create WebhookAttempt table
4. Create WebhookLog table
5. Add relationships to User table
6. Create necessary indexes

## Performance Considerations

- **Connection Pooling**: Use connection pooling for better performance
- **Caching**: Cache webhook configuration
- **Indexing**: Indexes are created on frequently queried fields
- **Cleanup**: Regular cleanup of old logs recommended
- **Batch Operations**: Use bulk retry for multiple events

## Security Considerations

- All webhooks require HTTPS
- Webhook secrets are generated securely
- Payloads are signed with HMAC-SHA256
- Sensitive data is sanitized in logs
- Rate limiting prevents abuse
- IP restrictions can be configured

## Support

For issues or questions about the webhook system:
1. Check the troubleshooting section
2. Review webhook logs
3. Test with webhook testing tools
4. Contact support with webhook ID and event ID
