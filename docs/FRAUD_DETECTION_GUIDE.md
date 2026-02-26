# Fraud Detection System Guide

This guide provides comprehensive documentation for the ML-based fraud detection and prevention system implemented in the NEPA platform.

## Overview

The fraud detection system uses machine learning to identify and prevent fraudulent payment transactions in real-time. It combines TensorFlow.js for ML inference, adaptive learning capabilities, and a comprehensive manual review workflow.

## Architecture

### Core Components

1. **FraudDetectionService** - Core ML service for real-time fraud detection
2. **FraudReviewService** - Manual review workflow management
3. **FraudDetectionController** - API endpoints for fraud operations
4. **FraudDetectionDashboard** - React UI for monitoring and management
5. **Database Models** - Prisma schema for fraud data persistence

### Machine Learning Pipeline

```
Transaction Input → Feature Extraction → ML Model → Risk Score → Decision
                                    ↓
                              Adaptive Learning ← Manual Review
```

## Features

### Real-Time Fraud Detection

- **Multi-dimensional feature analysis** (50+ features)
- **Risk scoring** (0-100 scale)
- **Automatic blocking** for high-risk transactions
- **Pattern recognition** for various fraud types

### Supported Fraud Types

1. **Account Takeover** - Unauthorized account access
2. **Synthetic Identity** - Fake user identities
3. **Card Testing** - Testing stolen card numbers
4. **Velocity Attacks** - High-frequency transactions
5. **Collusion** - Coordinated fraud attempts
6. **Money Laundering** - Illicit fund movement
7. **Geographic Anomalies** - Suspicious location changes
8. **Device Anomalies** - New/unknown devices
9. **Behavioral Anomalies** - Unusual user patterns
10. **Amount Anomalies** - Irregular transaction amounts
11. **Time Anomalies** - Suspicious timing patterns

### Adaptive Learning

- **Continuous model improvement** from confirmed cases
- **Automatic retraining** with new data
- **Performance monitoring** and model versioning
- **Feature importance** tracking

### Manual Review Workflow

- **Case assignment** to fraud analysts
- **Priority-based** review queue
- **Escalation procedures** for complex cases
- **Audit trail** for compliance

## Getting Started

### 1. Installation

Install the required dependencies:

```bash
npm install @tensorflow/tfjs node-cron geoip-lite useragent
npm install --save-dev @types/geoip-lite @types/node-cron @types/useragent
```

### 2. Database Migration

Run the database migrations to add fraud detection tables:

```bash
npx prisma migrate dev --name add-fraud-detection
npx prisma generate
```

### 3. Configuration

Add environment variables for fraud detection:

```env
# Fraud Detection Configuration
FRAUD_DETECTION_ENABLED=true
FRAUD_MODEL_PATH=./models/fraud-detection-model
FRAUD_THRESHOLD=75
FRAUD_REVIEW_THRESHOLD=50
FRAUD_ADAPTIVE_LEARNING=true
FRAUD_TRAINING_INTERVAL=24 # hours

# Notification Configuration
FRAUD_ALERT_EMAIL_ENABLED=true
FRAUD_ALERT_SLACK_ENABLED=true
FRAUD_ALERT_WEBHOOK_URL=https://your-webhook-url.com

# Blacklist Configuration
FRAUD_BLACKLIST_ENABLED=true
FRAUD_BLACKLIST_UPDATE_INTERVAL=3600 # seconds
```

### 4. Initialize the Service

```typescript
import { FraudDetectionService } from './src/fraud/FraudDetectionService';
import { FraudReviewService } from './src/fraud/FraudReviewService';

// Initialize fraud detection
const fraudDetectionService = new FraudDetectionService();
const fraudReviewService = new FraudReviewService(prismaClient);

// Start adaptive learning
setInterval(async () => {
  await fraudDetectionService.adaptiveLearning();
}, 24 * 60 * 60 * 1000); // Every 24 hours
```

## Usage Examples

### Basic Fraud Detection

```typescript
import { FraudDetectionService, FraudDetectionRequest } from './src/fraud';

const fraudService = new FraudDetectionService();

const request: FraudDetectionRequest = {
  transactionId: 'tx-12345',
  features: {
    amount: 1000,
    currency: 'USD',
    network: 'stellar',
    userId: 'user-123',
    // ... other features
  },
  userId: 'user-123',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  deviceId: 'device-123',
  timestamp: new Date()
};

const result = await fraudService.detectFraud(request);

if (result.success && result.result) {
  console.log('Risk Score:', result.result.riskScore);
  console.log('Risk Level:', result.result.riskLevel);
  console.log('Should Block:', result.result.shouldBlock);
  
  if (result.result.requiresManualReview) {
    // Create manual review case
    await fraudReviewService.createFraudCase(
      result.result,
      request.transactionId,
      request.userId
    );
  }
}
```

### Manual Review Process

