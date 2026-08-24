import { Router } from 'express';
import {
  getPaymentsFeed,
  getBillsFeed,
  getReportsFeed,
  getActivityFeed,
  getUserActivityFeed
} from '../controllers/RssController';
import { sanitizeInput } from '../middleware/inputSanitization';

const router = Router();

router.use(sanitizeInput);

/**
 * @openapi
 * /api/rss/payments:
 *   get:
 *     summary: Get RSS feed for recent payments
 *     description: Returns an RSS feed of recent payment transactions
 *     tags:
 *       - RSS Feeds
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 200
 *         description: Maximum number of items to return
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SUCCESS, FAILED, PENDING]
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: RSS feed for payments
 *         content:
 *           application/rss+xml:
 *             schema:
 *               type: string
 *       500:
 *         description: Server error
 */
router.get('/payments', getPaymentsFeed);

/**
 * @openapi
 * /api/rss/bills:
 *   get:
 *     summary: Get RSS feed for recent bills
 *     description: Returns an RSS feed of recent utility bills
 *     tags:
 *       - RSS Feeds
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 200
 *         description: Maximum number of items to return
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, OVERDUE]
 *         description: Filter by bill status
 *     responses:
 *       200:
 *         description: RSS feed for bills
 *         content:
 *           application/rss+xml:
 *             schema:
 *               type: string
 *       500:
 *         description: Server error
 */
router.get('/bills', getBillsFeed);

/**
 * @openapi
 * /api/rss/reports:
 *   get:
 *     summary: Get RSS feed for recent reports
 *     description: Returns an RSS feed of recent generated reports
 *     tags:
 *       - RSS Feeds
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 200
 *         description: Maximum number of items to return
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [REVENUE, USER_GROWTH, BILLS]
 *         description: Filter by report type
 *     responses:
 *       200:
 *         description: RSS feed for reports
 *         content:
 *           application/rss+xml:
 *             schema:
 *               type: string
 *       500:
 *         description: Server error
 */
router.get('/reports', getReportsFeed);

/**
 * @openapi
 * /api/rss/activity:
 *   get:
 *     summary: Get RSS feed for all recent activity
 *     description: Returns an RSS feed of all recent activity including payments, bills, and reports
 *     tags:
 *       - RSS Feeds
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           minimum: 1
 *           maximum: 300
 *         description: Maximum number of items to return
 *     responses:
 *       200:
 *         description: RSS feed for all activity
 *         content:
 *           application/rss+xml:
 *             schema:
 *               type: string
 *       500:
 *         description: Server error
 */
router.get('/activity', getActivityFeed);

/**
 * @openapi
 * /api/rss/user/{userId}:
 *   get:
 *     summary: Get RSS feed for user-specific activity
 *     description: Returns an RSS feed of recent activity for a specific user
 *     tags:
 *       - RSS Feeds
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 200
 *         description: Maximum number of items to return
 *     responses:
 *       200:
 *         description: RSS feed for user activity
 *         content:
 *           application/rss+xml:
 *             schema:
 *               type: string
 *       400:
 *         description: User ID is required
 *       500:
 *         description: Server error
 */
router.get('/user/:userId', getUserActivityFeed);

export default router;
