import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        [key: string]: any;
      };
      session?: {
        id: string;
        [key: string]: any;
      };
      suspicious?: boolean;
    }
  }
}

export {};