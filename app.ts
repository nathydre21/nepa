import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { apiLimiter } from './middleware/rateLimiter';
import { configureSecurity } from './middleware/security';
import { apiKeyAuth } from './middleware/auth';
import { requestLogger } from './middleware/logger';
import { swaggerSpec } from './swagger';
import { upload } from './middleware/upload';
import { uploadDocument } from './controllers/DocumentController';
import { getDashboardData, generateReport, exportData } from './controllers/AnalyticsController';

const app = express();

// 1. Logging (should be first to capture all requests)
app.use(requestLogger);

// 2. Security Headers & CORS
configureSecurity(app);

// 3. Body Parsing
app.use(express.json({ limit: '10kb' })); // Limit body size for security

// 4. Rate Limiting
app.use('/api', apiLimiter);

// 5. API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 6. Public Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

// 7. Protected API Routes
app.use('/api', apiKeyAuth);

// Example protected route
/**
 * @openapi
 * /api/test:
 *   get:
 *     summary: Test protected route
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
app.get('/api/test', (req, res) => {
  res.json({ message: 'Authenticated access successful' });
});

// Document Upload Route
/**
 * @openapi
 * /api/documents/upload:
 *   post:
 *     summary: Upload a document
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 */
app.post('/api/documents/upload', apiKeyAuth, upload.single('file'), uploadDocument);

// Analytics Routes
/**
 * @openapi
 * /api/analytics/dashboard:
 *   get:
 *     summary: Get analytics dashboard data
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved
 */
app.get('/api/analytics/dashboard', apiKeyAuth, getDashboardData);

/**
 * @openapi
 * /api/analytics/reports:
 *   post:
 *     summary: Generate and save a custom report
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       201:
 *         description: Report created
 */
app.post('/api/analytics/reports', apiKeyAuth, generateReport);

// Export Route
app.get('/api/analytics/export', apiKeyAuth, exportData);

export default app;