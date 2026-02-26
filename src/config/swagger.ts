import swaggerJsdoc from 'swagger-jsdoc';

const baseDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Nepa API',
    version: '1.0.0',
    description: 'API documentation for Nepa Billing System. Use versioned paths (e.g. /api/v1, /api/v2) for stable integrations.',
  },
  servers: [
    { url: 'http://localhost:3000/api', description: 'Development (default v2)' },
    { url: 'http://localhost:3000/api/v1', description: 'API v1' },
    { url: 'http://localhost:3000/api/v2', description: 'API v2' },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
};

const options: swaggerJsdoc.Options = {
  definition: baseDefinition,
  // File paths only (glob can return dirs on some systems and cause EISDIR)
  apis: ['./app.ts', './routes/*.ts', './controllers/*.ts', './middleware/*.ts', './src/config/swagger.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

/** Build version-specific OpenAPI spec with correct server base path */
export function getVersionedSwaggerSpec(version: 'v1' | 'v2') {
  const def = {
    ...baseDefinition,
    info: { ...baseDefinition.info, version: version === 'v1' ? '1.0.0' : '2.0.0', title: `Nepa API ${version.toUpperCase()}` },
    servers: [{ url: `http://localhost:3000/api/${version}`, description: `API ${version}` }],
    components: baseDefinition.components,
  };
  return swaggerJsdoc({ definition: def, apis: options.apis });
}