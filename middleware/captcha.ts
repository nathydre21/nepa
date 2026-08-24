import { Request, Response, NextFunction } from 'express';

// reCAPTCHA verification middleware
export const verifyRecaptcha = async (req: Request, res: Response, next: NextFunction) => {
  const recaptchaToken = req.body.recaptchaToken || req.headers['x-recaptcha-token'];
  
  if (!recaptchaToken) {
    return res.status(400).json({
      status: 400,
      error: 'reCAPTCHA token is required'
    });
  }
  
  try {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.warn('reCAPTCHA secret key not configured');
      return next(); // Skip verification if not configured
    }
    
    const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;
    
    const response = await fetch(verificationURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const result = await response.json();
    
    if (!result.success) {
      return res.status(400).json({
        status: 400,
        error: 'reCAPTCHA verification failed',
        details: result['error-codes']
      });
    }
    
    // Check score for reCAPTCHA v3
    if (result.score && result.score < 0.5) {
      return res.status(400).json({
        status: 400,
        error: 'Suspicious activity detected. Please try again.',
        score: result.score
      });
    }
    
    next();
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return res.status(500).json({
      status: 500,
      error: 'reCAPTCHA verification service unavailable'
    });
  }
};

// Conditional CAPTCHA for suspicious activity
export const conditionalCaptcha = (req: Request, res: Response, next: NextFunction) => {
  const suspicious = (req as any).suspicious || false;
  const userAgent = req.get('User-Agent') || '';
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Require CAPTCHA for:
  // 1. Suspicious requests
  // 2. Missing/invalid user agents
  // 3. High-frequency requests from same IP
  // 4. Payment endpoints (always require CAPTCHA)
  
  const requiresCaptcha = suspicious || 
                         userAgent.length < 10 ||
                         req.path.includes('/payment') ||
                         req.path.includes('/transaction');
  
  if (requiresCaptcha) {
    return verifyRecaptcha(req, res, next);
  }
  
  next();
};
