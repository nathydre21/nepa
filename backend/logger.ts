// Barrel re-export for logger
// Controllers import from '../logger' which resolves here.
export { logger, default, requestLogger, correlationIdMiddleware, LogLevel } from './services/logger';
