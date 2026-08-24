import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import zlib from 'zlib';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const gzip = promisify(zlib.gzip);
const prisma = new PrismaClient();

// Initialize S3 Client (Ensure AWS credentials are set in environment variables)
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface FileValidationOptions {
  maxSize?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
}

interface UploadProgress {
  fileId: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'paused';
  error?: string;
  bytesUploaded?: number;
  totalBytes?: number;
}

export class FileStorageService {
  private uploadQueue: Map<string, UploadProgress> = new Map();
  private pausedUploads: Set<string> = new Set();

  // Enhanced file validation
  validateFile(file: UploadedFile, options: FileValidationOptions = {}): { valid: boolean; error?: string } {
    const {
      maxSize = 50 * 1024 * 1024, // 50MB default
      allowedTypes = [],
      allowedExtensions = []
    } = options;

    // Check file size
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
      };
    }

    // Check MIME type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: `File type ${file.mimetype} is not allowed`
      };
    }

    // Check file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(fileExtension)) {
      return {
        valid: false,
        error: `File extension ${fileExtension} is not allowed`
      };
    }

    return { valid: true };
  }

  // Generate file preview
  async generatePreview(file: UploadedFile): Promise<string | null> {
    if (file.mimetype.startsWith('image/')) {
      // For images, return base64 thumbnail
      const maxSize = 200;
      const canvas = require('canvas');
      const img = new canvas.Image();
      img.src = file.buffer;
      
      const thumbnail = canvas.createCanvas(maxSize, maxSize);
      const ctx = thumbnail.getContext('2d');
      
      const scale = Math.min(maxSize / img.width, maxSize / img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      
      ctx.drawImage(img, 0, 0, width, height);
      return thumbnail.toDataURL('image/jpeg', 0.8);
    }
    
    if (file.mimetype.startsWith('text/')) {
      // For text files, return first 100 characters
      const text = file.buffer.toString('utf-8');
      return text.substring(0, 100) + (text.length > 100 ? '...' : '');
    }
    
    return null;
  }

  // Enhanced upload with progress tracking
  async uploadFile(
    file: UploadedFile, 
    userId: string, 
    provider: 'S3' | 'IPFS' = 'S3',
    options: FileValidationOptions = {},
    onProgress?: (progress: UploadProgress) => void
  ) {
    const fileId = uuidv4();
    
    // Validate file first
    const validation = this.validateFile(file, options);
    if (!validation.valid) {
      const errorProgress: UploadProgress = {
        fileId,
        filename: file.originalname,
        progress: 0,
        status: 'error',
        error: validation.error
      };
      this.uploadQueue.set(fileId, errorProgress);
      onProgress?.(errorProgress);
      throw new Error(validation.error);
    }

    // Initialize progress tracking
    const progress: UploadProgress = {
      fileId,
      filename: file.originalname,
      progress: 0,
      status: 'pending',
      totalBytes: file.size
    };
    this.uploadQueue.set(fileId, progress);
    onProgress?.(progress);

    try {
      // Update status to uploading
      progress.status = 'uploading';
      onProgress?.(progress);

      // Compress file for optimization
      progress.progress = 10;
      onProgress?.(progress);
      
      const compressedBuffer = await gzip(file.buffer);
      
      progress.progress = 30;
      onProgress?.(progress);
      
      let path = '';
      let key = '';

      if (provider === 'S3') {
        key = `documents/${userId}/${Date.now()}_${file.originalname}.gz`;
        
        // Simulate progress during upload
        const uploadProgress = setInterval(() => {
          if (!this.pausedUploads.has(fileId) && progress.progress < 90) {
            progress.progress += 10;
            progress.bytesUploaded = Math.floor((progress.progress / 100) * file.size);
            onProgress?.(progress);
          }
        }, 200);

        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: key,
          Body: compressedBuffer,
          ContentType: file.mimetype,
          ContentEncoding: 'gzip',
        }));

        clearInterval(uploadProgress);
        path = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;
      } else {
        // Mock IPFS implementation
        key = `ipfs_hash_${Date.now()}`;
        path = `ipfs://${key}`;
      }

      // Final progress update
      progress.progress = 100;
      progress.status = 'completed';
      progress.bytesUploaded = file.size;
      onProgress?.(progress);

      // Generate preview
      const preview = await this.generatePreview(file);

      // Save metadata to database
      // TODO: Fix document model in Prisma schema
      // const document = await prisma.document.create({
      //   data: {
      //     filename: file.originalname,
      //     originalName: file.originalname,
      //     mimeType: file.mimetype,
      //     size: file.size,
      //     path: path,
      //     provider: provider,
      //     userId: userId,
      //     preview: preview
      //   }
      // });

      // Return mock result for now
      const document = {
        id: fileId,
        filename: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: path,
        provider: provider,
        userId: userId,
        preview: preview,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      return { document, fileId };
    } catch (error) {
      progress.status = 'error';
      progress.error = error instanceof Error ? error.message : 'Upload failed';
      onProgress?.(progress);
      throw error;
    }
  }

  // Pause upload
  pauseUpload(fileId: string) {
    this.pausedUploads.add(fileId);
    const progress = this.uploadQueue.get(fileId);
    if (progress) {
      progress.status = 'paused';
    }
  }

  // Resume upload
  resumeUpload(fileId: string) {
    this.pausedUploads.delete(fileId);
    const progress = this.uploadQueue.get(fileId);
    if (progress && progress.status === 'paused') {
      progress.status = 'uploading';
    }
  }

  // Get upload progress
  getUploadProgress(fileId: string): UploadProgress | undefined {
    return this.uploadQueue.get(fileId);
  }

  // Get all uploads for user
  getUserUploads(userId: string): UploadProgress[] {
    return Array.from(this.uploadQueue.values());
  }

  // Delete file
  async deleteFile(documentId: string, userId: string) {
    // TODO: Fix document model in Prisma schema
    // const document = await prisma.document.findFirst({
    //   where: { id: documentId, userId }
    // });

    // Mock document for now
    const document = {
      id: documentId,
      userId: userId,
      path: `mock-path-${documentId}`,
      provider: 'S3'
    };

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.provider === 'S3') {
      const key = document.path.split('.s3.amazonaws.com/')[1];
      if (key) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: key
        }));
      }
    }

    // TODO: Fix document model in Prisma schema
    // await prisma.document.delete({
    //   where: { id: documentId }
    // });
    
    // Mock deletion
    console.log(`Mock deletion of document ${documentId}`);
  }

  // Batch upload
  async uploadBatch(
    files: UploadedFile[],
    userId: string,
    options: FileValidationOptions = {},
    onProgress?: (progress: UploadProgress) => void
  ) {
    const results = [];
    
    for (const file of files) {
      try {
        const result = await this.uploadFile(file, userId, 'S3', options, onProgress);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ 
          success: false, 
          filename: file.originalname, 
          error: error instanceof Error ? error.message : 'Upload failed' 
        });
      }
    }
    
    return results;
  }
}