import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';

// ─── Core sanitization utilities ─────────────────────────────────────────────

/**
 * Strip ALL HTML tags and attributes from a plain-text string.
 * This is the default sanitizer; use sanitizeHTML for rich-text fields.
 */
export const sanitizeString = (input: any): string => {
  if (typeof input !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
};

/**
 * Sanitize an email address: strip XSS then validate format.
 * Returns an empty string if the sanitised value is not a valid e-mail.
 */
export const sanitizeEmail = (email: string): string => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const sanitized = sanitizeString(email);
  return emailRegex.test(sanitized) ? sanitized.toLowerCase() : '';
};

/**
 * Sanitize a phone number — strip XSS then remove non-phone characters.
 */
export const sanitizePhoneNumber = (phone: string): string => {
  const sanitized = sanitizeString(phone);
  return sanitized.replace(/[^\d+\-\s()]/g, '');
};

/**
 * Sanitize a URL — strip XSS then restrict to http / https protocols.
 * Returns an empty string for malformed or non-http(s) URLs.
 */
export const sanitizeUrl = (url: string): string => {
  try {
    const sanitized = sanitizeString(url);
    const urlObj = new URL(sanitized);
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return sanitized;
    }
    return '';
  } catch {
    return '';
  }
};

/**
 * Coerce a value to a safe number; returns 0 for NaN / non-numeric input.
 */
export const sanitizeNumber = (value: any): number => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

/**
 * Recursively sanitize an arbitrary object / array / scalar value.
 * Every string is passed through sanitizeString.
 */
export const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
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

/**
 * Sanitize rich-text / HTML content while preserving a safe subset of tags.
 * Use this ONLY for fields explicitly intended to store formatted text.
 */
export const sanitizeHTML = (html: string): string => {
  if (typeof html !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li'],
    ALLOWED_ATTR: [],
  });
};

/**
 * Naïve SQL-injection scrubber for use with raw-query fallbacks.
 * Prefer parameterised queries (Prisma / pg / etc.) over this function.
 */
export const sanitizeQuery = (query: string): string => {
  if (typeof query !== 'string') {
    return '';
  }

  return query
    .replace(/('|(\\')|(;)|(\s+(or|and)\s+.*=.*))/gi, '')
    .replace(/(union|select|insert|update|delete|drop|create|alter|exec|execute)/gi, '')
    .trim();
};

// ─── Validation helpers ───────────────────────────────────────────────────────

export const validateSchema = {
  email: (value: any): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  password: (value: any): boolean => {
    // At least 8 characters with uppercase, lowercase, digit, and special char
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(value);
  },

  name: (value: any): boolean => {
    const nameRegex = /^[a-zA-Z\s\-']{1,50}$/;
    return nameRegex.test(value);
  },

  phone: (value: any): boolean => {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(value);
  },

  uuid: (value: any): boolean => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },
};

// ─── Express middleware ───────────────────────────────────────────────────────

/**
 * Global XSS-prevention middleware.
 *
 * Sanitizes:
 *  • req.body   — JSON / urlencoded request bodies
 *  • req.query  — URL query string parameters
 *  • req.params — Route path parameters (e.g. /api/users/:id)
 *
 * All string values are stripped of HTML tags / attributes via DOMPurify
 * (isomorphic-dompurify runs on Node without a real DOM).
 *
 * Usage: app.use('/api', sanitizeInput);
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  if (req.query) {
    req.query = sanitizeObject(req.query) as typeof req.query;
  }

  if (req.params) {
    req.params = sanitizeObject(req.params) as typeof req.params;
  }

  next();
};

// ─── Validation middleware factory ────────────────────────────────────────────

/**
 * Validate request body fields against a simple schema.
 * Call after sanitizeInput so values are already clean.
 *
 * @example
 * router.post('/register', sanitizeInput, validateInput({
 *   email:    { type: 'email',    required: true },
 *   password: { type: 'password', required: true },
 *   name:     { type: 'name',     required: false },
 * }), registerHandler);
 */
export const validateInput = (
  schema: Record<string, { type: string; required?: boolean }>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value === undefined || value === null || value === '') {
        continue;
      }

      switch (rules.type) {
        case 'email':
          if (!validateSchema.email(value)) {
            errors.push(`${field} must be a valid email address`);
          }
          break;
        case 'password':
          if (!validateSchema.password(value)) {
            errors.push(
              `${field} must be at least 8 characters with uppercase, lowercase, number, and special character`,
            );
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
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    next();
  };
};
