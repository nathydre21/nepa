/**
 * Comprehensive Input Validation System
 * 
 * Features:
 * - Data type validation
 * - Business logic validation
 * - Custom validation rules
 * - Sanitization
 * - Detailed error messages
 * - Validation testing support
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger, LogCategory } from './logger';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  code: string;
  constraint?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  sanitizedData?: any;
}

export interface ValidationConfig {
  schema: Joi.ObjectSchema;
  sanitize?: boolean;
  stripUnknown?: boolean;
  abortEarly?: boolean;
  context?: any;
  businessRules?: BusinessRule[];
}

export interface BusinessRule {
  name: string;
  validate: (data: any, context?: any) => Promise<ValidationResult> | ValidationResult;
  message?: string;
}

export enum ValidationType {
  BODY = 'body',
  QUERY = 'query',
  PARAMS = 'params',
  HEADERS = 'headers',
  FILES = 'files'
}

// ============================================================================
// Validation Middleware Factory
// ============================================================================

export class ValidationMiddleware {
  /**
   * Validate request body
   */
  static validateBody(config: ValidationConfig) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await ValidationMiddleware.validate(
          req.body,
          config,
          ValidationType.BODY,
          req
        );

        if (!result.isValid) {
          logger.warn('Request body validation failed', {
            category: LogCategory.SECURITY,
            errors: result.errors,
            endpoint: req.originalUrl,
            method: req.method
          });

          return res.status(400).json({
            error: 'Validation failed',
            errors: result.errors,
            timestamp: new Date().toISOString()
          });
        }

        req.body = result.sanitizedData || req.body;
        next();
      } catch (error) {
        logger.logError(error as Error, {
          category: LogCategory.APPLICATION,
          context: 'body-validation',
          endpoint: req.originalUrl
        });
        res.status(500).json({ error: 'Validation processing failed' });
      }
    };
  }

  /**
   * Validate query parameters
   */
  static validateQuery(config: ValidationConfig) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await ValidationMiddleware.validate(
          req.query,
          config,
          ValidationType.QUERY,
          req
        );

        if (!result.isValid) {
          logger.warn('Query validation failed', {
            category: LogCategory.SECURITY,
            errors: result.errors,
            endpoint: req.originalUrl
          });

          return res.status(400).json({
            error: 'Query validation failed',
            errors: result.errors,
            timestamp: new Date().toISOString()
          });
        }

        req.query = result.sanitizedData || req.query;
        next();
      } catch (error) {
        logger.logError(error as Error, {
          category: LogCategory.APPLICATION,
          context: 'query-validation'
        });
        res.status(500).json({ error: 'Query validation processing failed' });
      }
    };
  }

  /**
   * Validate route parameters
   */
  static validateParams(config: ValidationConfig) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await ValidationMiddleware.validate(
          req.params,
          config,
          ValidationType.PARAMS,
          req
        );

        if (!result.isValid) {
          logger.warn('Params validation failed', {
            category: LogCategory.SECURITY,
            errors: result.errors,
            endpoint: req.originalUrl
          });

          return res.status(400).json({
            error: 'Parameter validation failed',
            errors: result.errors,
            timestamp: new Date().toISOString()
          });
        }

        req.params = result.sanitizedData || req.params;
        next();
      } catch (error) {
        logger.logError(error as Error, {
          category: LogCategory.APPLICATION,
          context: 'params-validation'
        });
        res.status(500).json({ error: 'Parameter validation processing failed' });
      }
    };
  }

  /**
   * Validate request headers
   */
  static validateHeaders(config: ValidationConfig) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await ValidationMiddleware.validate(
          req.headers,
          config,
          ValidationType.HEADERS,
          req
        );

        if (!result.isValid) {
          logger.warn('Headers validation failed', {
            category: LogCategory.SECURITY,
            errors: result.errors,
            endpoint: req.originalUrl
          });

          return res.status(400).json({
            error: 'Header validation failed',
            errors: result.errors,
            timestamp: new Date().toISOString()
          });
        }

        next();
      } catch (error) {
        logger.logError(error as Error, {
          category: LogCategory.APPLICATION,
          context: 'headers-validation'
        });
        res.status(500).json({ error: 'Header validation processing failed' });
      }
    };
  }

  /**
   * Core validation logic
   */
  private static async validate(
    data: any,
    config: ValidationConfig,
    type: ValidationType,
    req: Request
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Step 1: Schema validation
    const options: Joi.ValidationOptions = {
      abortEarly: config.abortEarly !== undefined ? config.abortEarly : false,
      stripUnknown: config.stripUnknown !== undefined ? config.stripUnknown : true,
      allowUnknown: false,
      convert: true,
      context: config.context
    };

    const { error, value } = config.schema.validate(data, options);

    if (error) {
      error.details.forEach(detail => {
        errors.push({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
          code: detail.type,
          constraint: detail.context?.limit
        });
      });
    }

    // Step 2: Business rules validation
    if (config.businessRules && errors.length === 0) {
      for (const rule of config.businessRules) {
        try {
          const ruleResult = await rule.validate(value || data, {
            ...config.context,
            req,
            type
          });

          if (!ruleResult.isValid) {
            errors.push(...ruleResult.errors);
          }
        } catch (ruleError) {
          logger.logError(ruleError as Error, {
            category: LogCategory.APPLICATION,
            context: 'business-rule-validation',
            rule: rule.name
          });
          errors.push({
            field: 'general',
            message: rule.message || `Business rule '${rule.name}' failed`,
            code: 'business_rule_error'
          });
        }
      }
    }

    // Step 3: Sanitization
    let sanitizedData = value || data;
    if (config.sanitize && errors.length === 0) {
      sanitizedData = ValidationMiddleware.sanitizeData(sanitizedData);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: errors.length === 0 ? sanitizedData : undefined
    };
  }

  /**
   * Sanitize data to prevent XSS and injection attacks
   */
  private static sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return ValidationMiddleware.sanitizeString(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => ValidationMiddleware.sanitizeData(item));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = ValidationMiddleware.sanitizeData(value);
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Sanitize string to prevent XSS
   */
  private static sanitizeString(str: string): string {
    return str
      .trim()
      // Remove script tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove event handlers
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      // Remove javascript: protocol
      .replace(/javascript:/gi, '')
      // Escape HTML entities
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
}

