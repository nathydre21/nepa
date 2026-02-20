import { Request, Response, NextFunction } from 'express';

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    console.warn('API_KEY environment variable is not set.');
  }

  if (apiKey && apiKey === validApiKey) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
};