```typescript
// Get cases for review
const cases = await fraudReviewService.getFraudCasesInTimeRange({
  start: new Date(Date.now() - 24 * 60 * 60 * 1000),
  end: new Date()
});

// Assign case to reviewer
const workflow = await fraudReviewService.assignCaseToReviewer(cases[0]);

// Complete review
await fraudReviewService.completeReview(
  cases[0].id,
  'reviewer-123',
  'fraud', // or 'legitimate' or 'investigating'
  'Confirmed fraudulent activity based on transaction patterns',
  ['evidence.pdf']
);
```

### Model Training

```typescript
// Prepare training data
const trainingData = [
  {
    id: 'train-1',
    transactionId: 'tx-train-1',
    features: transactionFeatures,
    isFraud: false,
    confidence: 0.95,
    modelVersion: '1.0.0',
    dataSource: 'manual_review',
    createdAt: new Date()
  }
  // ... more samples
];

// Train the model
await fraudDetectionService.trainModel(trainingData);
```

## API Endpoints

### Fraud Detection

#### POST /api/fraud/detect
Detect fraud in a transaction

```json
{
  "transactionId": "tx-12345",
  "features": {
    "amount": 1000,
    "currency": "USD",
    "network": "stellar",
    "userId": "user-123"
  },
  "userId": "user-123",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "deviceId": "device-123"
}
```

#### GET /api/fraud/stats
Get fraud detection statistics

```json
{
  "timeRange": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-02T00:00:00Z"
  }
}
```

### Case Management

#### GET /api/fraud/cases
Get fraud cases with filtering

```json
{
  "status": "review_required",
  "riskLevel": "high",
  "page": 1,
  "limit": 20
}
```

#### GET /api/fraud/cases/:caseId
Get specific fraud case details

#### POST /api/fraud/cases/:caseId/complete
Complete fraud case review

```json
{
  "reviewerId": "reviewer-123",
  "decision": "fraud",
  "notes": "Confirmed fraudulent activity",
  "attachments": ["evidence.pdf"]
}
```

#### POST /api/fraud/cases/:caseId/escalate
Escalate case to higher authority

```json
{
  "reason": "Complex case requiring senior review",
  "escalatedBy": "reviewer-123"
}
```

### Model Management

#### POST /api/fraud/train
Train fraud detection model

```json
{
  "modelType": "neural_network",
  "trainingData": [...],
  "validationSplit": 0.2,
  "hyperparameters": {
    "learningRate": 0.001,
    "epochs": 50
  }
}
```

## Feature Engineering

### Transaction Features

The system analyzes 50+ features across multiple categories:

#### Basic Transaction Features
- Amount and currency
- Blockchain network
- Timestamp

#### User Behavior Features
- Transaction frequency (24h, 7d, 30d)
- Average transaction amounts
- Account age
- Login patterns

#### Geographic Features
- IP address and country
- Distance from last location
- VPN/Tor detection
- High-risk country flags

#### Device Features
- Device fingerprint
- New device detection
- Device age and usage

#### Temporal Features
- Hour of day and day of week
- Weekend/business hours
- Time since last transaction

#### Network Features
- Blockchain network details
- Cross-chain transactions
- Gas prices and confirmations

#### Pattern Features
- Recurring payment detection
- Amount/frequency deviations
- Unusual patterns

#### Risk Indicators
- Blacklist checks
- Failed transaction history
- Chargeback history

### Feature Normalization

All features are normalized to 0-1 range for optimal ML performance:

```typescript
// Example normalization
const normalizedAmount = amount / 10000; // Normalize to $10,000 max
const normalizedFrequency = transactionCount / 100; // Normalize to 100 max
const normalizedDistance = distance / 10000; // Normalize to 10,000km max
```

## Risk Scoring

### Risk Levels

- **LOW (0-39)**: Normal transaction, proceed
- **MEDIUM (40-59)**: Monitor, may require review
- **HIGH (60-79)**: Manual review required
- **CRITICAL (80-100)**: Block transaction immediately

### Decision Logic

```typescript
if (riskScore >= CRITICAL_THRESHOLD) {
  // Block transaction
  return { shouldBlock: true, requiresManualReview: true };
} else if (riskScore >= REVIEW_THRESHOLD) {
  // Allow but require manual review
  return { shouldBlock: false, requiresManualReview: true };
} else {
  // Allow transaction
  return { shouldBlock: false, requiresManualReview: false };
}
```

## Model Performance

### Metrics

The system tracks comprehensive performance metrics:

- **Accuracy**: Overall prediction accuracy
- **Precision**: True positive rate
- **Recall**: Fraud detection rate
- **F1 Score**: Balance of precision and recall
- **False Positive Rate**: Legitimate transactions flagged
- **False Negative Rate**: Fraudulent transactions missed

### Monitoring

```typescript
const metrics = await fraudDetectionService.getModelMetrics();
console.log('Model Performance:', {
  accuracy: metrics.accuracy,
  precision: metrics.precision,
  recall: metrics.recall,
  f1Score: metrics.f1Score,
  falsePositiveRate: metrics.falsePositiveRate
});
```

