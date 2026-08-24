import { Router } from "express";
import { scheduledPaymentController } from "../controllers/ScheduledPaymentController";
import { authenticate } from "../middleware/authentication";
import { scheduledPaymentLimiter } from "../middleware/comprehensiveRateLimiter";
import { sanitizeInput } from "../middleware/inputSanitization";

const router = Router();

// All routes require authentication, rate limiting, and input sanitization
router.use(authenticate);
router.use(scheduledPaymentLimiter);
router.use(sanitizeInput);

/**
 * @openapi
 * /api/scheduled-payments:
 *   post:
 *     summary: Create a new scheduled payment
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [billId, amount, paymentMethod, frequency, startDate]
 *             properties:
 *               billId:
 *                 type: string
 *               amount:
 *                 type: number
 *               paymentMethod:
 *                 type: string
 *                 enum: [BANK_TRANSFER, CREDIT_CARD, CRYPTO, STELLAR]
 *               frequency:
 *                 type: string
 *                 enum: [DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, ANNUALLY]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               maxRetries:
 *                 type: integer
 *                 default: 3
 */
router.post("/", scheduledPaymentController.create.bind(scheduledPaymentController));

/**
 * @openapi
 * /api/scheduled-payments:
 *   get:
 *     summary: Get all scheduled payments for the authenticated user
 *     security:
 *       - BearerAuth: []
 */
router.get("/", scheduledPaymentController.getAll.bind(scheduledPaymentController));

/**
 * @openapi
 * /api/scheduled-payments/{id}:
 *   get:
 *     summary: Get a specific scheduled payment by ID
 *     security:
 *       - BearerAuth: []
 */
router.get("/:id", scheduledPaymentController.getById.bind(scheduledPaymentController));

/**
 * @openapi
 * /api/scheduled-payments/{id}/pause:
 *   patch:
 *     summary: Pause an active scheduled payment
 *     security:
 *       - BearerAuth: []
 */
router.patch("/:id/pause", scheduledPaymentController.pause.bind(scheduledPaymentController));

/**
 * @openapi
 * /api/scheduled-payments/{id}/resume:
 *   patch:
 *     summary: Resume a paused scheduled payment
 *     security:
 *       - BearerAuth: []
 */
router.patch("/:id/resume", scheduledPaymentController.resume.bind(scheduledPaymentController));

/**
 * @openapi
 * /api/scheduled-payments/{id}/cancel:
 *   patch:
 *     summary: Cancel a scheduled payment
 *     security:
 *       - BearerAuth: []
 */
router.patch("/:id/cancel", scheduledPaymentController.cancel.bind(scheduledPaymentController));

/**
 * @openapi
 * /api/scheduled-payments/{id}/history:
 *   get:
 *     summary: Get execution history for a scheduled payment
 *     security:
 *       - BearerAuth: []
 */
router.get("/:id/history", scheduledPaymentController.getHistory.bind(scheduledPaymentController));

export default router;
