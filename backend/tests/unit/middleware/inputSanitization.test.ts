/**
 * Unit tests for backend/middleware/inputSanitization.ts
 *
 * Verifies that all sanitization helpers and the Express middleware correctly
 * strip XSS payloads while preserving legitimate user content.
 */

import { Request, Response, NextFunction } from 'express';
import {
  sanitizeString,
  sanitizeEmail,
  sanitizePhoneNumber,
  sanitizeUrl,
  sanitizeNumber,
  sanitizeObject,
  sanitizeHTML,
  sanitizeQuery,
  sanitizeInput,
  validateInput,
} from '../../../middleware/inputSanitization';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockReq = (overrides: Partial<Request> = {}): Request =>
  ({
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request);

const mockRes = (): Response => ({} as Response);

const mockNext = (): NextFunction => jest.fn();

// ─── sanitizeString ───────────────────────────────────────────────────────────

describe('sanitizeString', () => {
  it('returns an empty string for non-string input', () => {
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(undefined)).toBe('');
    expect(sanitizeString(42)).toBe('');
    expect(sanitizeString({})).toBe('');
  });

  it('strips <script> tags (basic XSS)', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe('');
  });

  it('strips inline event handlers', () => {
    expect(sanitizeString('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('strips javascript: protocol in anchor tags', () => {
    const result = sanitizeString('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('strips SVG-based XSS payload', () => {
    expect(sanitizeString('<svg onload=alert(1)>')).toBe('');
  });

  it('strips HTML comments containing scripts', () => {
    const result = sanitizeString('<!--<script>alert(1)</script>-->');
    expect(result).not.toContain('<script>');
  });

  it('strips encoded XSS (&lt;script&gt;)', () => {
    // DOMPurify decodes entities then sanitises — output should be safe plain text
    const result = sanitizeString('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('preserves clean plain-text', () => {
    expect(sanitizeString('Hello, World!')).toBe('Hello, World!');
  });

  it('preserves numbers represented as strings', () => {
    expect(sanitizeString('12345')).toBe('12345');
  });
});

// ─── sanitizeEmail ────────────────────────────────────────────────────────────

describe('sanitizeEmail', () => {
  it('accepts a valid email address', () => {
    expect(sanitizeEmail('user@example.com')).toBe('user@example.com');
  });

  it('lowercases valid email addresses', () => {
    expect(sanitizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('rejects an email containing a script tag', () => {
    expect(sanitizeEmail('<script>alert(1)</script>@evil.com')).toBe('');
  });

  it('rejects a malformed email', () => {
    expect(sanitizeEmail('not-an-email')).toBe('');
  });

  it('rejects an empty string', () => {
    expect(sanitizeEmail('')).toBe('');
  });
});

// ─── sanitizePhoneNumber ──────────────────────────────────────────────────────

describe('sanitizePhoneNumber', () => {
  it('preserves a valid international phone number', () => {
    expect(sanitizePhoneNumber('+1 (555) 123-4567')).toBe('+1 (555) 123-4567');
  });

  it('removes XSS characters from phone input', () => {
    const result = sanitizePhoneNumber('+1<script>alert(1)</script>5555555');
    expect(result).not.toContain('<script>');
  });

  it('removes letters from phone numbers', () => {
    expect(sanitizePhoneNumber('abc123')).toBe('123');
  });
});

// ─── sanitizeUrl ─────────────────────────────────────────────────────────────

describe('sanitizeUrl', () => {
  it('allows a valid https URL', () => {
    expect(sanitizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('allows a valid http URL', () => {
    expect(sanitizeUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rejects a javascript: URL', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('rejects a data: URL', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('rejects a malformed URL', () => {
    expect(sanitizeUrl('not a url')).toBe('');
  });

  it('rejects a ftp: URL', () => {
    expect(sanitizeUrl('ftp://files.example.com/file.txt')).toBe('');
  });
});

// ─── sanitizeNumber ───────────────────────────────────────────────────────────

describe('sanitizeNumber', () => {
  it('converts a numeric string to a number', () => {
    expect(sanitizeNumber('42')).toBe(42);
  });

  it('returns 0 for NaN input', () => {
    expect(sanitizeNumber('abc')).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(sanitizeNumber(null)).toBe(0);
  });

  it('passes through a valid number', () => {
    expect(sanitizeNumber(3.14)).toBe(3.14);
  });
});

// ─── sanitizeObject ───────────────────────────────────────────────────────────

describe('sanitizeObject', () => {
  it('sanitizes string values inside an object', () => {
    const input = { name: '<script>alert(1)</script>', age: 25 };
    const result = sanitizeObject(input);
    expect(result.name).toBe('');
    expect(result.age).toBe(25);
  });

  it('recursively sanitizes nested objects', () => {
    const input = { user: { bio: '<img onerror=alert(1)>' } };
    const result = sanitizeObject(input);
    expect(result.user.bio).toBe('');
  });

  it('sanitizes arrays of strings', () => {
    const input = ['safe text', '<script>bad</script>'];
    const result = sanitizeObject(input);
    expect(result[0]).toBe('safe text');
    expect(result[1]).toBe('');
  });

  it('leaves numbers and booleans untouched', () => {
    const input = { count: 5, active: true };
    const result = sanitizeObject(input);
    expect(result.count).toBe(5);
    expect(result.active).toBe(true);
  });
});

// ─── sanitizeHTML ─────────────────────────────────────────────────────────────

describe('sanitizeHTML', () => {
  it('preserves allowed tags', () => {
    const input = '<p>Hello <strong>World</strong></p>';
    expect(sanitizeHTML(input)).toContain('<strong>World</strong>');
  });

  it('strips disallowed tags like <script>', () => {
    expect(sanitizeHTML('<script>alert(1)</script>')).toBe('');
  });

  it('strips event handler attributes', () => {
    const result = sanitizeHTML('<p onclick="alert(1)">click</p>');
    expect(result).not.toContain('onclick');
  });

  it('strips <iframe> tags', () => {
    const result = sanitizeHTML('<iframe src="evil.html"></iframe>');
    expect(result).not.toContain('iframe');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeHTML(null as any)).toBe('');
  });
});

// ─── sanitizeQuery ────────────────────────────────────────────────────────────

describe('sanitizeQuery', () => {
  it('removes SQL keywords', () => {
    const result = sanitizeQuery('SELECT * FROM users');
    expect(result.toLowerCase()).not.toContain('select');
  });

  it('removes single quotes used in SQL injection', () => {
    const result = sanitizeQuery("'; DROP TABLE users; --");
    expect(result).not.toContain("'");
  });

  it('preserves a safe search term', () => {
    expect(sanitizeQuery('john doe')).toBe('john doe');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeQuery(null as any)).toBe('');
  });
});

// ─── sanitizeInput middleware ─────────────────────────────────────────────────

describe('sanitizeInput middleware', () => {
  it('sanitizes req.body strings', () => {
    const req = mockReq({ body: { comment: '<script>alert(1)</script>' } });
    const next = mockNext();

    sanitizeInput(req as Request, mockRes(), next);

    expect(req.body.comment).toBe('');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sanitizes req.query strings', () => {
    const req = mockReq({ query: { search: '<img onerror=alert(1)>' } });
    const next = mockNext();

    sanitizeInput(req as Request, mockRes(), next);

    expect(req.query.search).toBe('');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sanitizes req.params strings', () => {
    const req = mockReq({ params: { id: '<svg onload=alert(1)>' } });
    const next = mockNext();

    sanitizeInput(req as Request, mockRes(), next);

    expect(req.params.id).toBe('');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('preserves clean body values', () => {
    const req = mockReq({ body: { name: 'Alice', age: 30 } });
    const next = mockNext();

    sanitizeInput(req as Request, mockRes(), next);

    expect(req.body.name).toBe('Alice');
    expect(req.body.age).toBe(30);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles null / undefined body gracefully', () => {
    const req = mockReq({ body: null });
    const next = mockNext();

    expect(() => sanitizeInput(req as Request, mockRes(), next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sanitizes nested body objects recursively', () => {
    const req = mockReq({
      body: { user: { bio: '<script>bad</script>' } },
    });
    const next = mockNext();

    sanitizeInput(req as Request, mockRes(), next);

    expect(req.body.user.bio).toBe('');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ─── validateInput middleware factory ────────────────────────────────────────

describe('validateInput middleware', () => {
  const buildMockRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  it('calls next() when all required fields are present and valid', () => {
    const req = mockReq({ body: { email: 'user@example.com' } });
    const res = buildMockRes();
    const next = mockNext();

    validateInput({ email: { type: 'email', required: true } })(req as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when a required field is missing', () => {
    const req = mockReq({ body: {} });
    const res = buildMockRes();
    const next = mockNext();

    validateInput({ email: { type: 'email', required: true } })(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 with details when an email format is invalid', () => {
    const req = mockReq({ body: { email: 'not-valid' } });
    const res = buildMockRes();
    const next = mockNext();

    validateInput({ email: { type: 'email', required: true } })(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Validation failed' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('skips validation for optional absent fields', () => {
    const req = mockReq({ body: {} });
    const res = buildMockRes();
    const next = mockNext();

    validateInput({ phone: { type: 'phone', required: false } })(req as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
