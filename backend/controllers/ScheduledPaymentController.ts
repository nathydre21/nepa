import { Request, Response } from "express";
import { scheduledPaymentService } from "../services/ScheduledPaymentService";
import { getMicroserviceCacheService } from "../services/cache/MicroserviceCacheService";

const cacheService = getMicroserviceCacheService();

export class ScheduledPaymentController {

  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ status: 401, error: "Authentication required" });
        return;
      }

      const { billId, amount, paymentMethod, frequency, startDate, endDate, maxRetries } = req.body;

      if (!billId || amount === undefined || amount === null || !paymentMethod || !frequency || !startDate) {
        res.status(400).json({ status: 400, error: "Missing required fields: billId, amount, paymentMethod, frequency, startDate" });
        return;
      }

      if (!["DAILY","WEEKLY","BIWEEKLY","MONTHLY","QUARTERLY","ANNUALLY"].includes(frequency)) {
        res.status(400).json({ status: 400, error: "Invalid frequency value" });
        return;
      }

      if (Number(amount) <= 0) {
        res.status(400).json({ status: 400, error: "Amount must be greater than 0" });
        return;
      }

      const scheduled = await scheduledPaymentService.createScheduledPayment({
        userId,
        billId,
        amount: Number(amount),
        paymentMethod,
        frequency,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
        maxRetries: maxRetries ? Number(maxRetries) : 3,
      });

      await cacheService.invalidateScheduledPaymentCache(userId);
      res.status(201).json({
        status: 201,
        message: "Scheduled payment created successfully",
        data: scheduled,
      });
    } catch (error: any) {
      res.status(500).json({ status: 500, error: "Failed to create scheduled payment", message: error.message });
    }
  }

  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ status: 401, error: "Authentication required" });
        return;
      }
      const cached = await cacheService.getScheduledPayments(userId);
      if (cached) {
        res.status(200).json({ status: 200, data: cached, source: "cache" });
        return;
      }
      const schedules = await scheduledPaymentService.getUserScheduledPayments(userId);
      await cacheService.cacheScheduledPayments(userId, schedules);
      res.status(200).json({ status: 200, data: schedules });
    } catch (error: any) {
      res.status(500).json({ status: 500, error: "Failed to retrieve scheduled payments", message: error.message });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ status: 401, error: "Authentication required" });
        return;
      }
      const { id } = req.params;
      const schedule = await scheduledPaymentService.getScheduledPaymentById(id, userId);
      if (!schedule) {
        res.status(404).json({ status: 404, error: "Scheduled payment not found" });
        return;
      }
      res.status(200).json({ status: 200, data: schedule });
    } catch (error: any) {
      res.status(500).json({ status: 500, error: "Failed to retrieve scheduled payment", message: error.message });
    }
  }

  async pause(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ status: 401, error: "Authentication required" });
        return;
      }
      const { id } = req.params;
      const result = await scheduledPaymentService.pauseScheduledPayment(id, userId);
      if (result.count === 0) {
        res.status(404).json({ status: 404, error: "Scheduled payment not found or already paused" });
        return;
      }
      await cacheService.invalidateScheduledPaymentCache(userId, id);
      res.status(200).json({ status: 200, message: "Scheduled payment paused successfully" });
    } catch (error: any) {
      res.status(500).json({ status: 500, error: "Failed to pause scheduled payment", message: error.message });
    }
  }

  async resume(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ status: 401, error: "Authentication required" });
        return;
      }
      const { id } = req.params;
      const result = await scheduledPaymentService.resumeScheduledPayment(id, userId);
      if (result.count === 0) {
        res.status(404).json({ status: 404, error: "Scheduled payment not found or not paused" });
        return;
      }
      await cacheService.invalidateScheduledPaymentCache(userId, id);
      res.status(200).json({ status: 200, message: "Scheduled payment resumed successfully" });
    } catch (error: any) {
      res.status(500).json({ status: 500, error: "Failed to resume scheduled payment", message: error.message });
    }
  }

  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ status: 401, error: "Authentication required" });
        return;
      }
      const { id } = req.params;
      const result = await scheduledPaymentService.cancelScheduledPayment(id, userId);
      if (result.count === 0) {
        res.status(404).json({ status: 404, error: "Scheduled payment not found or already cancelled" });
        return;
      }
      await cacheService.invalidateScheduledPaymentCache(userId, id);
      res.status(200).json({ status: 200, message: "Scheduled payment cancelled successfully" });
    } catch (error: any) {
      res.status(500).json({ status: 500, error: "Failed to cancel scheduled payment", message: error.message });
    }
  }

  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ status: 401, error: "Authentication required" });
        return;
      }
      const { id } = req.params;
      const logs = await scheduledPaymentService.getPaymentExecutionHistory(id, userId);
      res.status(200).json({ status: 200, data: logs });
    } catch (error: any) {
      res.status(500).json({ status: 500, error: "Failed to retrieve execution history", message: error.message });
    }
  }
}

export const scheduledPaymentController = new ScheduledPaymentController();
