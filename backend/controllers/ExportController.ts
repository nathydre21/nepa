import { Request, Response } from 'express';
import { exportService, ExportOptions, ExportProgress } from '../services/ExportService';
import { PrismaClient, BillStatus, PaymentStatus, UserRole } from '@prisma/client';
import { join } from 'path';
import { existsSync, createReadStream } from 'fs';
import { errorResponse } from '../utils/errorResponse';

const prisma = new PrismaClient();

/**
 * @openapi
 * /api/export:
 *   post:
 *     summary: Export data in various formats
 *     description: Export payments, bills, users, or analytics data as CSV, Excel, or PDF
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [csv, excel, pdf]
 *                 description: Export format
 *               dataType:
 *                 type: string
 *                 enum: [payments, bills, users, analytics]
 *                 description: Type of data to export
 *               filters:
 *                 type: object
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date
 *                   endDate:
 *                     type: string
 *                     format: date
 *                   userId:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED, PAID, OVERDUE, CANCELLED]
 *                   utilityType:
 *                     type: string
 *                     enum: [ELECTRICITY, WATER, GAS]
 *                   role:
 *                     type: string
 *                     enum: [USER, ADMIN, SUPER_ADMIN]
 *                   limit:
 *                     type: number
 *                     default: 1000
 *                   offset:
 *                     type: number
 *                     default: 0
 *               columns:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific columns to include (optional)
 *     responses:
 *       200:
 *         description: Export started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exportId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 totalRecords:
 *                   type: number
 *       400:
 *         description: Invalid export parameters
 *       500:
 *         description: Failed to start export
 */
export const startExport = async (req: Request, res: Response) => {
  try {
    const { format, dataType, filters, columns } = req.body;

    // Validate required fields
    if (!format || !dataType) {
      return errorResponse(res, 400, 'Missing required fields: format and dataType are required');
    }

    // Validate format
    if (!['csv', 'excel', 'pdf'].includes(format)) {
      return errorResponse(res, 400, 'Invalid format. Must be one of: csv, excel, pdf');
    }

    // Validate data type
    if (!['payments', 'bills', 'users', 'analytics'].includes(dataType)) {
      return errorResponse(res, 400, 'Invalid dataType. Must be one of: payments, bills, users, analytics');
    }

    // Parse and validate filters
    const exportFilters: any = {};
    if (filters) {
      if (filters.startDate) {
        exportFilters.startDate = new Date(filters.startDate);
        if (isNaN(exportFilters.startDate.getTime())) {
          return errorResponse(res, 400, 'Invalid startDate format');
        }
      }
      
      if (filters.endDate) {
        exportFilters.endDate = new Date(filters.endDate);
        if (isNaN(exportFilters.endDate.getTime())) {
          return errorResponse(res, 400, 'Invalid endDate format');
        }
      }

      if (filters.userId) exportFilters.userId = filters.userId;
      if (filters.limit) exportFilters.limit = parseInt(filters.limit);
      if (filters.offset) exportFilters.offset = parseInt(filters.offset);

      // Validate status based on data type
      if (filters.status) {
        if (dataType === 'payments') {
          if (!Object.values(PaymentStatus).includes(filters.status as PaymentStatus)) {
            return errorResponse(res, 400, 'Invalid payment status');
          }
          exportFilters.status = filters.status as PaymentStatus;
        } else if (dataType === 'bills') {
          if (!Object.values(BillStatus).includes(filters.status as BillStatus)) {
            return errorResponse(res, 400, 'Invalid bill status');
          }
          exportFilters.status = filters.status as BillStatus;
        }
      }

      if (filters.utilityType) {
        if (!['ELECTRICITY', 'WATER', 'GAS'].includes(filters.utilityType)) {
          return errorResponse(res, 400, 'Invalid utility type');
        }
        exportFilters.utilityType = filters.utilityType;
      }

      if (filters.role) {
        if (!Object.values(UserRole).includes(filters.role as UserRole)) {
          return errorResponse(res, 400, 'Invalid user role');
        }
        exportFilters.role = filters.role as UserRole;
      }
    }

    // Validate date range
    if (exportFilters.startDate && exportFilters.endDate) {
      if (exportFilters.startDate > exportFilters.endDate) {
        return errorResponse(res, 400, 'startDate must be before endDate');
      }
    }

    // Create export options
    const exportOptions: ExportOptions = {
      format: format as 'csv' | 'excel' | 'pdf',
      dataType: dataType as 'payments' | 'bills' | 'users' | 'analytics',
      filters: exportFilters,
      columns
    };

    // Start export process
    const progress = await exportService.exportData(exportOptions);

    res.status(200).json({
      exportId: progress.id,
      status: progress.status,
      totalRecords: progress.totalRecords,
      message: 'Export started successfully'
    });

  } catch (error) {
    console.error('Export error:', error);
    errorResponse(res, 500, 'Failed to start export');
  }
};

