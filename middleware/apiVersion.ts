/**
 * API version detection and routing middleware.
 * Supports: path (/api/v1/...), header (X-API-Version, Accept), and query (?version=v1).
 */

import { Request, Response, NextFunction } from 'express';
import {
  apiVersioningConfig,
  getVersionLifecycle,
  isVersionSupported,
  getDeprecationHeaders,
} from '../config/api-versioning';

declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
      apiVersionFrom?: 'path' | 'header' | 'query' | 'default';
    }
  }
}

const VERSION_HEADER = 'x-api-version';
const ACCEPT_VERSION_PATTERN = /application\/vnd\.nepa\.(v\d+)\+json/;

/**
 * Parse version from request (path already set by express when route is /api/v1/...).
 * Use when mounting versioned routers so path is e.g. /api/v1/* and req.baseUrl is /api/v1.
 */
export function apiVersionFromPath(baseUrl: string): string | null {
  const match = baseUrl.match(/\/api\/(v\d+)/);
  return match ? match[1] : null;
}

/**
 * Detect requested API version from Accept header, X-API-Version, or query.
 * Does not read path; use when version is not in the path.
 */
export function detectVersionFromRequest(req: Request): string | null {
  const header = req.headers[VERSION_HEADER] as string | undefined;
  if (header) {
    const v = header.trim().toLowerCase();
    return v.startsWith('v') ? v : `v${v}`;
  }
  const accept = req.headers.accept;
  if (accept) {
    const m = accept.match(ACCEPT_VERSION_PATTERN);
    if (m) return m[1].toLowerCase();
  }
  const query = (req.query.version as string) || (req.query.api_version as string);
  if (query) {
    const v = String(query).trim().toLowerCase();
    return v.startsWith('v') ? v : `v${v}`;
  }
  return null;
}

/**
 * Middleware: set req.apiVersion to a fixed value (e.g. when mounted at /api/v1).
 * Use when mounting versioned routers: app.use('/api/v1', setApiVersion('v1'), v1Router).
 */
export function setApiVersion(version: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.apiVersion = version;
    req.apiVersionFrom = 'path';
    next();
  };
}

/**
 * Middleware: set req.apiVersion from path (/api/v1/...), header (X-API-Version, Accept), or query (?version=v1); default to config.defaultVersion.
 * Mount on /api so that path-based version is available (req.path is e.g. /v1/auth/login when request is /api/v1/auth/login).
 */
export function apiVersionMiddleware(req: Request, res: Response, next: NextFunction): void {
  let version: string | null = null;
  let from: Request['apiVersionFrom'] = 'default';

  const pathVersion = req.path.match(/^\/v(\d+)/)?.[0]?.replace('/', '');
  if (pathVersion) {
    version = pathVersion;
    from = 'path';
  }
  if (!version) {
    const detected = detectVersionFromRequest(req);
    if (detected) {
      version = detected;
      from = 'header';
    }
  }
  if (!version) {
    version = apiVersioningConfig.defaultVersion;
  }

  req.apiVersion = version;
  req.apiVersionFrom = from;

  if (!isVersionSupported(version)) {
    res.setHeader('X-API-Versions', apiVersioningConfig.supportedVersions.join(', '));
    res.status(406).json({
      error: 'Unsupported API version',
      code: 'UNSUPPORTED_VERSION',
      requestedVersion: version,
      supportedVersions: apiVersioningConfig.supportedVersions,
      defaultVersion: apiVersioningConfig.defaultVersion,
    });
    return;
  }

  const lifecycle = getVersionLifecycle(version);
  if (lifecycle && (lifecycle.status === 'deprecated' || lifecycle.status === 'sunset')) {
    const headers = getDeprecationHeaders(version);
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    res.setHeader('X-API-Version-Status', lifecycle.status);
  }

  next();
}

/**
 * Middleware: when request is to /api (no /v1 or /v2 in path) but req.apiVersion is set (e.g. by header),
 * rewrite URL so that the versioned router can handle it. Use after apiVersionMiddleware.
 * Example: GET /api/auth/login with X-API-Version: v1 -> internal rewrite to /api/v1/auth/login.
 */
export function rewriteUnversionedPathMiddleware(req: Request, res: Response, next: NextFunction): void {
  const pathVersion = req.path.match(/^\/v\d+/);
  if (pathVersion) {
    return next();
  }
  const version = req.apiVersion;
  if (version && (version === 'v1' || version === 'v2')) {
    (req as any).originalPath = req.path;
    req.url = `/${version}${req.path === '/' ? '' : req.path}`;
  }
  next();
}

/**
 * Middleware: record API version for analytics (version adoption tracking).
 * Logs version and source so usage can be aggregated; optional: set req.analytics.recordApiVersionUsage for custom tracking.
 */
export function versionUsageAnalyticsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const version = req.apiVersion;
  const source = req.apiVersionFrom;
  if (version) {
    try {
      if (typeof (req as any).analytics?.recordApiVersionUsage === 'function') {
        (req as any).analytics.recordApiVersionUsage(version, source);
      }
      // Log for analytics aggregation (e.g. log aggregation tools can count by api_version)
      if (typeof (req as any).log?.info === 'function') {
        (req as any).log.info('api_version_usage', { apiVersion: version, source });
      }
    } catch {
      // ignore
    }
  }
  next();
}
