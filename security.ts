import helmet from 'helmet';
import cors from 'cors';
import { Express } from 'express';

export const configureSecurity = (app: Express) => {
  // Set security HTTP headers
  app.use(helmet());

  // CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true,
  }));
};