/**
 * @openapi
 * /api/export/progress/{exportId}:
 *   get:
 *     summary: Get export progress
 *     description: Check the status and progress of an ongoing export
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: exportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Export progress retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [pending, processing, completed, failed]
 *                 progress:
 *                   type: number
 *                 totalRecords:
 *                   type: number
 *                 processedRecords:
 *                   type: number
 *                 downloadUrl:
 *                   type: string
 *                 error:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                 completedAt:
 *                   type: string
 *       404:
 *         description: Export not found
 */
export const getExportProgress = async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;

    if (!exportId) {
      return errorResponse(res, 400, 'Export ID is required');
    }

    const progress = exportService.getExportProgress(exportId);

    if (!progress) {
      return errorResponse(res, 404, 'Export not found');
    }

    res.status(200).json(progress);

  } catch (error) {
    console.error('Get export progress error:', error);
    errorResponse(res, 500, 'Failed to get export progress');
  }
};

/**
 * @openapi
 * /api/export/progress:
 *   get:
 *     summary: Get all active exports
 *     description: Retrieve status of all active exports
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Active exports retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   status:
 *                     type: string
 *                   progress:
 *                     type: number
 *                   totalRecords:
 *                     type: number
 *                   processedRecords:
 *                     type: number
 *                   createdAt:
 *                     type: string
 */
export const getAllExports = async (req: Request, res: Response) => {
  try {
    const exports = exportService.getAllActiveExports();
    res.status(200).json(exports);

  } catch (error) {
    console.error('Get all exports error:', error);
    errorResponse(res, 500, 'Failed to get exports');
  }
};

/**
 * @openapi
 * /api/export/download/{exportId}:
 *   get:
 *     summary: Download exported file
 *     description: Download the generated export file
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: exportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File downloaded successfully
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Export not found or not completed
 *       400:
 *         description: Export not ready for download
 */
export const downloadExport = async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;

    if (!exportId) {
      return errorResponse(res, 400, 'Export ID is required');
    }

    const progress = exportService.getExportProgress(exportId);

    if (!progress) {
      return errorResponse(res, 404, 'Export not found');
    }

    if (progress.status !== 'completed') {
      return errorResponse(res, 400, 'Export not ready for download');
    }

    // Determine file path based on export ID (assuming file naming convention)
    const possibleExtensions = ['.csv', '.xlsx', '.pdf'];
    let filePath = '';
    let contentType = '';
    let fileName = '';

    for (const ext of possibleExtensions) {
      const testPath = join(process.cwd(), 'exports', `${exportId}${ext}`);
      if (existsSync(testPath)) {
        filePath = testPath;
        fileName = `export_${exportId}${ext}`;
        
        // Set content type based on extension
        switch (ext) {
          case '.csv':
            contentType = 'text/csv';
            break;
          case '.xlsx':
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            break;
          case '.pdf':
            contentType = 'application/pdf';
            break;
        }
        break;
      }
    }

    if (!filePath) {
      return errorResponse(res, 404, 'Export file not found');
    }

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', contentType);

    // Stream the file
    const fileStream = createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Download export error:', error);
    errorResponse(res, 500, 'Failed to download export');
  }
};

/**
 * @openapi
 * /api/export/cleanup:
 *   post:
 *     summary: Clean up old exports
 *     description: Remove old export records and files (admin only)
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxAgeHours:
 *                 type: number
 *                 default: 24
 *                 description: Maximum age in hours for exports to keep
 *     responses:
 *       200:
 *         description: Cleanup completed successfully
 *       403:
 *         description: Admin access required
 */
export const cleanupExports = async (req: Request, res: Response) => {
  try {
    // Check if user is admin (this would depend on your auth system)
    const user = (req as any).user;
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return errorResponse(res, 403, 'Admin access required');
    }

    const { maxAgeHours = 24 } = req.body;
    
    await exportService.cleanupOldExports(maxAgeHours);

    res.status(200).json({
      message: 'Export cleanup completed successfully',
      maxAgeHours
    });

  } catch (error) {
    console.error('Cleanup exports error:', error);
    errorResponse(res, 500, 'Failed to cleanup exports');
  }
};

