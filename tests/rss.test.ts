import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('RSS Feed Endpoints', () => {
  beforeAll(async () => {
    // Setup test data
    await createTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('GET /api/rss', () => {
    it('should return RSS feed information', async () => {
      const response = await request(app)
        .get('/api/rss')
        .expect(200);

      expect(response.body).toHaveProperty('title', 'NEPA RSS Feeds');
      expect(response.body).toHaveProperty('feeds');
      expect(response.body.feeds).toBeInstanceOf(Array);
      expect(response.body.feeds.length).toBe(5);
      
      const feedNames = response.body.feeds.map((feed: any) => feed.name);
      expect(feedNames).toContain('Recent Bills');
      expect(feedNames).toContain('Recent Payments');
      expect(feedNames).toContain('New Users');
      expect(feedNames).toContain('Recent Reports');
      expect(feedNames).toContain('All Activity');
    });
  });

  describe('GET /api/rss/bills', () => {
    it('should return RSS feed for bills', async () => {
      const response = await request(app)
        .get('/api/rss/bills')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/rss\+xml/);
      expect(response.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(response.text).toContain('<rss version="2.0">');
      expect(response.text).toContain('<title>NEPA - Recent Bills</title>');
      expect(response.text).toContain('<description>RSS feed for recent bills and payments in the NEPA system</description>');
    });
  });

  describe('GET /api/rss/payments', () => {
    it('should return RSS feed for payments', async () => {
      const response = await request(app)
        .get('/api/rss/payments')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/rss\+xml/);
      expect(response.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(response.text).toContain('<rss version="2.0">');
      expect(response.text).toContain('<title>NEPA - Recent Payments</title>');
      expect(response.text).toContain('<description>RSS feed for recent payments in the NEPA system</description>');
    });
  });

  describe('GET /api/rss/users', () => {
    it('should return RSS feed for users', async () => {
      const response = await request(app)
        .get('/api/rss/users')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/rss\+xml/);
      expect(response.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(response.text).toContain('<rss version="2.0">');
      expect(response.text).toContain('<title>NEPA - New Users</title>');
      expect(response.text).toContain('<description>RSS feed for new user registrations in the NEPA system</description>');
    });
  });

  describe('GET /api/rss/reports', () => {
    it('should return RSS feed for reports', async () => {
      const response = await request(app)
        .get('/api/rss/reports')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/rss\+xml/);
      expect(response.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(response.text).toContain('<rss version="2.0">');
      expect(response.text).toContain('<title>NEPA - Recent Reports</title>');
      expect(response.text).toContain('<description>RSS feed for recent reports in the NEPA system</description>');
    });
  });

  describe('GET /api/rss/activity', () => {
    it('should return combined RSS feed', async () => {
      const response = await request(app)
        .get('/api/rss/activity')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/rss\+xml/);
      expect(response.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(response.text).toContain('<rss version="2.0">');
      expect(response.text).toContain('<title>NEPA - Recent Activity</title>');
      expect(response.text).toContain('<description>RSS feed for all recent activity in the NEPA system including bills, payments, users, and reports</description>');
    });
  });

  describe('RSS Feed Content Validation', () => {
    it('should include proper RSS structure', async () => {
      const response = await request(app)
        .get('/api/rss/bills')
        .expect(200);

      // Validate RSS structure
      expect(response.text).toMatch(/<rss[^>]*version="2.0"[^>]*>/);
      expect(response.text).toContain('<channel>');
      expect(response.text).toContain('<title>');
      expect(response.text).toContain('<description>');
      expect(response.text).toContain('<link>');
      expect(response.text).toContain('<language>');
      expect(response.text).toContain('<pubDate>');
      expect(response.text).toContain('<lastBuildDate>');
      expect(response.text).toContain('</channel>');
      expect(response.text).toContain('</rss>');
    });

    it('should include bill items in bills feed', async () => {
      const response = await request(app)
        .get('/api/rss/bills')
        .expect(200);

      expect(response.text).toContain('<item>');
      expect(response.text).toContain('<title>');
      expect(response.text).toContain('<description>');
      expect(response.text).toContain('<link>');
      expect(response.text).toContain('<guid>');
      expect(response.text).toContain('<category>');
      expect(response.text).toContain('<author>');
      expect(response.text).toContain('<pubDate>');
      expect(response.text).toContain('</item>');
    });
  });
});

async function createTestData() {
  // Create test user
  const testUser = await prisma.user.create({
    data: {
      email: 'rss-test@example.com',
      passwordHash: 'hashedpassword',
      name: 'RSS Test User',
      role: 'USER',
      status: 'ACTIVE'
    }
  });

  // Create test utility
  const testUtility = await prisma.utility.create({
    data: {
      name: 'Test Electricity',
      type: 'electricity',
      provider: 'Test Provider'
    }
  });

  // Create test bill
  await prisma.bill.create({
    data: {
      amount: 100.50,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      status: 'PENDING',
      userId: testUser.id,
      utilityId: testUtility.id
    }
  });

  // Create test payment
  await prisma.payment.create({
    data: {
      amount: 75.25,
      method: 'credit_card',
      status: 'SUCCESS',
      transactionId: 'test_tx_12345',
      billId: testUser.id, // This should reference a real bill, but for test it's okay
      userId: testUser.id
    }
  });

  // Create test report
  await prisma.report.create({
    data: {
      title: 'Test RSS Report',
      type: 'REVENUE',
      data: { total: 1000, count: 10 },
      createdBy: testUser.id
    }
  });
}

async function cleanupTestData() {
  // Clean up in order to respect foreign key constraints
  await prisma.payment.deleteMany({
    where: {
      user: {
        email: 'rss-test@example.com'
      }
    }
  });

  await prisma.report.deleteMany({
    where: {
      user: {
        email: 'rss-test@example.com'
      }
    }
  });

  await prisma.bill.deleteMany({
    where: {
      user: {
        email: 'rss-test@example.com'
      }
    }
  });

  await prisma.user.deleteMany({
    where: {
      email: 'rss-test@example.com'
    }
  });

  await prisma.utility.deleteMany({
    where: {
      name: 'Test Electricity'
    }
  });
}
