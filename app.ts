import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { apiLimiter } from './middleware/rateLimiter';
import { configureSecurity } from './middleware/security';
import { apiKeyAuth } from './middleware/auth';
import { requestLogger } from './middleware/logger';
import { swaggerSpec } from './swagger';

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

export default app;