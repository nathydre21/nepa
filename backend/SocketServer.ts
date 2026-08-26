/**
 * SocketServer — centralised Socket.IO integration for the Express application.
 *
 * Responsibilities:
 *  - Attach a single Socket.IO server to the shared HTTP server
 *  - Authenticate every connection via JWT before the handshake completes
 *  - Manage room-based communication (user, admin, analytics, notifications)
 *  - Enforce per-user connection limits
 *  - Clean up stale / inactive connections automatically
 *  - Expose typed helpers so other services can emit events without
 *    importing socket.io directly
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AuthenticationService } from './services/AuthenticationService';

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

/** Socket extended with the decoded JWT payload. */
export interface AuthSocket extends Socket {
  user?: AuthenticatedUser;
}

interface ConnectionInfo {
  socket: AuthSocket;
  connectedAt: Date;
  lastActivity: Date;
  rooms: Set<string>;
}

/** Well-known room names used across the application. */
export const ROOMS = {
  /** Private room for a single user: `user_<userId>` */
  user: (userId: string) => `user_${userId}`,
  /** Shared room for all admin users */
  admins: 'room_admins',
  /** Shared room for real-time analytics subscribers */
  analytics: 'room_analytics',
  /** Shared room for system-wide broadcast notifications */
  notifications: 'room_notifications',
} as const;

/** JWT payload shapes supported by socket authentication. */
interface SocketJwtPayload {
  userId?: string;
  id?: string;
  email?: string;
  role?: string;
  sessionId?: string;
}

/** Canonical event names emitted by the server. */
export const SERVER_EVENTS = {
  NOTIFICATION: 'notification',
  BROADCAST: 'broadcast',
  ANALYTICS_UPDATE: 'analytics_update',
  PONG: 'pong',
  FORCE_DISCONNECT: 'force_disconnect',
  ERROR: 'error',
  ROOM_JOINED: 'room_joined',
  ROOM_LEFT: 'room_left',
  CONNECTION_STATS: 'connection_stats',
} as const;

/** Canonical event names emitted by the client. */
export const CLIENT_EVENTS = {
  PING: 'ping',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SUBSCRIBE_ANALYTICS: 'subscribe_analytics',
  UNSUBSCRIBE_ANALYTICS: 'unsubscribe_analytics',
  MARK_NOTIFICATION_READ: 'mark_notification_read',
  MARK_ALL_NOTIFICATIONS_READ: 'mark_all_notifications_read',
} as const;

// ─── SocketServer ─────────────────────────────────────────────────────────────

export class SocketServer {
  private static instance: SocketServer;

  private io: Server;
  private connections: Map<string, ConnectionInfo> = new Map();
  /** userId → Set of socketIds */
  private userSockets: Map<string, Set<string>> = new Map();

  private readonly MAX_CONNECTIONS_PER_USER = 5;
  /** Disconnect sockets that have been idle for 30 minutes. */
  private readonly CONNECTION_TIMEOUT_MS = 30 * 60 * 1000;
  /** Run the cleanup sweep every 5 minutes. */
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  private cleanupTimer?: NodeJS.Timeout;

  // ─── Singleton lifecycle ───────────────────────────────────────────────────

