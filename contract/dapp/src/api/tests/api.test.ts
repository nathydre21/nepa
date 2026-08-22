import request from 'supertest';
import { APIServer } from '../server';
import { IntegrationMonitor } from '../integration-monitor';

describe('NEPA API Tests', () => {
  let server: APIServer;
  let monitor: IntegrationMonitor;

  beforeAll(() => {
    server = new APIServer({
      port: 3001,
      environment: 'test',
      version: '2.0.0',
      corsOrigins: ['http://localhost:3000'],
      rateLimit: {
        windowMs: 60000,
        max: 100
      },
      logging: {
        level: 'info',
        format: 'json'
      }
    });

    monitor = new IntegrationMonitor({
      logLevel: 'info',
      retentionPeriod: 1,
      maxLogEntries: 100,
      alertConfig: {
        enabled: false, // Disable alerts during testing
        thresholds: {
          errorRate: 5,
          responseTime: 5000,
          rateLimitHits: 50,
          cacheHitRate: 80
        },
        cooldown: 300000,
        channels: []
      },
      healthCheckInterval: 60000,
      metricsInterval: 30000
    });
  });

  afterAll(() => {
    server.stop();
    monitor.stopMonitoring();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(server['app'])
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should include service metrics', async () => {
      const response = await request(server['app'])
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('total');
      expect(response.body.services).toHaveProperty('healthy');
    });
  });

  describe('Authentication', () => {
    describe('OAuth Authorization', () => {
      it('should generate authorization URL', async () => {
        const response = await request(server['app'])
          .post('/api/v2/auth/oauth/authorize')
          .send({
            client_id: 'test-client',
            redirect_uri: 'http://localhost:3000/callback',
            scope: 'read write',
            state: 'test-state'
          })
          .expect(200);

        expect(response.body).toHaveProperty('authorize_url');
        expect(response.body).toHaveProperty('state');
        expect(response.body.state).toBe('test-state');
      });

      it('should validate required OAuth parameters', async () => {
        const response = await request(server['app'])
          .post('/api/v2/auth/oauth/authorize')
          .send({
            client_id: 'test-client'
            // Missing redirect_uri and scope
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('OAuth Token Exchange', () => {
      it('should exchange authorization code for access token', async () => {
        const response = await request(server['app'])
          .post('/api/v2/auth/oauth/token')
          .send({
            grant_type: 'authorization_code',
            code: 'test-auth-code',
            redirect_uri: 'http://localhost:3000/callback',
            client_id: 'test-client',
            client_secret: 'test-secret'
          })
          .expect(200);

        expect(response.body).toHaveProperty('access_token');
        expect(response.body).toHaveProperty('token_type');
        expect(response.body).toHaveProperty('expires_in');
        expect(response.body.token_type).toBe('Bearer');
      });

      it('should reject invalid authorization code', async () => {
        const response = await request(server['app'])
          .post('/api/v2/auth/oauth/token')
          .send({
            grant_type: 'authorization_code',
            code: 'invalid-code',
            redirect_uri: 'http://localhost:3000/callback',
            client_id: 'test-client',
            client_secret: 'test-secret'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      });
    });

    describe('Token Verification', () => {
      it('should verify valid JWT token', async () => {
        // First get a token
        const tokenResponse = await request(server['app'])
          .post('/api/v2/auth/oauth/token')
          .send({
            grant_type: 'authorization_code',
            code: 'test-auth-code',
            redirect_uri: 'http://localhost:3000/callback',
            client_id: 'test-client',
            client_secret: 'test-secret'
          });

        const token = tokenResponse.body.access_token;

        // Verify the token
        const response = await request(server['app'])
          .get('/api/v2/auth/verify')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.valid).toBe(true);
        expect(response.body.user).toHaveProperty('id');
        expect(response.body.user).toHaveProperty('role');
      });

      it('should reject invalid JWT token', async () => {
        const response = await request(server['app'])
          .get('/api/v2/auth/verify')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INVALID_TOKEN');
      });

      it('should require authentication token', async () => {
        const response = await request(server['app'])
          .get('/api/v2/auth/verify')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      });
    });
  });

  describe('User Management', () => {
    describe('Get User Profile', () => {
      it('should return user profile for authenticated user', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/users/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data).toHaveProperty('email');
        expect(response.body.data).toHaveProperty('name');
      });

      it('should require authentication', async () => {
        const response = await request(server['app'])
          .get('/api/v2/users/profile')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('Update User Profile', () => {
      it('should update user profile successfully', async () => {
        const token = await getAuthToken(server);
        
        const updateData = {
          name: 'Updated Name',
          phone: '+1234567890',
          preferences: {
            theme: 'dark',
            notifications: true
          }
        };

        const response = await request(server['app'])
          .put('/api/v2/users/profile')
          .set('Authorization', `Bearer ${token}`)
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('updated successfully');
      });

      it('should validate profile update data', async () => {
        const token = await getAuthToken(server);
        
        const invalidData = {
          email: 'invalid-email', // Invalid email format
          preferences: {
            theme: 'invalid-theme' // Invalid theme
          }
        };

        const response = await request(server['app'])
          .put('/api/v2/users/profile')
          .set('Authorization', `Bearer ${token}`)
          .send(invalidData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });
  });

  describe('Payments', () => {
    describe('Get Payment Bills', () => {
      it('should return user bills with pagination', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/payments/bills')
          .set('Authorization', `Bearer ${token}`)
          .query({ limit: 10, page: 1 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('bills');
        expect(response.body.data).toHaveProperty('pagination');
        expect(response.body.data.pagination.limit).toBe(10);
        expect(response.body.data.pagination.page).toBe(1);
      });

      it('should filter bills by status', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/payments/bills')
          .set('Authorization', `Bearer ${token}`)
          .query({ status: 'pending' })
          .expect(200);

        expect(response.body.success).toBe(true);
        // All returned bills should have status 'pending'
        if (response.body.data.bills.length > 0) {
          response.body.data.bills.forEach((bill: any) => {
            expect(bill.status).toBe('pending');
          });
        }
      });
    });

    describe('Pay Utility Bill', () => {
      it('should process payment successfully', async () => {
        const token = await getAuthToken(server);
        
        const paymentData = {
          bill_id: 'bill-123',
          amount: 150.00,
          currency: 'USD',
          payment_method: 'bank_transfer',
          payment_details: {
            bank_account_id: 'acc-456'
          }
        };

        const response = await request(server['app'])
          .post('/api/v2/payments/bills')
          .set('Authorization', `Bearer ${token}`)
          .send(paymentData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('payment_id');
        expect(response.body.data).toHaveProperty('status');
        expect(response.body.data.status).toBe('completed');
      });

      it('should validate payment request data', async () => {
        const token = await getAuthToken(server);
        
        const invalidPayment = {
          // Missing required fields
          amount: 150.00
        };

        const response = await request(server['app'])
          .post('/api/v2/payments/bills')
          .set('Authorization', `Bearer ${token}`)
          .send(invalidPayment)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });
  });

  describe('Yield Generation', () => {
    describe('Get Yield Strategies', () => {
      it('should return available yield strategies', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/yield/strategies')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('strategies');
        expect(Array.isArray(response.body.data.strategies)).toBe(true);
      });
    });

    describe('Deploy to Yield Strategy', () => {
      it('should deploy funds to yield strategy', async () => {
        const token = await getAuthToken(server);
        
        const deploymentData = {
          strategy_id: 'stable-pool-xlm-usdc',
          amount: 1000.00,
          auto_rebalance: true,
          risk_tolerance: 'moderate'
        };

        const response = await request(server['app'])
          .post('/api/v2/yield/deploy')
          .set('Authorization', `Bearer ${token}`)
          .send(deploymentData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('deployment_id');
        expect(response.body.data).toHaveProperty('transaction_hash');
      });

      it('should validate deployment request', async () => {
        const token = await getAuthToken(server);
        
        const invalidDeployment = {
          strategy_id: 'invalid-strategy',
          amount: -100.00 // Negative amount
        };

        const response = await request(server['app'])
          .post('/api/v2/yield/deploy')
          .set('Authorization', `Bearer ${token}`)
          .send(invalidDeployment)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('Get Yield Positions', () => {
      it('should return user yield positions', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/yield/positions')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('positions');
        expect(response.body.data).toHaveProperty('total_value');
      });

      it('should filter positions by strategy', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/yield/positions')
          .set('Authorization', `Bearer ${token}`)
          .query({ strategy: 'stable-pool-xlm-usdc' })
          .expect(200);

        expect(response.body.success).toBe(true);
        if (response.body.data.positions.length > 0) {
          response.body.data.positions.forEach((position: any) => {
            expect(position.strategy_id).toBe('stable-pool-xlm-usdc');
          });
        }
      });
    });
  });

  describe('Credit Scoring', () => {
    describe('Get Credit Score', () => {
      it('should return user credit score', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/credit/score')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('score');
        expect(response.body.data).toHaveProperty('grade');
        expect(typeof response.body.data.score).toBe('number');
        expect(['A', 'B', 'C', 'D', 'F']).toContain(response.body.data.grade);
      });
    });
  });

  describe('Banking Integration', () => {
    describe('Get Banking Accounts', () => {
      it('should return linked banking accounts', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/banking/accounts')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('accounts');
        expect(response.body.data).toHaveProperty('summary');
      });
    });

    describe('Link Bank Account', () => {
      it('should initiate bank account linking', async () => {
        const token = await getAuthToken(server);
        
        const linkData = {
          bank_code: 'TEST_BANK',
          credentials: {
            username: 'testuser',
            password: 'testpass'
          }
        };

        const response = await request(server['app'])
          .post('/api/v2/banking/link')
          .set('Authorization', `Bearer ${token}`)
          .send(linkData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('linkId');
        expect(response.body.data).toHaveProperty('status');
      });
    });
  });

  describe('Utility Providers', () => {
    describe('Get Utility Providers', () => {
      it('should return available utility providers', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/utilities/providers')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('providers');
        expect(Array.isArray(response.body.data.providers)).toBe(true);
      });

      it('should filter providers by type', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/utilities/providers')
          .set('Authorization', `Bearer ${token}`)
          .query({ type: 'electricity' })
          .expect(200);

        expect(response.body.success).toBe(true);
        if (response.body.data.providers.length > 0) {
          response.body.data.providers.forEach((provider: any) => {
            expect(provider.type).toBe('electricity');
          });
        }
      });
    });
  });

  describe('Analytics', () => {
    describe('Get Dashboard Analytics', () => {
      it('should return comprehensive dashboard analytics', async () => {
        const token = await getAuthToken(server);
        
        const response = await request(server['app'])
          .get('/api/v2/analytics/dashboard')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('overview');
        expect(response.body.data).toHaveProperty('charts');
        expect(response.body.data).toHaveProperty('widgets');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      const response = await request(server['app'])
        .get('/api/v2/non-existent-endpoint')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ENDPOINT_NOT_FOUND');
      expect(response.body.error.details).toHaveProperty('method');
      expect(response.body.error.details).toHaveProperty('path');
    });

    it('should handle rate limiting', async () => {
      // Make multiple rapid requests to trigger rate limiting
      const requests = Array.from({ length: 10 }, () => 
        request(server['app']).get('/api/v2/health')
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      rateLimitedResponses.forEach(response => {
        expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      });
    });

    it('should include correlation ID in responses', async () => {
      const correlationId = 'test-correlation-123';
      
      const response = await request(server['app'])
        .get('/api/v2/health')
        .set('X-Request-ID', correlationId)
        .expect(200);

      expect(response.body.meta.requestId).toBe(correlationId);
    });

    it('should handle malformed JSON requests', async () => {
      const response = await request(server['app'])
        .post('/api/v2/payments/bills')
        .set('Content-Type', 'application/json')
        .send('invalid-json')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('API Versioning', () => {
    it('should route to correct API version', async () => {
      const v1Response = await request(server['app'])
        .get('/api/v1/users/profile')
        .expect(200);

      const v2Response = await request(server['app'])
        .get('/api/v2/users/profile')
        .expect(200);

      // Both should respond but with potentially different data structures
      expect(v1Response.body.success).toBe(true);
      expect(v2Response.body.success).toBe(true);
    });

    it('should handle invalid API version requests', async () => {
      const response = await request(server['app'])
        .get('/api/v3/users/profile') // v3 doesn't exist
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VERSION_NOT_FOUND');
      expect(response.body.error.details.availableVersions).toEqual(['v1', 'v2']);
    });
  });

  describe('Response Format', () => {
    it('should maintain consistent response format', async () => {
      const token = await getAuthToken(server);
      
      const response = await request(server['app'])
        .get('/api/v2/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Check response structure
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
      expect(response.body.meta).toHaveProperty('version');
      
      if (response.body.success) {
        expect(response.body).toHaveProperty('data');
      } else {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
      }
    });
  });

  describe('Security', () => {
    it('should include security headers', async () => {
      const response = await request(server['app'])
        .get('/api/v2/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should handle CORS properly', async () => {
      const response = await request(server['app'])
        .get('/api/v2/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });
});

// Helper function to get auth token for testing
async function getAuthToken(server: APIServer): Promise<string> {
  const response = await request(server['app'])
    .post('/api/v2/auth/oauth/token')
    .send({
      grant_type: 'authorization_code',
      code: 'test-auth-code',
      redirect_uri: 'http://localhost:3000/callback',
      client_id: 'test-client',
      client_secret: 'test-secret'
    });
  
  return response.body.access_token;
}
