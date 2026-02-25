import { Request, Response } from 'express';
import { recurringPaymentService } from '../services/RecurringPaymentService';

export const createRecurring = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ status: 401, error: 'Auth required' });

    const { utilityId, billId, amount, cronExpression, startAt, maxRetries, baseRetryDelaySeconds } = req.body;

    if (!amount || !cronExpression) {
      return res.status(400).json({ status: 400, error: 'amount and cronExpression required' });
    }

    const rp = await recurringPaymentService.createRecurringPayment({
      userId,
      utilityId,
      billId,
      amount: Number(amount),
      cronExpression,
      startAt: startAt ? new Date(startAt) : undefined,
      maxRetries,
      baseRetryDelaySeconds
    });

    res.status(201).json({ status: 201, data: rp });
  } catch (err) {
    console.error('createRecurring error', err);
    res.status(500).json({ status: 500, error: 'Failed to create recurring payment' });
  }
};

export const cancelRecurring = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ status: 401, error: 'Auth required' });

    const id = req.params.id;
    await recurringPaymentService.cancelRecurringPayment(id, userId);
    res.status(200).json({ status: 200, message: 'Cancelled' });
  } catch (err: any) {
    console.error('cancelRecurring error', err);
    res.status(500).json({ status: 500, error: err.message || 'Failed to cancel' });
  }
};

export const listRecurring = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ status: 401, error: 'Auth required' });

    const list = await recurringPaymentService.listForUser(userId);
    res.status(200).json({ status: 200, data: list });
  } catch (err) {
    console.error('listRecurring error', err);
    res.status(500).json({ status: 500, error: 'Failed to list recurring payments' });
  }
};
