import request from 'supertest';
import app from '../../app';

const API_KEY = process.env.API_KEY || 'test-api-key';

describe('Fraud API Integration Tests', () => {
  const authHeader = { 'x-api-key': API_KEY };

  beforeAll(() => {
    process.env.API_KEY = API_KEY;
  });

  describe('POST /api/fraud/detect', () => {
    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/fraud/detect')
        .set(authHeader)
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/transactionId|features|userId/);
    });

    it('should run fraud detection and return score', async () => {
      const features = {
        amount: 100,
        currency: 'USD',
        network: 'stellar',
        timestamp: new Date(),
        userId: 'user-test',
        userTransactionCount24h: 2,
        userTransactionCount7d: 10,
        userTransactionCount30d: 40,
        userAvgTransactionAmount: 100,
        userTotalAmount24h: 200,
        userTotalAmount7d: 1000,
        userTotalAmount30d: 4000,
        userAccountAge: 365,
        userLastLoginTime: new Date(),
        userLoginFrequency: 5,
        ipAddress: '192.168.1.1',
        country: 'US',
        city: 'NYC',
        isHighRiskCountry: false,
        isVPN: false,
        isTor: false,
        distanceFromLastLocation: 0,
        locationChangeTime: 24,
        deviceId: 'dev-1',
        deviceFingerprint: 'fp-1',
        userAgent: 'Mozilla/5.0',
        isNewDevice: false,
        deviceAge: 180,
        deviceTransactionCount: 20,
        hourOfDay: 14,
        dayOfWeek: 3,
        isWeekend: false,
        isBusinessHours: true,
        timeSinceLastTransaction: 120,
        transactionVelocity: 2,
        blockchainNetwork: 'stellar',
        isCrossChain: false,
        isRecurringPayment: false,
        isUnusualAmount: false,
        isUnusualTime: false,
        isUnusualLocation: false,
        isUnusualDevice: false,
        amountDeviationFromAvg: 0.5,
        frequencyDeviationFromAvg: 0.2,
        isBlacklistedAddress: false,
        isBlacklistedDevice: false,
        isBlacklistedIP: false,
        hasFailedTransactions: false,
        failedTransactionCount: 0,
        chargebackHistory: 0,
      };

      const res = await request(app)
        .post('/api/fraud/detect')
        .set(authHeader)
        .send({
          transactionId: 'txn-int-1',
          userId: 'user-int-1',
          features,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          deviceId: 'dev-1',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.result).toBeDefined();
      expect(typeof res.body.data.result.riskScore).toBe('number');
      expect(res.body.data.result.riskScore).toBeGreaterThanOrEqual(0);
      expect(res.body.data.result.riskScore).toBeLessThanOrEqual(100);
    });
  });

  describe('GET /api/fraud/stats', () => {
    it('should return fraud stats', async () => {
      const res = await request(app)
        .get('/api/fraud/stats')
        .set(authHeader)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('GET /api/fraud/cases', () => {
    it('should return fraud cases list', async () => {
      const res = await request(app)
        .get('/api/fraud/cases')
        .set(authHeader)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.cases)).toBe(true);
    });
  });

  describe('GET /api/fraud/analytics', () => {
    it('should return fraud analytics', async () => {
      const res = await request(app)
        .get('/api/fraud/analytics')
        .set(authHeader)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('Unauthorized', () => {
    it('should return 401 without API key', async () => {
      await request(app)
        .post('/api/fraud/detect')
        .send({ transactionId: 'x', userId: 'y', features: {} })
        .expect(401);
    });
  });
});