## Security Considerations

### Data Privacy

- **PII Protection**: Sensitive data encrypted at rest
- **Feature Hashing**: IP addresses and device fingerprints hashed
- **Data Retention**: Limited retention periods for compliance

### Model Security

- **Model Versioning**: Track model changes and performance
- **Adversarial Protection**: Detect and prevent model poisoning
- **Access Control**: Restricted access to model training data

### Compliance

- **Audit Trail**: Complete audit of all fraud decisions
- **Explainability**: Reasons provided for all fraud decisions
- **Regulatory Compliance**: GDPR, PCI DSS, and other regulations

## Troubleshooting

### Common Issues

#### High False Positive Rate

**Symptoms**: Many legitimate transactions flagged as fraud

**Solutions**:
1. Lower risk thresholds
2. Add more legitimate training data
3. Review feature engineering
4. Check for data quality issues

#### High False Negative Rate

**Symptoms**: Fraudulent transactions not detected

**Solutions**:
1. Increase risk thresholds
2. Add more fraud training data
3. Review fraud patterns
4. Update feature importance

#### Model Performance Degradation

**Symptoms**: Decreasing accuracy over time

**Solutions**:
1. Enable adaptive learning
2. Retrain with recent data
3. Monitor feature drift
4. Update model architecture

### Debug Mode

Enable debug logging for detailed troubleshooting:

```typescript
const fraudService = new FraudDetectionService({
  debug: true,
  logLevel: 'verbose'
});
```

### Performance Optimization

#### Model Optimization

```typescript
// Use quantized model for faster inference
const optimizedModel = await tf.loadLayersModel(
  'file://./models/fraud-detection-model-quantized/model.json'
);
```

#### Caching

```typescript
// Cache feature extraction results
const featureCache = new Map();
const cacheKey = `${userId}-${deviceId}-${ipAddress}`;

if (featureCache.has(cacheKey)) {
  return featureCache.get(cacheKey);
}
```

## Best Practices

### Model Training

1. **Data Quality**: Ensure high-quality, labeled training data
2. **Balanced Dataset**: Maintain balance between fraud and legitimate samples
3. **Cross-Validation**: Use proper validation techniques
4. **Regular Updates**: Retrain models regularly with new data

### Feature Engineering

1. **Domain Knowledge**: Incorporate fraud domain expertise
2. **Feature Selection**: Use only relevant features
3. **Normalization**: Properly normalize all features
4. **Monitoring**: Track feature importance and drift

### Operations

1. **Monitoring**: Continuous monitoring of system performance
2. **Alerting**: Set up alerts for anomalies
3. **Documentation**: Maintain comprehensive documentation
4. **Testing**: Regular testing of fraud detection rules

## Integration Examples

### Payment Processing Integration

```typescript
// In your payment processing pipeline
export async function processPayment(paymentData: PaymentData) {
  // Extract fraud detection features
  const features = await extractTransactionFeatures(paymentData);
  
  // Detect fraud
  const fraudResult = await fraudDetectionService.detectFraud({
    transactionId: paymentData.id,
    features,
    userId: paymentData.userId,
    ipAddress: paymentData.ipAddress,
    userAgent: paymentData.userAgent,
    deviceId: paymentData.deviceId,
    timestamp: new Date()
  });

  if (!fraudResult.success || fraudResult.result?.shouldBlock) {
    throw new Error('Transaction blocked due to fraud risk');
  }

  // Process payment if not blocked
  return await paymentProcessor.process(paymentData);
}
```

### Webhook Integration

```typescript
// Handle fraud alerts via webhook
app.post('/webhook/fraud-alert', async (req, res) => {
  const { alertType, severity, transactionId, details } = req.body;
  
  // Send notification to security team
  await notificationService.send({
    type: 'fraud_alert',
    message: `Fraud alert: ${alertType}`,
    severity,
    details: {
      transactionId,
      ...details
    }
  });

  res.status(200).send('Alert received');
});
```

## Future Enhancements

### Planned Features

1. **Advanced ML Models**
   - Graph neural networks for transaction networks
   - Ensemble models for better accuracy
   - Real-time online learning

2. **Enhanced Features**
   - Behavioral biometrics
   - Social network analysis
   - Advanced device fingerprinting

3. **Integration Improvements**
   - Third-party fraud data sources
   - Blockchain analysis tools
   - Regulatory reporting automation

4. **User Experience**
   - Real-time fraud alerts to users
   - Self-service dispute resolution
   - Fraud education resources

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review system logs and metrics
3. Contact the fraud detection team
4. Create detailed bug reports with:
   - Transaction IDs
   - Expected vs actual behavior
   - System logs
   - Model version

---

This guide provides comprehensive coverage of the fraud detection system. For specific implementation details, refer to the source code and inline documentation.
