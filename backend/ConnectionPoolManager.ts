import { Server } from 'socket.io';
// import type { Socket } from 'socket.io';

interface ConnectionPoolConfig {
  maxConnections: number;
  maxConnectionsPerUser: number;
  connectionTimeout: number;
  cleanupInterval: number;
}

interface PooledConnection {
  socket: any;
  userId: string;
  connectedAt: Date;
  lastActivity: Date;
  isAlive: boolean;
}

export class ConnectionPoolManager {
  private static instance: ConnectionPoolManager;
  private connections: Map<string, PooledConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private config: ConnectionPoolConfig;
  private cleanupTimer?: NodeJS.Timeout;

  private constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = {
      maxConnections: config.maxConnections || 1000,
      maxConnectionsPerUser: config.maxConnectionsPerUser || 5,
      connectionTimeout: config.connectionTimeout || 30 * 60 * 1000, // 30 minutes
      cleanupInterval: config.cleanupInterval || 5 * 60 * 1000 // 5 minutes
    };

    this.startCleanupTimer();
  }

  public static getInstance(config?: Partial<ConnectionPoolConfig>): ConnectionPoolManager {
    if (!ConnectionPoolManager.instance) {
      ConnectionPoolManager.instance = new ConnectionPoolManager(config);
    }
    return ConnectionPoolManager.instance;
  }

  public addConnection(socket: any, userId: string): boolean {
    // Check global connection limit
    if (this.connections.size >= this.config.maxConnections) {
      console.warn('⚠️ Maximum global connections reached');
      return false;
    }

    // Check per-user connection limit
    const userConns = this.userConnections.get(userId) || new Set();
    if (userConns.size >= this.config.maxConnectionsPerUser) {
      console.warn(`⚠️ User ${userId} exceeded connection limit`);
      return false;
    }

    // Create pooled connection
    const pooledConnection: PooledConnection = {
      socket,
      userId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      isAlive: true
    };

    // Add to pools
    this.connections.set(socket.id, pooledConnection);
    
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socket.id);

    // Set up activity monitoring
    this.setupActivityMonitoring(socket, pooledConnection);

    console.log(`🔌 Connection added: ${userId} (${socket.id}) - Pool size: ${this.connections.size}`);
    return true;
  }

  public removeConnection(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (!connection) return;

    const { userId, socket } = connection;

    // Remove from user connections
    const userConns = this.userConnections.get(userId);
    if (userConns) {
      userConns.delete(socketId);
      if (userConns.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    // Remove from main pool
    this.connections.delete(socketId);

    console.log(`❌ Connection removed: ${userId} (${socketId}) - Pool size: ${this.connections.size}`);
  }

  public updateActivity(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.lastActivity = new Date();
      connection.isAlive = true;
    }
  }

  public getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      userConnections: this.userConnections.size,
      maxConnections: this.config.maxConnections,
      maxConnectionsPerUser: this.config.maxConnectionsPerUser,
      connectionsPerUser: Array.from(this.userConnections.entries()).map(([userId, sockets]) => ({
        userId,
        count: sockets.size
      })),
      utilizationRate: (this.connections.size / this.config.maxConnections) * 100
    };
  }

  public disconnectUser(userId: string, reason = 'admin_disconnect'): void {
    const userConns = this.userConnections.get(userId);
    if (userConns) {
      userConns.forEach(socketId => {
        const connection = this.connections.get(socketId);
        if (connection && connection.socket.connected) {
          connection.socket.emit('force_disconnect', { reason });
          connection.socket.disconnect(true);
        }
      });
    }
  }

  public disconnectInactiveConnections(): void {
    const now = new Date();
    const inactiveConnections: string[] = [];

    this.connections.forEach((connection, socketId) => {
      const inactiveTime = now.getTime() - connection.lastActivity.getTime();
      if (inactiveTime > this.config.connectionTimeout) {
        inactiveConnections.push(socketId);
      }
    });

    inactiveConnections.forEach(socketId => {
      const connection = this.connections.get(socketId);
      if (connection) {
        console.log(`🧹 Disconnecting inactive connection: ${connection.userId} (${socketId})`);
        connection.socket.emit('force_disconnect', { reason: 'inactive_timeout' });
        connection.socket.disconnect(true);
      }
    });
  }

  private setupActivityMonitoring(socket: any, connection: PooledConnection): void {
    // Monitor all events to update activity
    socket.onAny(() => {
      this.updateActivity(socket.id);
    });

    // Monitor pong responses for health checks
    socket.on('pong', () => {
      connection.isAlive = true;
      connection.lastActivity = new Date();
    });

    // Handle disconnection
    socket.on('disconnect', (reason: any) => {
      this.removeConnection(socket.id);
    });
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performHealthCheck();
      this.disconnectInactiveConnections();
    }, this.config.cleanupInterval);
  }

  private performHealthCheck(): void {
    const now = new Date();
    this.connections.forEach((connection, socketId) => {
      // Check if connection is still alive
      if (!connection.isAlive) {
        const timeSinceLastActivity = now.getTime() - connection.lastActivity.getTime();
        if (timeSinceLastActivity > 60000) { // 1 minute
          console.log(`💀 Removing dead connection: ${connection.userId} (${socketId})`);
          connection.socket.disconnect(true);
        }
      } else {
        // Mark as potentially dead, will be confirmed on next pong
        connection.isAlive = false;
        connection.socket.ping();
      }
    });
  }

  public shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.connections.forEach((connection) => {
      connection.socket.disconnect(true);
    });

    this.connections.clear();
    this.userConnections.clear();
  }

  public updateConfig(newConfig: Partial<ConnectionPoolConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart cleanup timer with new interval
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.startCleanupTimer();
  }
}
