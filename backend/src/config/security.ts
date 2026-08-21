/**
 * Enhanced Security Configuration
 * Production-grade security headers with comprehensive compliance support
 */

import helmet from 'helmet';
import cors, { CorsOptions } from 'cors';
import { Express } from 'express';
import crypto from 'crypto';
import { securityConfig } from '../security/SecurityConfig';

export const configureSecurity = (app: Express): void => {
  // Generate nonce for CSP
  app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  // 1. Set security HTTP headers with custom configuration
  if (securityConfig.compliance.strictHeaders) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            ...securityConfig.compliance.cspDirectives,
            'script-src': [
              ...(securityConfig.compliance.cspDirectives['script-src'] || ["'self'"]),
              "'unsafe-inline'",
              "'unsafe-eval'",
              "https://www.googletagmanager.com",
              "https://www.google-analytics.com",
              "https://cdn.jsdelivr.net",
              "https://unpkg.com",
              (req, res) => `'nonce-${res.locals.nonce}'`
            ],
            'style-src': [
              ...(securityConfig.compliance.cspDirectives['style-src'] || ["'self'"]),
              "'unsafe-inline'",
              "https://fonts.googleapis.com",
              "https://cdn.jsdelivr.net",
              "https://unpkg.com"
            ],
            'img-src': [
              ...(securityConfig.compliance.cspDirectives['img-src'] || ["'self'"]),
              "data:",
              "https:",
              "blob:"
            ],
            'font-src': [
              ...(securityConfig.compliance.cspDirectives['font-src'] || ["'self'"]),
              "https://fonts.gstatic.com",
              "https://cdn.jsdelivr.net",
              "data:"
            ],
            'connect-src': [
              ...(securityConfig.compliance.cspDirectives['connect-src'] || ["'self'"]),
              "https://www.google-analytics.com",
              "https://api.stellar.org",
              "https://horizon.stellar.org",
              process.env.API_URL || 'http://localhost:3000'
            ]
          },
        },
        hsts: {
          maxAge: securityConfig.compliance.hstsMaxAge,
          includeSubDomains: true,
          preload: true,
        },
        frameguard: {
          action: 'deny',
        },
        xssFilter: true,
        noSniff: true,
        referrerPolicy: {
          policy: 'strict-origin-when-cross-origin',
        },
        crossOriginEmbedderPolicy: false,
      })
    );
  } else {
    // Basic helmet configuration with nonce support
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "https://www.googletagmanager.com",
            "https://www.google-analytics.com",
            "https://cdn.jsdelivr.net",
            "https://unpkg.com",
            (req, res) => `'nonce-${res.locals.nonce}'`
          ],
          'style-src': [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
            "https://cdn.jsdelivr.net",
            "https://unpkg.com"
          ],
          'img-src': [
            "'self'",
            "data:",
            "https:",
            "blob:"
          ],
          'font-src': [
            "'self'",
            "https://fonts.gstatic.com",
            "https://cdn.jsdelivr.net",
            "data:"
          ],
          'connect-src': [
            "'self'",
            "https://www.google-analytics.com",
            "https://api.stellar.org",
            "https://horizon.stellar.org",
            process.env.API_URL || 'http://localhost:3000'
          ],
          'media-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': []
        }
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));
  }

  // 2. CORS configuration with dynamic origins
  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      const allowedOrigins = securityConfig.compliance.corsOrigins;
      
      // Check if origin is in allowed list or if wildcard is allowed
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // In development, allow all origins
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-mfa-code',
      'x-signature',
      'x-timestamp',
      'x-request-id',
      'Accept',
      'Accept-Language',
      'X-Requested-With'
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-RateLimit-Tier',
      'X-RateLimit-Burst',
      'X-Total-Count',
      'X-Page-Count'
    ],
    credentials: securityConfig.compliance.corsCredentials,
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 204,
  };

  app.use(cors(corsOptions));

  // 3. Trust proxy configuration (required for correct IP detection behind load balancers)
  if (securityConfig.compliance.trustProxy) {
    app.set('trust proxy', 1);
  }

  // 4. Add security headers manually for finer control
  app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // XSS Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // MIME sniffing protection
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
    );
    
    // Cross-Origin policies
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    
    // Cache control for sensitive data
    if (req.path.includes('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
    
    next();
  });

  console.log('✅ Enhanced security configuration applied with CSP nonce support');
};

export default configureSecurity;