// ============================================================================
// Common Validation Schemas
// ============================================================================

export const CommonSchemas = {
  // UUID validation
  uuid: Joi.string().uuid({ version: ['uuidv4'] }).required().messages({
    'string.guid': 'Invalid UUID format',
    'any.required': 'UUID is required'
  }),

  // Email validation
  email: Joi.string()
    .email({ tlds: { allow: true } })
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    }),

  // Password validation
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
      'any.required': 'Password is required'
    }),

  // Username validation
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.alphanum': 'Username must contain only letters and numbers',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username must not exceed 30 characters',
      'any.required': 'Username is required'
    }),

  // Phone number validation (E.164 format)
  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Invalid phone number format. Use E.164 format (e.g., +1234567890)'
    }),

  // URL validation
  url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .messages({
      'string.uri': 'Invalid URL format'
    }),

  // Date validation
  date: Joi.date()
    .iso()
    .messages({
      'date.format': 'Invalid date format. Use ISO 8601 format'
    }),

  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1).messages({
      'number.min': 'Page must be at least 1',
      'number.base': 'Page must be a number'
    }),
    limit: Joi.number().integer().min(1).max(100).default(20).messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit must not exceed 100',
      'number.base': 'Limit must be a number'
    }),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('desc').messages({
      'any.only': 'Order must be either "asc" or "desc"'
    })
  }),

  // Date range
  dateRange: Joi.object({
    startDate: Joi.date().iso().optional().messages({
      'date.format': 'Invalid start date format'
    }),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional().messages({
      'date.format': 'Invalid end date format',
      'date.min': 'End date must be after start date'
    }),
    timezone: Joi.string().optional()
  }),

  // Amount/Money validation
  amount: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      'number.positive': 'Amount must be positive',
      'number.base': 'Amount must be a number',
      'any.required': 'Amount is required'
    }),

  // Currency code
  currency: Joi.string()
    .length(3)
    .uppercase()
    .pattern(/^[A-Z]{3}$/)
    .default('USD')
    .messages({
      'string.length': 'Currency code must be 3 characters',
      'string.pattern.base': 'Invalid currency code format'
    }),

  // Status enum
  status: (values: string[]) => Joi.string()
    .valid(...values)
    .required()
    .messages({
      'any.only': `Status must be one of: ${values.join(', ')}`,
      'any.required': 'Status is required'
    }),

  // Array of IDs
  idArray: Joi.array()
    .items(Joi.string().uuid())
    .min(1)
    .max(100)
    .messages({
      'array.min': 'At least one ID is required',
      'array.max': 'Maximum 100 IDs allowed',
      'string.guid': 'Invalid ID format'
    }),

  // Search query
  searchQuery: Joi.string()
    .min(1)
    .max(100)
    .trim()
    .messages({
      'string.min': 'Search query must be at least 1 character',
      'string.max': 'Search query must not exceed 100 characters'
    }),

  // File upload
  file: Joi.object({
    fieldname: Joi.string().required(),
    originalname: Joi.string().required(),
    encoding: Joi.string().required(),
    mimetype: Joi.string().required(),
    size: Joi.number().integer().positive().max(10 * 1024 * 1024).required().messages({
      'number.max': 'File size must not exceed 10MB'
    }),
    buffer: Joi.binary().optional(),
    path: Joi.string().optional()
  })
};

// ============================================================================
// Common Business Rules
// ============================================================================

