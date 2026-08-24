/**
 * server.ts — application entry point.
 *
 * Creates the HTTP server, attaches the Express app, initialises the
 * SocketServer singleton, and starts listening.  All other modules that need
 * real-time capabilities should call `SocketServer.getIO()` or use the typed
 * helpers on the `SocketServer` instance — they must never create their own
 * `socket.io` Server instances.
 */

import http from 'http';
import app from './app';
import { SocketServer } from './SocketServer';
import { RealTimeNotificationService } from './services/NotificationService';
import RealTimeAnalyticsService from './services/RealTimeAnalyticsService';
import { MemoryMonitor } from './MemoryMonitor';
import { logger } from './middleware/logger';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── HTTP server ──────────────────────────────────────────────────────────────

const httpServer = http.createServer(app);

// ─── WebSocket server ─────────────────────────────────────────────────────────

// Initialise the singleton.  Every other module that calls
// SocketServer.getInstance() or SocketServer.getIO() after this point will
// receive the same instance.
const socketServer = SocketServer.getInstance(httpServer);

// Wire up application-level WebSocket services.
// These register their own event handlers on top of the shared io instance.
const notificationService = RealTimeNotificationService.getInstance();
notificationService.initialize();

const analyticsService = new RealTimeAnalyticsService();
analyticsService.initialize();

// Initialize Memory Monitor
const memoryMonitor = MemoryMonitor.getInstance();
logger.info('🧠 Memory monitoring system initialized');

// Expose connection stats on the health endpoint by patching the app's
// /health handler is not practical here, so we attach a dedicated endpoint.
app.get('/api/monitoring/websocket', (_req: any, res: any) => {
  res.json({
    status: 'ok',
    ...socketServer.getConnectionStats(),
    timestamp: new Date().toISOString(),
  });
});

// ─── Start listening ──────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  logger.info(`🚀 HTTP server listening on port ${PORT}`);
  logger.info(`🔌 WebSocket server ready on ws://localhost:${PORT}`);
  logger.info(`📚 API docs available at http://localhost:${PORT}/api-docs`);
  logger.info(`💚 Health check at http://localhost:${PORT}/health`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info(`[server] Received ${signal} — shutting down gracefully…`);

  // Stop accepting new connections
  httpServer.close((err) => {
    if (err) {
      logger.error('[server] Error closing HTTP server:', err);
      process.exit(1);
    }
    logger.info('[server] HTTP server closed');
  });

  // Disconnect all WebSocket clients cleanly
  socketServer.shutdown();
  analyticsService.stopBroadcast();

// Shutdown Memory Monitor
  memoryMonitor.shutdown();
  logger.info('[server] Memory monitor shutdown');

  // Give in-flight requests 10 s to complete before forcing exit
  setTimeout(() => {
    logger.warn('[server] Forcing exit after timeout');
    process.exit(0);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { httpServer, socketServer };
