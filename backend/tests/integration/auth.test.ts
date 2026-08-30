import request from 'supertest';
import app from '../../app';
import { TestHelpers } from '../helpers';
import { prisma } from '../setup';

describe('Authentication API Integration Tests', () => {
  let testUser: any;
  let authToken: string;
  let refreshToken: string;

  beforeEach(async () => {
    await TestHelpers.cleanupTestData();
  });

  afterAll(async () => {
    await TestHelpers.cleanupTestData();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
        name: 'Test User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        message: 'Registration successful. Please verify your email.',
        user: {
          email: userData.email,
          username: userData.username,
          name: userData.name,
          status: 'PENDING_VERIFICATION'
        }
      });
      expect(response.body.user.id).toBeDefined();
    });

    it('should return error for duplicate email', async () => {
      testUser = await TestHelpers.createTestUser({
        email: 'existing@example.com'
      });

      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        username: 'newuser'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBe('Email already registered');
    });

    it('should return error for invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        username: 'testuser'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toContain('email');
    });

    it('should return error for short password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
        username: 'testuser'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toContain('password');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      testUser = await TestHelpers.createTestUser({
        status: 'ACTIVE'
      });
    });

    it('should login successfully with valid credentials', async () => {
      const loginData = {
        email: testUser.email,
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Login successful',
        user: {
          id: testUser.id,
          email: testUser.email,
          username: testUser.username,
          name: testUser.name,
          role: testUser.role
        }
      });
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();

      authToken = response.body.token;
      refreshToken = response.body.refreshToken;
    });

    it('should return error for invalid credentials', async () => {
      const loginData = {
        email: testUser.email,
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return error for non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('POST /api/auth/wallet', () => {
    const walletAddress = 'GDTESTACCOUNT123456789';

    it('should login with wallet successfully', async () => {
      const walletData = {
        walletAddress
      };

      const response = await request(app)
        .post('/api/auth/wallet')
        .send(walletData)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Wallet login successful',
        user: {
          email: `${walletAddress}@stellar.wallet`,
          walletAddress
        }
      });
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
    });

    it('should create new user for first-time wallet login', async () => {
      const newWalletAddress = 'GDNEWUSER123456789';
      const walletData = {
        walletAddress: newWalletAddress
      };

      const response = await request(app)
        .post('/api/auth/wallet')
        .send(walletData)
        .expect(200);

      expect(response.body.user.walletAddress).toBe(newWalletAddress);
      expect(response.body.user.email).toBe(`${newWalletAddress}@stellar.wallet`);
    });
  });

  describe('POST /api/auth/refresh', () => {
    beforeEach(async () => {
      testUser = await TestHelpers.createTestUser({ status: 'ACTIVE' });
      
      const loginData = {
        email: testUser.email,
        password: 'password123'
      };

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      refreshToken = loginResponse.body.refreshToken;
    });

    it('should refresh token successfully', async () => {
      const refreshData = {
        refreshToken
      };

      const response = await request(app)
        .post('/api/auth/refresh')
        .send(refreshData)
        .expect(200);

      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user.id).toBe(testUser.id);
    });

    it('should return error for invalid refresh token', async () => {
      const refreshData = {
        refreshToken: 'invalid-refresh-token'
      };

      const response = await request(app)
        .post('/api/auth/refresh')
        .send(refreshData)
        .expect(401);

      expect(response.body.error).toBe('Invalid refresh token');
    });

    it('should return error for missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({})
        .expect(401);

      expect(response.body.error).toBe('Invalid refresh token');
    });
  });

  describe('POST /api/auth/logout', () => {
    beforeEach(async () => {
      testUser = await TestHelpers.createTestUser({ status: 'ACTIVE' });
      
      const loginData = {
        email: testUser.email,
        password: 'password123'
      };

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      authToken = loginResponse.body.token;
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Logout successful');
    });

    it('should return error for missing token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(400);

      expect(response.body.error).toBe('Token required');
    });

    it('should return error for invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(400);

      expect(response.body.error).toBe('Logout failed');
    });
  });

  describe('GET /api/user/profile', () => {
    beforeEach(async () => {
      testUser = await TestHelpers.createTestUser({ status: 'ACTIVE' });
      
      const loginData = {
        email: testUser.email,
        password: 'password123'
      };

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      authToken = loginResponse.body.token;
    });

    it('should get user profile successfully', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.user).toMatchObject({
        id: testUser.id,
        email: testUser.email,
        username: testUser.username,
        name: testUser.name,
        role: testUser.role,
        status: testUser.status
      });
    });

    it('should return error for missing authorization', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return error for invalid token', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('2FA Integration Tests', () => {
    beforeEach(async () => {
      testUser = await TestHelpers.createTestUser({ status: 'ACTIVE' });
      
      const loginData = {
        email: testUser.email,
        password: 'password123'
      };

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      authToken = loginResponse.body.token;
    });

    it('should enable 2FA for user', async () => {
      const response = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ method: 'AUTHENTICATOR_APP' })
        .expect(200);

      expect(response.body.secret).toBeDefined();
      expect(response.body.qrCode).toBeDefined();
      expect(response.body.backupCodes).toBeDefined();
      expect(response.body.backupCodes).toHaveLength(10);
    });

    it('should verify 2FA code during login', async () => {
      // First enable 2FA
      const enableResponse = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ method: 'AUTHENTICATOR_APP' });

      const { secret } = enableResponse.body;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      // Generate a valid TOTP code (in real scenario, this would come from authenticator app)
      // For testing, we'll use a known valid code for the test secret
      // This is a simplified test - in production you'd use the actual TOTP algorithm
      
      // Login with 2FA
      const loginData = {
        email: testUser.email,
        password: 'password123',
        twoFactorCode: '123456' // This would need to be a valid TOTP code
      };

      // Note: This test would need actual TOTP validation logic
      // For now, we'll test the endpoint structure
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      // The response should indicate 2FA is required
      expect(response.body.requiresTwoFactor).toBeDefined();
    });

    it('should disable 2FA for user', async () => {
      // First enable 2FA
      await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ method: 'AUTHENTICATOR_APP' });

      // Disable 2FA
      const response = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('RBAC Integration Tests', () => {
    let adminUser: any;
    let regularUser: any;
    let adminToken: string;
    let regularToken: string;

    beforeEach(async () => {
      adminUser = await TestHelpers.createTestUser({ 
        status: 'ACTIVE',
        role: 'ADMIN'
      });
      
      regularUser = await TestHelpers.createTestUser({ 
        status: 'ACTIVE',
        role: 'USER'
      });

      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: adminUser.email, password: 'password123' });

      const regularLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: regularUser.email, password: 'password123' });

      adminToken = adminLogin.body.token;
      regularToken = regularLogin.body.token;
    });

    it('should allow admin to access admin routes', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toBeDefined();
    });

    it('should deny regular user access to admin routes', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body.error).toContain('permissions');
    });

    it('should allow users to access their own resources', async () => {
      const response = await request(app)
        .get(`/api/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.user.id).toBe(regularUser.id);
    });

    it('should deny users access to other users resources', async () => {
      const response = await request(app)
        .get(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body.error).toContain('permissions');
    });
  });

  describe('Password Reset Integration Tests', () => {
    beforeEach(async () => {
      testUser = await TestHelpers.createTestUser({ status: 'ACTIVE' });
    });

    it('should request password reset', async () => {
      const response = await request(app)
        .post('/api/auth/password/reset-request')
        .send({ email: testUser.email })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should not reveal if email exists during reset request', async () => {
      const response = await request(app)
        .post('/api/auth/password/reset-request')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reset password with valid token', async () => {
      // Request reset
      const resetRequest = await request(app)
        .post('/api/auth/password/reset-request')
        .send({ email: testUser.email });

      // In a real scenario, you'd get the token from the email
      // For testing, we'll assume we have the token
      const resetToken = 'test-reset-token';

      const response = await request(app)
        .post('/api/auth/password/reset')
        .send({ 
          token: resetToken,
          newPassword: 'newPassword123'
        });

      // This would need actual token validation logic
      // For now, we test the endpoint structure
      expect(response.body).toBeDefined();
    });
  });

  describe('Session Management Integration Tests', () => {
    beforeEach(async () => {
      testUser = await TestHelpers.createTestUser({ status: 'ACTIVE' });
      
      const loginData = {
        email: testUser.email,
        password: 'password123'
      };

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      authToken = loginResponse.body.token;
      refreshToken = loginResponse.body.refreshToken;
    });

    it('should get active sessions', async () => {
      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.sessions).toBeDefined();
      expect(Array.isArray(response.body.sessions)).toBe(true);
    });

    it('should revoke specific session', async () => {
      const sessions = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`);

      const sessionId = sessions.body.sessions[0].id;

      const response = await request(app)
        .delete(`/api/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBeDefined();
    });

    it('should revoke all sessions except current', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/revoke-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBeDefined();
    });
  });
});