/**
 * @openapi
 * /api/export/templates:
 *   get:
 *     summary: Get export templates
 *     description: Get available export templates and column options
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Export templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataTypes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       columns:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             title:
 *                               type: string
 *                             description:
 *                               type: string
 *                 formats:
 *                   type: array
 *                   items:
 *                     type: string
 */
export const getExportTemplates = async (req: Request, res: Response) => {
  try {
    const templates = {
      dataTypes: [
        {
          name: 'payments',
          displayName: 'Payments',
          description: 'Payment transactions and history',
          columns: [
            { id: 'id', title: 'Payment ID', description: 'Unique payment identifier' },
            { id: 'amount', title: 'Amount', description: 'Payment amount' },
            { id: 'currency', title: 'Currency', description: 'Payment currency' },
            { id: 'status', title: 'Status', description: 'Payment status' },
            { id: 'method', title: 'Method', description: 'Payment method' },
            { id: 'transactionId', title: 'Transaction ID', description: 'External transaction ID' },
            { id: 'userEmail', title: 'User Email', description: 'User email address' },
            { id: 'billNumber', title: 'Bill Number', description: 'Associated bill number' },
            { id: 'utilityProvider', title: 'Utility Provider', description: 'Utility provider name' },
            { id: 'createdAt', title: 'Created At', description: 'Payment creation date' }
          ]
        },
        {
          name: 'bills',
          displayName: 'Bills',
          description: 'Utility bills and invoices',
          columns: [
            { id: 'id', title: 'Bill ID', description: 'Unique bill identifier' },
            { id: 'billNumber', title: 'Bill Number', description: 'Bill reference number' },
            { id: 'amount', title: 'Amount', description: 'Bill amount' },
            { id: 'status', title: 'Status', description: 'Bill status' },
            { id: 'dueDate', title: 'Due Date', description: 'Bill due date' },
            { id: 'userEmail', title: 'User Email', description: 'User email address' },
            { id: 'utilityProvider', title: 'Utility Provider', description: 'Utility provider name' },
            { id: 'utilityType', title: 'Utility Type', description: 'Type of utility' },
            { id: 'createdAt', title: 'Created At', description: 'Bill creation date' }
          ]
        },
        {
          name: 'users',
          displayName: 'Users',
          description: 'User accounts and profiles',
          columns: [
            { id: 'id', title: 'User ID', description: 'Unique user identifier' },
            { id: 'email', title: 'Email', description: 'User email address' },
            { id: 'firstName', title: 'First Name', description: 'User first name' },
            { id: 'lastName', title: 'Last Name', description: 'User last name' },
            { id: 'role', title: 'Role', description: 'User role' },
            { id: 'isActive', title: 'Active', description: 'Account status' },
            { id: 'billsCount', title: 'Bills Count', description: 'Number of bills' },
            { id: 'paymentsCount', title: 'Payments Count', description: 'Number of payments' },
            { id: 'createdAt', title: 'Created At', description: 'Account creation date' }
          ]
        },
        {
          name: 'analytics',
          displayName: 'Analytics',
          description: 'Analytics and reporting data',
          columns: [
            { id: 'date', title: 'Date', description: 'Analytics date' },
            { id: 'paymentsCount', title: 'Payments Count', description: 'Number of payments' },
            { id: 'revenue', title: 'Revenue', description: 'Total revenue' },
            { id: 'billsCount', title: 'Bills Count', description: 'Number of bills' }
          ]
        }
      ],
      formats: [
        { value: 'csv', label: 'CSV', description: 'Comma-separated values' },
        { value: 'excel', label: 'Excel', description: 'Microsoft Excel format' },
        { value: 'pdf', label: 'PDF', description: 'Portable Document Format' }
      ],
      filters: {
        statuses: {
          payments: Object.values(PaymentStatus),
          bills: Object.values(BillStatus)
        },
        utilityTypes: ['ELECTRICITY', 'WATER', 'GAS'],
        userRoles: Object.values(UserRole)
      }
    };

    res.status(200).json(templates);

  } catch (error) {
    console.error('Get export templates error:', error);
    errorResponse(res, 500, 'Failed to get export templates');
  }
};
