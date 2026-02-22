# Webhook System - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- PostgreSQL database
- TypeScript knowledge

### Installation

1. **Install Dependencies**
```bash
npm install
```

2. **Run Database Migration**
```bash
npm run prisma:migrate
```

> This creates all webhook tables: `Webhook`, `WebhookEvent`, `WebhookAttempt`, `WebhookLog`

3. **Start Development Server**
```bash
npm run dev
```

Server will be running at `http://localhost:3000`

---

## 📝 Register Your First Webhook

### Step 1: Get Your API Key
Contact admin or use existing API key for authentication

### Step 2: Register Webhook via API

```bash
curl -X POST http://localhost:3000/api/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/webhook",
    "events": ["payment.success", "bill.created"],
    "description": "My integration webhook",
    "retryPolicy": "EXPONENTIAL",
    "maxRetries": 3,
    "retryDelaySeconds": 60,
    "timeoutSeconds": 30
  }'
```

**Response:**
```json
{
  "success": true,
  "webhook": {
    "id": "webhook_abc123",
    "url": "https://your-domain.com/webhook",
    "events": ["payment.success", "bill.created"],
    "secret": "whsec_xyz789",
    "createdAt": "2026-02-22T10:30:00Z"
  }
}
```

**Save the `secret`** - You'll need it to verify webhook signatures!

---

## 🔐 Verify Webhook Signatures

### Using Node.js

```javascript
const crypto = require('crypto');

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = 'whsec_xyz789'; // Your webhook secret
  
  const payload = req.body;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  if (signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook
  console.log('Event:', payload.eventType);
  console.log('Data:', payload.data);
  
  res.json({ success: true });
});
```

### Using Python

```python
import hmac
import hashlib
import json

@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Webhook-Signature')
    secret = 'whsec_xyz789'
    payload = request.get_json()
    
    expected = hmac.new(
        secret.encode(),
        json.dumps(payload).encode(),
        hashlib.sha256
    ).hexdigest()
    
    if signature != expected:
        return {'error': 'Invalid signature'}, 401
    
    event_type = payload['eventType']
    data = payload['data']
    
    return {'success': True}
```

---

## 📊 Monitor Your Webhooks

### Get Webhook Stats
```bash
curl -X GET http://localhost:3000/api/webhooks/webhook_abc123/stats \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalEvents": 150,
    "successfulDeliveries": 145,
    "failedDeliveries": 5,
    "pendingDeliveries": 0,
    "successRate": 96.67,
    "averageResponseTime": 1250
  }
}
```

### Get Dashboard
```bash
curl -X GET http://localhost:3000/api/webhooks/admin/dashboard \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### View Webhook Logs
```bash
curl -X GET http://localhost:3000/api/webhooks/webhook_abc123/logs?limit=10 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 🧪 Test Your Webhook

### Test Delivery
```bash
curl -X POST http://localhost:3000/api/webhooks/webhook_abc123/test \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Send Test Event
```bash
curl -X POST http://localhost:3000/api/webhooks/testing/create-event \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookId": "webhook_abc123",
    "eventType": "payment.success",
    "payload": {
      "paymentId": "pay_123",
      "amount": 100.00,
      "userId": "user_456"
    }
  }'
```

### Debug Failed Event
```bash
curl -X GET http://localhost:3000/api/webhooks/testing/debug/event_xyz \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 📋 Webhook Events

### Supported Events
- `payment.success` - Payment completed
- `payment.failed` - Payment failed
- `bill.created` - New bill
- `bill.paid` - Bill marked paid
- `bill.overdue` - Bill overdue
- `bill.updated` - Bill updated
- `user.created` - New user
- `user.updated` - User updated
- `document.uploaded` - Document uploaded
- `report.generated` - Report created

---

## 🔄 Retry Policies

### EXPONENTIAL (Default)
- Attempt 1: 60s delay
- Attempt 2: 120s delay
- Attempt 3: 240s delay

### LINEAR
- Attempt 1: 60s delay
- Attempt 2: 120s delay
- Attempt 3: 180s delay

### FIXED
- All attempts: 60s delay

---

## 📚 Full Documentation

- [WEBHOOK_IMPLEMENTATION.md](./WEBHOOK_IMPLEMENTATION.md) - Complete API reference
- [WEBHOOK_INTEGRATION_GUIDE.md](./WEBHOOK_INTEGRATION_GUIDE.md) - Integration examples

---

## 🐛 Troubleshooting

### Webhook Not Delivering
1. Check webhook is active: `GET /api/webhooks`
2. Verify URL is HTTPS
3. Check logs: `GET /api/webhooks/:webhookId/logs`
4. Test delivery: `POST /api/webhooks/:webhookId/test`

### High Failure Rate
1. Check webhook endpoint response times
2. Verify endpoint returns 200-299 status code
3. Review error logs
4. Increase timeout if needed

### Signature Verification Failed
1. Verify secret is correct
2. Use raw JSON body for verification
3. Check header name: `X-Webhook-Signature`
4. Use HMAC-SHA256 algorithm

---

## 📊 API Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks` | POST | Register webhook |
| `/api/webhooks` | GET | List webhooks |
| `/api/webhooks/:id` | PUT | Update webhook |
| `/api/webhooks/:id` | DELETE | Delete webhook |
| `/api/webhooks/:id/stats` | GET | Get statistics |
| `/api/webhooks/:id/test` | POST | Test delivery |
| `/api/webhooks/admin/dashboard` | GET | View dashboard |
| `/api/webhooks/testing/create-event` | POST | Create test event |
| `/api/webhooks/testing/debug/:eventId` | GET | Debug event |

---

## ✅ Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Database migrated (`npm run prisma:migrate`)
- [ ] Server running (`npm run dev`)
- [ ] Webhook registered
- [ ] Secret saved for verification
- [ ] Local endpoint ready (use ngrok: `ngrok http 3000`)
- [ ] Signature verification implemented
- [ ] Test event received and processed
- [ ] Production endpoint configured
- [ ] Monitoring set up

---

## 🆘 Getting Help

### Check Webhook Health
```bash
curl -X GET http://localhost:3000/api/webhooks/admin/:webhookId \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### View Failed Deliveries
```bash
curl -X GET http://localhost:3000/api/webhooks/admin/failed-deliveries \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Generate Report
```bash
curl -X GET "http://localhost:3000/api/webhooks/admin/reports/performance?startDate=2026-02-15&endDate=2026-02-22" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## 🔐 Security Best Practices

✅ Always use HTTPS endpoints
✅ Always verify webhook signatures
✅ Never expose webhook secrets in logs
✅ Validate all webhook payload data
✅ Implement idempotency for retries
✅ Return appropriate HTTP status codes
✅ Keep webhook endpoints fast

---

## 🚀 Next Steps

1. Read [WEBHOOK_IMPLEMENTATION.md](./WEBHOOK_IMPLEMENTATION.md) for full API reference
2. Check [WEBHOOK_INTEGRATION_GUIDE.md](./WEBHOOK_INTEGRATION_GUIDE.md) for integration examples
3. Set up monitoring and alerting
4. Deploy to staging environment
5. Test with real data
6. Deploy to production

---

**Ready to integrate? Start with your first webhook! 🎉**
