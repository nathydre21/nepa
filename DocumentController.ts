import { Request, Response } from 'express';
import { FileStorageService } from '../services/FileStorageService';

const fileStorageService = new FileStorageService();

export const uploadDocument = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.body.userId;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const document = await fileStorageService.uploadFile(req.file, userId);
    res.status(201).json(document);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
};