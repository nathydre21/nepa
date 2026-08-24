import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';

// Sanitization utilities
export const sanitizeString = (input: any): string => {
  if (typeof input !== 'string') {
    return '';
  }
  
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
};

export const sanitizeEmail = (email: string): string => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const sanitized = sanitizeString(email);
  return emailRegex.test(sanitized) ? sanitized.toLowerCase() : '';
};

export const sanitizePhoneNumber = (phone: string): string => {
  const sanitized = sanitizeString(phone);
  return sanitized.replace(/[^\d+\-\s()]/g, '');
};

export const sanitizeUrl = (url: string): string => {
  try {
    const sanitized = sanitizeString(url);
    const urlObj = new URL(sanitized);
    // Only allow http and https protocols
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return sanitized;
    }
    return '';
  } catch {
    return '';
  }
};

export const sanitizeNumber = (value: any): number => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

export const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
};

// Validation schemas using Joi-like validation
export const validateSchema = {
  email: (value: any): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },
  
  password: (value: any): boolean => {
    // At least 8 characters, one uppercase, one lowercase, one number, one special character
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(value);
  },
  
  name: (value: any): boolean => {
    // Only letters, spaces, hyphens, and apostrophes, max 50 characters
    const nameRegex = /^[a-zA-Z\s\-']{1,50}$/;
    return nameRegex.test(value);
  },
  
  phone: (value: any): boolean => {
    // Basic phone number validation
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(value);
  },
  
  uuid: (value: any): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }
};

// Middleware for input sanitization
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

// Validation middleware factory
export const validateInput = (schema: Record<string, { type: string; required?: boolean }>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      
      // Check if required field is missing
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      // Skip validation if field is not provided and not required
      if (value === undefined || value === null || value === '') {
        continue;
      }
      
      // Validate based on type
      switch (rules.type) {
        case 'email':
          if (!validateSchema.email(value)) {
            errors.push(`${field} must be a valid email address`);
          }
          break;
        case 'password':
          if (!validateSchema.password(value)) {
            errors.push(`${field} must be at least 8 characters with uppercase, lowercase, number, and special character`);
          }
          break;
        case 'name':
          if (!validateSchema.name(value)) {
            errors.push(`${field} must contain only letters, spaces, hyphens, and apostrophes`);
          }
          break;
        case 'phone':
          if (!validateSchema.phone(value)) {
            errors.push(`${field} must be a valid phone number`);
          }
          break;
        case 'uuid':
          if (!validateSchema.uuid(value)) {
            errors.push(`${field} must be a valid UUID`);
          }
          break;
        case 'string':
          if (typeof value !== 'string' || value.length > 1000) {
            errors.push(`${field} must be a string with max 1000 characters`);
          }
          break;
        case 'number':
          if (isNaN(Number(value))) {
            errors.push(`${field} must be a valid number`);
          }
          break;
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }
    
    next();
  };
};

// SQL Injection prevention for database queries
export const sanitizeQuery = (query: string): string => {
  if (typeof query !== 'string') {
    return '';
  }
  
  // Remove common SQL injection patterns
  return query
    .replace(/('|(\\')|(;)|(\s+(or|and)\s+.*=.*))/gi, '')
    .replace(/(union|select|insert|update|delete|drop|create|alter|exec|execute)/gi, '')
    .trim();
};

// XSS prevention for HTML content
export const sanitizeHTML = (html: string): string => {
  if (typeof html !== 'string') {
    return '';
  }
  
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li'],
    ALLOWED_ATTR: []
  });
};
