import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import zlib from 'zlib';
import { promisify } from 'util';

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

export class FileStorageService {
  async uploadFile(file: UploadedFile, userId: string, provider: 'S3' | 'IPFS' = 'S3') {
    // 1. Compress file for optimization
    const compressedBuffer = await gzip(file.buffer);
    
    let path = '';
    let key = '';

    if (provider === 'S3') {
      key = `documents/${userId}/${Date.now()}_${file.originalname}.gz`;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: compressedBuffer,
        ContentType: file.mimetype,
        ContentEncoding: 'gzip',
      }));

      path = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;
    } else {
      // Mock IPFS implementation
      // In production, use 'ipfs-http-client' to add file to IPFS node
      key = `ipfs_hash_${Date.now()}`;
      path = `ipfs://${key}`;
    }

    // 2. Save metadata to database
    return prisma.document.create({
      data: {
        filename: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: path,
        provider: provider,
        userId: userId
      }
    });
  }
}