export const CommonBusinessRules = {
  /**
   * Validate that a resource exists
   */
  resourceExists: (
    resourceName: string,
    checkFunction: (id: string) => Promise<boolean>
  ): BusinessRule => ({
    name: `${resourceName}-exists`,
    validate: async (data: any) => {
      const id = data.id || data[`${resourceName}Id`];
      if (!id) {
        return {
          isValid: false,
          errors: [{
            field: 'id',
            message: `${resourceName} ID is required`,
            code: 'required'
          }]
        };
      }

      const exists = await checkFunction(id);
      if (!exists) {
        return {
          isValid: false,
          errors: [{
            field: 'id',
            message: `${resourceName} not found`,
            code: 'not_found',
            value: id
          }]
        };
      }

      return { isValid: true, errors: [] };
    },
    message: `${resourceName} validation failed`
  }),

  /**
   * Validate uniqueness
   */
  unique: (
    fieldName: string,
    checkFunction: (value: any, excludeId?: string) => Promise<boolean>
  ): BusinessRule => ({
    name: `${fieldName}-unique`,
    validate: async (data: any) => {
      const value = data[fieldName];
      if (!value) {
        return { isValid: true, errors: [] };
      }

      const isUnique = await checkFunction(value, data.id);
      if (!isUnique) {
        return {
          isValid: false,
          errors: [{
            field: fieldName,
            message: `${fieldName} already exists`,
            code: 'duplicate',
            value
          }]
        };
      }

      return { isValid: true, errors: [] };
    },
    message: `${fieldName} uniqueness validation failed`
  }),

  /**
   * Validate ownership
   */
  ownership: (
    resourceName: string,
    checkFunction: (resourceId: string, userId: string) => Promise<boolean>
  ): BusinessRule => ({
    name: `${resourceName}-ownership`,
    validate: async (data: any, context?: any) => {
      const resourceId = data.id || data[`${resourceName}Id`];
      const userId = context?.req?.user?.id;

      if (!userId) {
        return {
          isValid: false,
          errors: [{
            field: 'user',
            message: 'User authentication required',
            code: 'unauthorized'
          }]
        };
      }

      const isOwner = await checkFunction(resourceId, userId);
      if (!isOwner) {
        return {
          isValid: false,
          errors: [{
            field: 'id',
            message: `Access denied to ${resourceName}`,
            code: 'forbidden',
            value: resourceId
          }]
        };
      }

      return { isValid: true, errors: [] };
    },
    message: `${resourceName} ownership validation failed`
  }),

  /**
   * Validate date range
   */
  dateRange: (): BusinessRule => ({
    name: 'date-range',
    validate: (data: any) => {
      if (data.startDate && data.endDate) {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);

        if (start > end) {
          return {
            isValid: false,
            errors: [{
              field: 'endDate',
              message: 'End date must be after start date',
              code: 'invalid_range'
            }]
          };
        }

        // Check if range is too large (e.g., more than 1 year)
        const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
        if (end.getTime() - start.getTime() > maxRange) {
          return {
            isValid: false,
            errors: [{
              field: 'dateRange',
              message: 'Date range must not exceed 1 year',
              code: 'range_too_large'
            }]
          };
        }
      }

      return { isValid: true, errors: [] };
    },
    message: 'Date range validation failed'
  }),

  /**
   * Validate amount limits
   */
  amountLimit: (min: number, max: number): BusinessRule => ({
    name: 'amount-limit',
    validate: (data: any) => {
      const amount = data.amount;
      if (amount === undefined || amount === null) {
        return { isValid: true, errors: [] };
      }

      if (amount < min) {
        return {
          isValid: false,
          errors: [{
            field: 'amount',
            message: `Amount must be at least ${min}`,
            code: 'amount_too_low',
            value: amount,
            constraint: { min }
          }]
        };
      }

      if (amount > max) {
        return {
          isValid: false,
          errors: [{
            field: 'amount',
            message: `Amount must not exceed ${max}`,
            code: 'amount_too_high',
            value: amount,
            constraint: { max }
          }]
        };
      }

      return { isValid: true, errors: [] };
    },
    message: 'Amount limit validation failed'
  })
};

// ============================================================================
// Validation Helper Functions
// ============================================================================

export const ValidationHelpers = {
  /**
   * Combine multiple schemas
   */
  combineSchemas: (...schemas: Joi.ObjectSchema[]): Joi.ObjectSchema => {
    return schemas.reduce((combined, schema) => combined.concat(schema));
  },

  /**
   * Make all fields optional
   */
  makeOptional: (schema: Joi.ObjectSchema): Joi.ObjectSchema => {
    const description = schema.describe() as any;
    const optionalKeys: any = {};

    Object.keys(description.keys || {}).forEach(key => {
      optionalKeys[key] = Joi.any().optional();
    });

    return schema.fork(Object.keys(optionalKeys), (schema) => schema.optional());
  },

  /**
   * Create conditional validation
   */
  conditional: (
    condition: (data: any) => boolean,
    thenSchema: Joi.ObjectSchema,
    otherwiseSchema?: Joi.ObjectSchema
  ): Joi.AlternativesSchema => {
    return Joi.alternatives().conditional(
      Joi.ref('.'),
      {
        is: Joi.custom((value) => condition(value)),
        then: thenSchema,
        otherwise: otherwiseSchema || Joi.any()
      }
    );
  }
};

export default ValidationMiddleware;
