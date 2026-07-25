import { Request, Response } from 'express';
import { FileStorageService } from '../services/FileStorageService';
import { errorResponse } from '../utils/errorResponse';

const fileStorageService = new FileStorageService();

export const uploadDocument = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No file uploaded');
    }

    const userId = req.body.userId;
    if (!userId) {
      return errorResponse(res, 400, 'User ID is required');
    }

    const document = await fileStorageService.uploadFile(req.file, userId);
    res.status(201).json(document);
  } catch (error) {
    console.error('Upload error:', error);
    errorResponse(res, 500, 'File upload failed');
  }
};