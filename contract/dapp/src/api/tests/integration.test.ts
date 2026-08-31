import { IntegrationLayer, APIConfig } from '../integration-layer';
import { BankingIntegration, BankingConfig } from '../banking-integration';
import { CreditScoringService, CreditScoringConfig } from '../credit-scoring';
import { UtilityProviderIntegration, UtilityProviderConfig } from '../utility-provider';
import { IntegrationMonitor, MonitoringConfig } from '../integration-monitor';

describe('Integration Layer Tests', () => {
  let integrationLayer: IntegrationLayer;
  let bankingIntegration: BankingIntegration;
  let creditScoringService: CreditScoringService;
  let utilityProviderIntegration: UtilityProviderIntegration;
  let monitor: IntegrationMonitor;

  const mockAPIConfig: APIConfig = {
    baseURL: 'https://mock-api.test.com/v1',
    timeout: 5000,
    retryAttempts: 2,
    retryDelay: 1000,
    rateLimitRPS: 10,
    auth: {
      type: 'apikey',
      credentials: {
        apiKey: 'test-key',
        apiSecret: 'test-secret'
      }
    }
  };

  const mockBankingConfig: BankingConfig = {
    apiKey: 'test-banking-key',
    apiSecret: 'test-banking-secret',
    environment: 'sandbox',
    webhookUrl: 'https://test.webhook.com',
    supportedBanks: ['TEST_BANK'],
    defaultCurrency: 'USD'
  };

  const mockCreditConfig: CreditScoringConfig = {
    apiKey: 'test-credit-key',
    apiSecret: 'test-credit-secret',
    environment: 'sandbox',
    webhookUrl: 'https://test.webhook.com',
    defaultCurrency: 'USD',
    scoreModel: 'fico'
  };

  const mockUtilityConfig: UtilityProviderConfig = {
    apiKey: 'test-utility-key',
    apiSecret: 'test-utility-secret',
    environment: 'sandbox',
    webhookUrl: 'https://test.webhook.com',
    defaultCurrency: 'USD',
    supportedProviders: ['TEST_UTILITY']
  };

  const mockMonitoringConfig: MonitoringConfig = {
    logLevel: 'info',
    retentionPeriod: 7,
    maxLogEntries: 1000,
    alertConfig: {
      enabled: true,
      thresholds: {
        errorRate: 5,
        responseTime: 5000,
        rateLimitHits: 10,
        cacheHitRate: 80
      },
      cooldown: 300000,
      channels: []
    },
    healthCheckInterval: 60000,
    metricsInterval: 30000
  };

  beforeEach(() => {
    integrationLayer = new IntegrationLayer(mockAPIConfig);
    bankingIntegration = new BankingIntegration(mockBankingConfig);
    creditScoringService = new CreditScoringService(mockCreditConfig);
    utilityProviderIntegration = new UtilityProviderIntegration(mockUtilityConfig);
    monitor = new IntegrationMonitor(mockMonitoringConfig);
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  describe('IntegrationLayer', () => {
    it('should initialize with correct configuration', () => {
      expect(integrationLayer).toBeDefined();
      const metrics = integrationLayer.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
    });

    it('should handle rate limiting', async () => {
      // Mock rate limit scenario
      const requests = Array.from({ length: 15 }, (_, i) => 
        integrationLayer.get(`/test-endpoint-${i}`)
      );

      const results = await Promise.allSettled(requests);
      const failedRequests = results.filter(r => r.status === 'rejected');
      
      // Some requests should fail due to rate limiting
      expect(failedRequests.length).toBeGreaterThan(0);
    });

    it('should cache responses', async () => {
      // Mock successful response
      jest.spyOn(integrationLayer['axiosInstance'], 'request')
        .mockResolvedValueOnce({
          data: { test: 'data' },
          status: 200,
          config: { metadata: { responseTime: 100 } }
        });

      const response1 = await integrationLayer.get('/test-cache');
      const response2 = await integrationLayer.get('/test-cache');

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
      expect(response2.cached).toBe(true);
    });

    it('should retry failed requests', async () => {
      // Mock failure then success
      const mockRequest = jest.spyOn(integrationLayer['axiosInstance'], 'request')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: { test: 'data' },
          status: 200,
          config: { metadata: { responseTime: 200 } }
        });

      const response = await integrationLayer.get('/test-retry');

      expect(response.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('should handle webhook events', (done) => {
      integrationLayer.on('api_failure', (data) => {
        expect(data.error).toBeDefined();
        expect(data.url).toBeDefined();
        done();
      });

      // Trigger a failure
      jest.spyOn(integrationLayer['axiosInstance'], 'request')
        .mockRejectedValueOnce(new Error('Test error'));

      integrationLayer.get('/test-webhook');
    });
  });

  describe('BankingIntegration', () => {
    it('should initialize banking integration', () => {
      expect(bankingIntegration).toBeDefined();
    });

    it('should handle account retrieval', async () => {
      // Mock account data
      const mockAccounts = [
        {
          id: 'acc-1',
          accountNumber: '123456789',
          accountType: 'checking' as const,
          bankName: 'Test Bank',
          routingNumber: '987654321',
          balance: 1000.00,
          currency: 'USD',
          status: 'active' as const,
          lastUpdated: new Date().toISOString()
        }
      ];

      jest.spyOn(bankingIntegration['integrationLayer'], 'get')
        .mockResolvedValueOnce({
          success: true,
          data: mockAccounts
        });

      const response = await bankingIntegration.getAccounts();

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0].accountType).toBe('checking');
    });

    it('should validate account information', async () => {
      jest.spyOn(bankingIntegration['integrationLayer'], 'post')
        .mockResolvedValueOnce({
          success: true,
          data: {
            valid: true,
            bankName: 'Test Bank',
            accountType: 'checking'
          }
        });

      const response = await bankingIntegration.validateAccount('123456789', '987654321');

      expect(response.success).toBe(true);
      expect(response.data?.valid).toBe(true);
    });

    it('should handle payment initiation', async () => {
      const paymentRequest = {
        accountId: 'acc-1',
        recipientAccount: 'acc-2',
        amount: 100.00,
        currency: 'USD',
        description: 'Test payment'
      };

      jest.spyOn(bankingIntegration['integrationLayer'], 'post')
        .mockResolvedValueOnce({
          success: true,
          data: {
            paymentId: 'pay-123',
            status: 'pending' as const,
            fees: 2.50,
            trackingUrl: 'https://track.payment.com/pay-123'
          }
        });

      const response = await bankingIntegration.initiatePayment(paymentRequest);

      expect(response.success).toBe(true);
      expect(response.data?.paymentId).toBe('pay-123');
      expect(response.data?.status).toBe('pending');
    });
  });

  describe('CreditScoringService', () => {
    it('should initialize credit scoring service', () => {
      expect(creditScoringService).toBeDefined();
    });

    it('should handle credit score requests', async () => {
      const scoreRequest = {
        customerId: 'cust-1',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        },
        email: 'john.doe@test.com',
        phone: '+1234567890',
        annualIncome: 50000,
        employmentStatus: 'employed' as const,
        employerName: 'Test Company',
        employmentDuration: 24
      };

      jest.spyOn(creditScoringService['integrationLayer'], 'post')
        .mockResolvedValueOnce({
          success: true,
          data: {
            score: 750,
            scoreRange: { min: 300, max: 850 },
            grade: 'A' as const,
            factors: [],
            recommendations: [],
            lastUpdated: new Date().toISOString(),
            confidence: 0.95
          }
        });

      const response = await creditScoringService.getCreditScore(scoreRequest);

      expect(response.success).toBe(true);
      expect(response.data?.score).toBe(750);
      expect(response.data?.grade).toBe('A');
    });

    it('should validate credit score requests', async () => {
      const invalidRequest = {
        customerId: '',
        firstName: '',
        lastName: '',
        dateOfBirth: '',
        address: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: ''
        },
        email: 'invalid-email',
        phone: '',
        annualIncome: -1000,
        employmentStatus: 'employed' as const
      };

      const response = await creditScoringService.getCreditScore(invalidRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Missing required fields');
    });

    it('should handle fraud detection', async () => {
      const fraudRequest = {
        customerId: 'cust-1',
        transactionDetails: {
          amount: 1000.00,
          currency: 'USD',
          merchant: 'Test Merchant',
          location: {
            ip: '192.168.1.1',
            device: 'mobile'
          },
          timestamp: new Date()
        },
        customerBehavior: {
          averageTransactionAmount: 100.00,
          transactionFrequency: 5,
          usualLocations: ['US', 'CA'],
          usualMerchants: ['Amazon', 'Walmart']
        }
      };

      jest.spyOn(creditScoringService['integrationLayer'], 'post')
        .mockResolvedValueOnce({
          success: true,
          data: {
            riskScore: 25,
            riskLevel: 'low' as const,
            confidence: 0.9,
            factors: [],
            recommendation: 'approve' as const,
            reason: 'Low risk transaction'
          }
        });

      const response = await creditScoringService.detectFraud(fraudRequest);

      expect(response.success).toBe(true);
      expect(response.data?.riskLevel).toBe('low');
      expect(response.data?.recommendation).toBe('approve');
    });
  });

  describe('UtilityProviderIntegration', () => {
    it('should initialize utility provider integration', () => {
      expect(utilityProviderIntegration).toBeDefined();
    });

    it('should handle provider listing', async () => {
      const mockProviders = [
        {
          id: 'provider-1',
          name: 'Test Electric',
          type: 'electricity' as const,
          country: 'US',
          region: 'West',
          supportedServices: ['billing', 'usage'],
          apiVersion: 'v1',
          status: 'active' as const
        }
      ];

      jest.spyOn(utilityProviderIntegration['integrationLayer'], 'get')
        .mockResolvedValueOnce({
          success: true,
          data: mockProviders
        });

      const response = await utilityProviderIntegration.getProviders();

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0].type).toBe('electricity');
    });

    it('should handle utility account linking', async () => {
      jest.spyOn(utilityProviderIntegration['integrationLayer'], 'post')
        .mockResolvedValueOnce({
          success: true,
          data: {
            accountId: 'util-acc-1',
            status: 'verified' as const,
            verificationRequired: false
          }
        });

      const response = await utilityProviderIntegration.linkUtilityAccount('provider-1', {
        accountNumber: '123456789',
        zipCode: '12345'
      });

      expect(response.success).toBe(true);
      expect(response.data?.status).toBe('verified');
    });

    it('should handle bill retrieval', async () => {
      const mockBills = [
        {
          id: 'bill-1',
          accountId: 'util-acc-1',
          billNumber: 'BILL-001',
          period: {
            startDate: new Date('2024-01-01').toISOString(),
            endDate: new Date('2024-01-31').toISOString()
          },
          dueDate: new Date('2024-02-15').toISOString(),
          amount: 150.00,
          currency: 'USD',
          status: 'issued' as const,
          usage: {
            current: 500,
            previous: 450,
            unit: 'kWh'
          },
          rates: {
            baseRate: 10.00,
            usageRate: 0.20,
            taxes: 15.00,
            fees: 5.00
          },
          paymentMethods: ['bank_transfer', 'credit_card']
        }
      ];

      jest.spyOn(utilityProviderIntegration['integrationLayer'], 'get')
        .mockResolvedValueOnce({
          success: true,
          data: mockBills
        });

      const response = await utilityProviderIntegration.getBills('util-acc-1');

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0].amount).toBe(150.00);
    });
  });

  describe('IntegrationMonitor', () => {
    it('should initialize monitoring system', () => {
      expect(monitor).toBeDefined();
    });

    it('should register services for monitoring', () => {
      monitor.registerService('test-service', integrationLayer);
      
      const logs = monitor.getLogs({ service: 'test-service' });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].message).toContain('registered for monitoring');
    });

    it('should collect and store logs', () => {
      monitor.log('info', 'test-service', 'test-operation', 'Test message', {
        key: 'value'
      }, 'corr-123', 'user-456', 100, 200);

      const logs = monitor.getLogs({ service: 'test-service' });
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].correlationId).toBe('corr-123');
    });

    it('should filter logs by criteria', () => {
      // Add multiple logs
      monitor.log('info', 'service-1', 'op-1', 'Message 1');
      monitor.log('error', 'service-1', 'op-2', 'Message 2');
      monitor.log('info', 'service-2', 'op-3', 'Message 3');

      const infoLogs = monitor.getLogs({ level: 'info' });
      expect(infoLogs).toHaveLength(2);

      const service1Logs = monitor.getLogs({ service: 'service-1' });
      expect(service1Logs).toHaveLength(2);

      const errorLogs = monitor.getLogs({ level: 'error' });
      expect(errorLogs).toHaveLength(1);
    });

    it('should generate monitoring summary', () => {
      monitor.registerService('service-1', integrationLayer);
      monitor.registerService('service-2', bankingIntegration);

      const summary = monitor.getMonitoringSummary();
      
      expect(summary.totalServices).toBe(2);
      expect(summary.totalLogs).toBeGreaterThan(0);
      expect(typeof summary.averageResponseTime).toBe('number');
    });

    it('should export logs in different formats', () => {
      monitor.log('info', 'test', 'op', 'Test message');

      const jsonExport = monitor.exportLogs('json');
      const csvExport = monitor.exportLogs('csv');

      expect(jsonExport).toContain('Test message');
      expect(csvExport).toContain('timestamp,level,service,operation,message');
    });
  });

  describe('Integration Tests', () => {
    it('should handle end-to-end banking flow', async () => {
      // Mock the entire flow
      jest.spyOn(bankingIntegration['integrationLayer'], 'get')
        .mockResolvedValueOnce({
          success: true,
          data: [{
            id: 'acc-1',
            accountNumber: '123456789',
            accountType: 'checking' as const,
            bankName: 'Test Bank',
            routingNumber: '987654321',
            balance: 1000.00,
            currency: 'USD',
            status: 'active' as const,
            lastUpdated: new Date().toISOString()
          }]
        });

      jest.spyOn(bankingIntegration['integrationLayer'], 'post')
        .mockResolvedValueOnce({
          success: true,
          data: {
            paymentId: 'pay-123',
            status: 'pending' as const,
            fees: 2.50
          }
        });

      // Get accounts
      const accountsResponse = await bankingIntegration.getAccounts();
      expect(accountsResponse.success).toBe(true);

      // Make payment
      const paymentResponse = await bankingIntegration.initiatePayment({
        accountId: 'acc-1',
        recipientAccount: 'acc-2',
        amount: 100.00,
        currency: 'USD',
        description: 'Test payment'
      });
      expect(paymentResponse.success).toBe(true);
    });

    it('should handle service failures gracefully', async () => {
      // Mock service failure
      jest.spyOn(bankingIntegration['integrationLayer'], 'get')
        .mockRejectedValueOnce(new Error('Service unavailable'));

      const response = await bankingIntegration.getAccounts();
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Service unavailable');
    });

    it('should handle rate limiting across services', async () => {
      // Register multiple services
      monitor.registerService('banking', bankingIntegration);
      monitor.registerService('credit', creditScoringService);

      // Mock rate limit responses
      jest.spyOn(bankingIntegration['integrationLayer'], 'get')
        .mockRejectedValue(new Error('Rate limit exceeded'));
      
      jest.spyOn(creditScoringService['integrationLayer'], 'get')
        .mockRejectedValue(new Error('Rate limit exceeded'));

      // Make requests that should be rate limited
      const bankingPromise = bankingIntegration.getAccounts();
      const creditPromise = creditScoringService.getCreditReport('cust-1');

      const [bankingResult, creditResult] = await Promise.allSettled([
        bankingPromise,
        creditPromise
      ]);

      expect(bankingResult.status).toBe('fulfilled');
      expect(creditResult.status).toBe('fulfilled');
      
      if (bankingResult.status === 'fulfilled') {
        expect(bankingResult.value.success).toBe(false);
      }
      if (creditResult.status === 'fulfilled') {
        expect(creditResult.value.success).toBe(false);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      jest.spyOn(integrationLayer['axiosInstance'], 'request')
        .mockRejectedValueOnce(new Error('timeout of 5000ms exceeded'));

      const response = await integrationLayer.get('/test-timeout');
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('timeout');
    });

    it('should handle authentication errors', async () => {
      jest.spyOn(integrationLayer['axiosInstance'], 'request')
        .mockRejectedValueOnce(new Error('401 Unauthorized'));

      const response = await integrationLayer.get('/test-auth');
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('401');
    });

    it('should handle malformed responses', async () => {
      jest.spyOn(integrationLayer['axiosInstance'], 'request')
        .mockResolvedValueOnce({
          data: null,
          status: 200,
          config: { metadata: { responseTime: 100 } }
        });

      const response = await integrationLayer.get('/test-malformed');
      
      expect(response.success).toBe(true);
      expect(response.data).toBeNull();
    });
  });
});
