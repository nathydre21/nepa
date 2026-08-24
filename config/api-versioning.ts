/**
 * API Versioning configuration and lifecycle.
 * Supports multi-version API with backward compatibility, deprecation, and sunset policies.
 */

export type VersionStatus = 'stable' | 'deprecated' | 'sunset';

export interface VersionLifecycle {
  version: string;
  status: VersionStatus;
  /** RFC 3339 date when this version was released */
  releasedAt: string;
  /** RFC 3339 date when deprecation was announced (if status is deprecated or sunset) */
  deprecatedAt?: string;
  /** RFC 3339 date after which the version will be removed (sunset) */
  sunsetAt?: string;
  /** URL to migration guide or changelog */
  migrationGuideUrl?: string;
  /** Human-readable deprecation message */
  deprecationMessage?: string;
}

export interface ApiVersioningConfig {
  /** Currently supported API versions (e.g. ['v1', 'v2']) */
  supportedVersions: string[];
  /** Default version when client does not specify one */
  defaultVersion: string;
  /** Latest version (used for /api without version prefix) */
  latestVersion: string;
  /** Version lifecycle and deprecation metadata */
  lifecycle: Record<string, VersionLifecycle>;
  /** Base URL for versioned docs (e.g. https://docs.nepa.example.com/api) */
  docsBaseUrl?: string;
}

const LIFECYCLE: Record<string, VersionLifecycle> = {
  v1: {
    version: 'v1',
    status: 'stable',
    releasedAt: '2024-01-01T00:00:00Z',
    migrationGuideUrl: '/docs/api-versioning#migrating-v1-to-v2',
  },
  v2: {
    version: 'v2',
    status: 'stable',
    releasedAt: '2024-06-01T00:00:00Z',
    migrationGuideUrl: '/docs/api-versioning',
  },
};

export const apiVersioningConfig: ApiVersioningConfig = {
  supportedVersions: ['v1', 'v2'],
  defaultVersion: 'v2',
  latestVersion: 'v2',
  lifecycle: LIFECYCLE,
  docsBaseUrl: process.env.API_DOCS_BASE_URL || '/api/docs',
};

/**
 * Get lifecycle for a version. Returns undefined if version is unknown.
 */
export function getVersionLifecycle(version: string): VersionLifecycle | undefined {
  const normalized = version.startsWith('v') ? version : `v${version}`;
  return apiVersioningConfig.lifecycle[normalized];
}

/**
 * Check if a version is supported (exists and not sunset).
 */
export function isVersionSupported(version: string): boolean {
  const normalized = version.startsWith('v') ? version : `v${version}`;
  if (!apiVersioningConfig.supportedVersions.includes(normalized)) return false;
  const lifecycle = getVersionLifecycle(normalized);
  return lifecycle ? lifecycle.status !== 'sunset' : false;
}

/**
 * Get HTTP headers for deprecation/sunset (RFC 8594-style).
 */
export function getDeprecationHeaders(version: string): Record<string, string> {
  const lifecycle = getVersionLifecycle(version);
  if (!lifecycle || lifecycle.status === 'stable') return {};

  const headers: Record<string, string> = {};
  if (lifecycle.status === 'deprecated' || lifecycle.status === 'sunset') {
    headers['Deprecation'] = 'true';
    if (lifecycle.sunsetAt) {
      headers['Sunset'] = lifecycle.sunsetAt;
    }
    if (lifecycle.migrationGuideUrl) {
      headers['Link'] = `<${lifecycle.migrationGuideUrl}>; rel="deprecation"; type="text/html"`;
    }
  }
  return headers;
}