  private constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60_000,
      pingInterval: 25_000,
      transports: ['websocket', 'polling'],
      maxHttpBufferSize: 1e6, // 1 MB — prevents oversized payloads
    });

    this.setupAuthMiddleware();
    this.setupConnectionHandlers();
    this.startCleanupInterval();
  }

  /**
   * Initialise (or return) the singleton.
   * Must be called with `httpServer` the first time.
   */
  public static getInstance(httpServer?: HttpServer): SocketServer {
    if (!SocketServer.instance) {
      if (!httpServer) {
        throw new Error(
          'SocketServer has not been initialised yet. ' +
          'Call SocketServer.getInstance(httpServer) with an HTTP server first.'
        );
      }
      SocketServer.instance = new SocketServer(httpServer);
    }
    return SocketServer.instance;
  }

  /**
   * Reset the singleton instance. Intended for test isolation only.
   */
  public static resetForTesting(): void {
    if (SocketServer.instance) {
      SocketServer.instance.shutdown();
      delete (SocketServer as { instance?: SocketServer }).instance;
    }
  }

  /**
   * Return the raw Socket.IO `Server` instance.
   * Throws if `getInstance(httpServer)` has not been called yet.
   */
  public static getIO(): Server {
    if (!SocketServer.instance) {
      throw new Error(
        'SocketServer not initialised. Call SocketServer.getInstance(httpServer) first.'
      );
    }
    return SocketServer.instance.io;
  }

  // ─── Authentication middleware ─────────────────────────────────────────────

  private setupAuthMiddleware(): void {
    this.io.use(async (socket: AuthSocket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Authentication error: no token provided'));
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('[SocketServer] JWT_SECRET environment variable is not set');
        return next(new Error('Server configuration error'));
      }

      try {
        const user = await this.authenticateToken(token, secret);
        if (!user) {
          return next(new Error('Authentication error: invalid token'));
        }
        socket.user = user;
        next();
      } catch (err) {
        const message =
          err instanceof jwt.TokenExpiredError
            ? 'Authentication error: token expired'
            : 'Authentication error: invalid token';
        next(new Error(message));
      }
    });
  }

  /**
   * Resolve the authenticated user from a JWT.
   * Supports production session tokens, legacy id/email/role payloads, and test tokens.
   */
  private async authenticateToken(
    token: string,
    secret: string
  ): Promise<AuthenticatedUser | null> {
    const decoded = jwt.verify(token, secret) as SocketJwtPayload & jwt.JwtPayload;
    const userId = decoded.userId ?? decoded.id;

    if (!userId) {
      return null;
    }

    // Production path: validate active session when sessionId is present
    if (decoded.sessionId) {
      const authService = new AuthenticationService();
      const result = await authService.verifyToken(token);
      if (result.user) {
        return {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
        };
      }
      return null;
    }

    // Test / legacy tokens that include email and role directly in the JWT
    if (decoded.email && decoded.role) {
      return {
        id: userId,
        email: decoded.email,
        role: decoded.role,
      };
    }

    // Fallback: load user profile from the database
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  // ─── Connection handlers ───────────────────────────────────────────────────

  private setupConnectionHandlers(): void {
    this.io.on('connection', (socket: AuthSocket) => {
      // The auth middleware guarantees socket.user is set, but guard anyway
      if (!socket.user?.id) {
        socket.emit(SERVER_EVENTS.ERROR, { message: 'Unauthenticated connection rejected' });
        socket.disconnect(true);
        return;
      }

      // Enforce per-user connection cap
      const existingSockets = this.userSockets.get(socket.user.id) ?? new Set<string>();
      if (existingSockets.size >= this.MAX_CONNECTIONS_PER_USER) {
        console.warn(
          `[SocketServer] User ${socket.user.id} exceeded connection limit ` +
          `(${this.MAX_CONNECTIONS_PER_USER})`
        );
        socket.emit(SERVER_EVENTS.ERROR, {
          message: `Connection limit reached (max ${this.MAX_CONNECTIONS_PER_USER})`,
        });
        socket.disconnect(true);
        return;
      }

      // Register connection
      const info: ConnectionInfo = {
        socket,
        connectedAt: new Date(),
        lastActivity: new Date(),
        rooms: new Set(),
      };
      this.connections.set(socket.id, info);

      if (!this.userSockets.has(socket.user.id)) {
        this.userSockets.set(socket.user.id, new Set());
      }
      this.userSockets.get(socket.user.id)!.add(socket.id);

      console.log(
        `[SocketServer] Connected: user=${socket.user.id} socket=${socket.id} ` +
        `total=${this.connections.size}`
      );

      // Auto-join the user's private room
      this.joinRoom(socket, info, ROOMS.user(socket.user.id));

      // Auto-join the notifications room for system-wide alerts
      this.joinRoom(socket, info, ROOMS.notifications);

      // Auto-join the admin room for privileged users
      if (socket.user.role === 'ADMIN' || socket.user.role === 'SUPER_ADMIN') {
        this.joinRoom(socket, info, ROOMS.admins);
      }

      // ── Client-initiated events ──────────────────────────────────────────

      socket.on(CLIENT_EVENTS.PING, () => {
        info.lastActivity = new Date();
        socket.emit(SERVER_EVENTS.PONG, { timestamp: Date.now() });
      });

      socket.on(CLIENT_EVENTS.JOIN_ROOM, (roomName: string) => {
        if (!this.isRoomAllowed(socket, roomName)) {
          socket.emit(SERVER_EVENTS.ERROR, {
            message: `Not authorised to join room: ${roomName}`,
          });
          return;
        }
        this.joinRoom(socket, info, roomName);
      });

      socket.on(CLIENT_EVENTS.LEAVE_ROOM, (roomName: string) => {
        // Users may not leave their own private room
        if (roomName === ROOMS.user(socket.user!.id)) return;
        this.leaveRoom(socket, info, roomName);
      });

      socket.on(CLIENT_EVENTS.SUBSCRIBE_ANALYTICS, () => {
        if (socket.user?.role === 'ADMIN' || socket.user?.role === 'SUPER_ADMIN') {
          this.joinRoom(socket, info, ROOMS.analytics);
        } else {
          socket.emit(SERVER_EVENTS.ERROR, {
            message: 'Analytics subscription requires admin role',
          });
        }
      });

      socket.on(CLIENT_EVENTS.UNSUBSCRIBE_ANALYTICS, () => {
        this.leaveRoom(socket, info, ROOMS.analytics);
      });

      // Track activity on every event so the cleanup timer stays accurate
      socket.onAny(() => {
        info.lastActivity = new Date();
      });

      // ── Disconnect / error ───────────────────────────────────────────────

      socket.on('disconnect', (reason: string) => {
        this.handleDisconnect(socket, reason);
      });

      socket.on('error', (error: Error) => {
        console.error(`[SocketServer] Socket error user=${socket.user?.id}:`, error.message);
        this.handleDisconnect(socket, 'socket_error');
      });
    });
  }

  // ─── Room helpers ──────────────────────────────────────────────────────────

  /**
   * Determine whether a socket is allowed to join a given room.
   * - Users can always join their own private room.
   * - The admin and analytics rooms require ADMIN / SUPER_ADMIN role.
   * - The notifications room is open to all authenticated users.
   * - Any other room name is rejected.
   */
  private isRoomAllowed(socket: AuthSocket, roomName: string): boolean {
    if (roomName === ROOMS.user(socket.user!.id)) return true;
    if (roomName === ROOMS.notifications) return true;
    if (
      roomName === ROOMS.admins ||
      roomName === ROOMS.analytics
    ) {
      return socket.user?.role === 'ADMIN' || socket.user?.role === 'SUPER_ADMIN';
    }
    return false;
  }

  private joinRoom(socket: AuthSocket, info: ConnectionInfo, roomName: string): void {
    socket.join(roomName);
    info.rooms.add(roomName);
    socket.emit(SERVER_EVENTS.ROOM_JOINED, { room: roomName });
    console.log(`[SocketServer] user=${socket.user?.id} joined room=${roomName}`);
  }

  private leaveRoom(socket: AuthSocket, info: ConnectionInfo, roomName: string): void {
    socket.leave(roomName);
    info.rooms.delete(roomName);
    socket.emit(SERVER_EVENTS.ROOM_LEFT, { room: roomName });
    console.log(`[SocketServer] user=${socket.user?.id} left room=${roomName}`);
  }

  // ─── Disconnect handling ───────────────────────────────────────────────────

  private handleDisconnect(socket: AuthSocket, reason: string): void {
    const info = this.connections.get(socket.id);
    if (!info) return;

    // Leave all rooms cleanly
    info.rooms.forEach((room) => socket.leave(room));

    this.connections.delete(socket.id);

    if (socket.user?.id) {
      const userSet = this.userSockets.get(socket.user.id);
      if (userSet) {
        userSet.delete(socket.id);
        if (userSet.size === 0) {
          this.userSockets.delete(socket.user.id);
        }
      }
    }

    console.log(
      `[SocketServer] Disconnected: user=${socket.user?.id} reason=${reason} ` +
      `remaining=${this.connections.size}`
    );
  }

  // ─── Inactive-connection cleanup ──────────────────────────────────────────

  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const stale: string[] = [];

      this.connections.forEach((info, socketId) => {
        if (now - info.lastActivity.getTime() > this.CONNECTION_TIMEOUT_MS) {
          stale.push(socketId);
        }
      });

      stale.forEach((socketId) => {
        const info = this.connections.get(socketId);
        if (info) {
          console.log(
            `[SocketServer] Evicting idle socket: user=${info.socket.user?.id} ` +
            `socket=${socketId}`
          );
          info.socket.emit(SERVER_EVENTS.FORCE_DISCONNECT, { reason: 'idle_timeout' });
          info.socket.disconnect(true);
        }
      });

      if (stale.length > 0) {
        console.log(`[SocketServer] Cleanup: evicted ${stale.length} idle connection(s)`);
      }
    }, this.CLEANUP_INTERVAL_MS);

    // Don't keep the process alive just for cleanup
    this.cleanupTimer.unref?.();
  }

  // ─── Public emit helpers ───────────────────────────────────────────────────

  /**
   * Send an event to all sockets belonging to a specific user.
   */
  public emitToUser(userId: string, event: string, data: unknown): void {
    this.io.to(ROOMS.user(userId)).emit(event, data);
  }

  /**
   * Send a notification payload to a specific user.
   */
  public sendNotification(
    userId: string,
    payload: { type: string; title: string; message: string; data?: unknown }
  ): void {
    this.emitToUser(userId, SERVER_EVENTS.NOTIFICATION, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast an event to all connected sockets (all authenticated users).
   */
  public broadcast(event: string, data: unknown): void {
    this.io.emit(event, data);
  }

  /**
   * Emit an event to every socket in a named room.
   */
  public emitToRoom(room: string, event: string, data: unknown): void {
    this.io.to(room).emit(event, data);
  }

  /**
   * Push a real-time analytics update to all admin subscribers.
   */
  public emitAnalyticsUpdate(metrics: unknown): void {
    this.io.to(ROOMS.analytics).emit(SERVER_EVENTS.ANALYTICS_UPDATE, {
      metrics,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Monitoring & management ───────────────────────────────────────────────

  public getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      uniqueUsers: this.userSockets.size,
      connectionsPerUser: Array.from(this.userSockets.entries()).map(
        ([userId, sockets]) => ({ userId, count: sockets.size })
      ),
    };
  }

  /**
   * Force-disconnect all sockets for a given user (e.g. after account suspension).
   */
  public disconnectUser(userId: string, reason = 'admin_action'): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;

    sockets.forEach((socketId) => {
      const info = this.connections.get(socketId);
      if (info) {
        info.socket.emit(SERVER_EVENTS.FORCE_DISCONNECT, { reason });
        info.socket.disconnect(true);
      }
    });
  }

  /**
   * Check whether a user has at least one active connection.
   */
  public isUserOnline(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  // ─── Graceful shutdown ─────────────────────────────────────────────────────

  public shutdown(): void {
    console.log('[SocketServer] Shutting down…');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.connections.forEach((info) => {
      info.socket.emit(SERVER_EVENTS.FORCE_DISCONNECT, { reason: 'server_shutdown' });
      info.socket.disconnect(true);
    });

    this.connections.clear();
    this.userSockets.clear();
    this.io.close();

    console.log('[SocketServer] Shutdown complete');
  }
}
