/**
 * Security tests verifying common XSS payloads are stripped by the sanitizeInput
 * middleware across body, query, and route parameters.
 */

import { Request, Response, NextFunction } from 'express';
import { sanitizeInput } from '../../middleware/inputSanitization';

const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">click</a>',
  '<svg onload=alert(1)>',
  '<body onload=alert(1)>',
  '"><script>alert(String.fromCharCode(88,83,83))</script>',
  '<iframe src="javascript:alert(1)">',
  '<input onfocus=alert(1) autofocus>',
  '<marquee onstart=alert(1)>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
];

const mockReq = (overrides: Partial<Request> = {}): Request =>
  ({
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request);

const mockNext = (): NextFunction => jest.fn();

describe('XSS Sanitization Security Tests', () => {
  describe('Request body sanitization', () => {
    it.each(XSS_PAYLOADS)('strips XSS payload from body field: %s', (payload) => {
      const req = mockReq({ body: { comment: payload, name: 'Alice' } });
      const next = mockNext();

      sanitizeInput(req as Request, {} as Response, next);

      expect(req.body.comment).not.toMatch(/<script|onerror|onload|javascript:/i);
      expect(req.body.name).toBe('Alice');
      expect(next).toHaveBeenCalled();
    });

    it('sanitizes nested object fields in request body', () => {
      const req = mockReq({
        body: { user: { bio: '<script>alert(1)</script>', displayName: 'Bob' } },
      });
      const next = mockNext();

      sanitizeInput(req as Request, {} as Response, next);

      expect(req.body.user.bio).toBe('');
      expect(req.body.user.displayName).toBe('Bob');
    });

    it('sanitizes array values in request body', () => {
      const req = mockReq({
        body: { tags: ['safe', '<img onerror=alert(1)>', 'also-safe'] },
      });
      const next = mockNext();

      sanitizeInput(req as Request, {} as Response, next);

      expect(req.body.tags[0]).toBe('safe');
      expect(req.body.tags[1]).not.toMatch(/onerror/i);
      expect(req.body.tags[2]).toBe('also-safe');
    });
  });

  describe('Query parameter sanitization', () => {
    it.each(XSS_PAYLOADS)('strips XSS payload from query param: %s', (payload) => {
      const req = mockReq({ query: { search: payload } });
      const next = mockNext();

      sanitizeInput(req as Request, {} as Response, next);

      expect(String(req.query.search)).not.toMatch(/<script|onerror|onload|javascript:/i);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Route parameter sanitization', () => {
    it('strips XSS payload from route params', () => {
      const req = mockReq({ params: { id: '<script>alert(1)</script>' } });
      const next = mockNext();

      sanitizeInput(req as Request, {} as Response, next);

      expect(req.params.id).not.toMatch(/<script/i);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Legitimate content preservation', () => {
    it('preserves plain-text user content', () => {
      const req = mockReq({
        body: {
          name: "O'Brien",
          email: 'user@example.com',
          message: 'Hello, World! 123',
        },
      });
      const next = mockNext();

      sanitizeInput(req as Request, {} as Response, next);

      expect(req.body).toEqual({
        name: "O'Brien",
        email: 'user@example.com',
        message: 'Hello, World! 123',
      });
    });
  });
});
