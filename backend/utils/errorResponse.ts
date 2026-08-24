import { Response } from 'express';

/**
 * Send a standardized error JSON response from controllers.
 * Format: { success: false, error: message }
 */
export function errorResponse(
  res: Response,
  code: number,
  message: string | undefined | null
) {
  return res.status(code).json({
    success: false,
    error: message ?? 'Unknown error',
  });
}
