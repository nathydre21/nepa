/**
 * NotificationService — persists notifications to the database and delivers
 * them in real-time via the shared SocketServer singleton.
 *
 * The old implementation created its own `socket.io` Server instance, which
 * conflicted with SocketServer.  This version delegates all WebSocket I/O to
 * SocketServer and only owns the database + queue logic.
 */

// TODO: Fix Prisma import
// import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { SocketServer, ROOMS, CLIENT_EVENTS } from '../SocketServer';

// TODO: Fix Prisma client
// const prisma = new PrismaClient();
const prisma = null as any;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface NotificationData {
  id?: string;
  userId: string;
  type:
    | 'INFO'
    | 'SUCCESS'
    | 'WARNING'
    | 'ERROR'
    | 'BILL_CREATED'
    | 'BILL_OVERDUE'
    | 'PAYMENT_CONFIRMED'
    | 'SYSTEM_ALERT';
  title: string;
  message: string;
  data?: any;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  category?: 'BILLING' | 'PAYMENT' | 'SYSTEM' | 'USER' | 'SECURITY';
  actionUrl?: string;
  actionText?: string;
  isRead?: boolean;
  expiresAt?: Date;
  sound?: string;
  icon?: string;
}

export interface NotificationPreference {
  userId: string;
  email: boolean;
  sms: boolean;
  push: boolean;
  inApp: boolean;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  quietHours?: {
    enabled: boolean;
    start: string; // "HH:MM"
    end: string;   // "HH:MM"
  };
  categories?: Record<string, boolean>;
}

export interface WebSocketMessage {
  type:
    | 'NOTIFICATION'
    | 'NOTIFICATION_READ'
    | 'NOTIFICATION_DELETED'
    | 'USER_ONLINE'
    | 'USER_OFFLINE';
  data: any;
  timestamp: Date;
  userId?: string;
}

// ─── RealTimeNotificationService ─────────────────────────────────────────────

export class RealTimeNotificationService {
  private static instance: RealTimeNotificationService;

  /**
   * Notifications queued for users who are currently offline.
   * Delivered the next time the user connects.
   */
  private notificationQueue: Map<string, NotificationData[]> = new Map();

  static getInstance(): RealTimeNotificationService {
    if (!RealTimeNotificationService.instance) {
      RealTimeNotificationService.instance = new RealTimeNotificationService();
    }
    return RealTimeNotificationService.instance;
  }

  /**
   * Register socket-level event handlers for notification interactions.
   * Must be called once from server.ts after SocketServer has been initialised.
   */
  initialize(): void {
    const io = SocketServer.getIO();

    io.on('connection', (socket) => {
      const userId: string | undefined = (socket as any).user?.id;
      if (!userId) return;

      // Deliver persisted and queued notifications when the user reconnects
      this.deliverPendingNotifications(userId, socket).catch((err) => {
        console.error('[NotificationService] deliverPendingNotifications error:', err);
      });

      // Push current unread count
      this.getUnreadCount(userId).then((count) => {
        socket.emit('unread_count', count);
      });

      // ── Client-initiated notification events ───────────────────────────

      socket.on(CLIENT_EVENTS.MARK_NOTIFICATION_READ, async (notificationId: string) => {
        try {
          await this.markAsRead(notificationId);
          const count = await this.getUnreadCount(userId);
          // TODO: Fix socket.io emit
          // io.to(ROOMS.user(userId)).emit('unread_count', count);
        } catch (err) {
          console.error('[NotificationService] mark_notification_read error:', err);
        }
      });

      socket.on(CLIENT_EVENTS.MARK_ALL_NOTIFICATIONS_READ, async () => {
        try {
          await this.markAllAsRead(userId);
          // TODO: Fix socket.io emit
          // io.to(ROOMS.user(userId)).emit('unread_count', 0);
        } catch (err) {
          console.error('[NotificationService] mark_all_notifications_read error:', err);
        }
      });

      socket.on('delete_notification', async (notificationId: string) => {
        try {
          await this.deleteNotification(notificationId);
          const count = await this.getUnreadCount(userId);
          // TODO: Fix socket.io emit
          // io.to(ROOMS.user(userId)).emit('unread_count', count);
        } catch (err) {
          console.error('[NotificationService] delete_notification error:', err);
        }
      });
    });
  }

  // ─── Core notification delivery ───────────────────────────────────────────

  /**
   * Persist a notification and deliver it in real-time if the user is online.
   * Returns the generated notification ID.
   */
  async sendNotification(notification: Omit<NotificationData, 'id'>): Promise<string> {
    const notificationId = uuidv4();
    const full: NotificationData = { ...notification, id: notificationId, isRead: false };

    await this.saveNotification(full);

    // const preferences = await this.getUserPreferences(notification.userId);

    // TODO: Fix missing methods
    // if (!preferences.inApp || this.isQuietHours(preferences)) {
    //   // Still send push / desktop even during quiet hours if configured
    //   if (preferences.push) await this.sendPushNotification(notification);
    //   return notificationId;
    // }

    const socketServer = SocketServer.getInstance();

    // TODO: Fix missing preferences variable
    // const preferences = { soundEnabled: true, push: false, desktopNotifications: false };
    
    if (socketServer.isUserOnline(notification.userId)) {
      socketServer.emitToUser(notification.userId, 'notification', full);

      const count = await this.getUnreadCount(notification.userId);
      socketServer.emitToUser(notification.userId, 'unread_count', count);

      // TODO: Fix missing preferences
      // if (preferences.soundEnabled && notification.sound) {
      //   socketServer.emitToUser(notification.userId, 'play_sound', notification.sound);
      // }
    } else {
      // Queue for delivery when the user next connects
      if (!this.notificationQueue.has(notification.userId)) {
        this.notificationQueue.set(notification.userId, []);
      }
      this.notificationQueue.get(notification.userId)!.push(full);
    }

    // TODO: Fix missing methods
    // if (preferences.push) await this.sendPushNotification(notification);
    // if (preferences.desktopNotifications) await this.sendDesktopNotification(full);

    return notificationId;
  }

  /** Send multiple notifications in parallel. */
  async sendBulkNotifications(
    notifications: Omit<NotificationData, 'id'>[]
  ): Promise<string[]> {
    return Promise.all(notifications.map((n) => this.sendNotification(n)));
  }

  /**
   * Deliver unread notifications from the database plus any in-memory queue
   * entries that were created while the user was offline in this process.
   */
  async deliverPendingNotifications(userId: string, socket: { emit: (event: string, data: unknown) => void }): Promise<void> {
    const unreadFromDb = await this.getUserNotifications(userId, {
      unreadOnly: true,
      limit: 100,
    });

    const queued = this.notificationQueue.get(userId) ?? [];
    const seenIds = new Set(unreadFromDb.map((notification) => notification.id));
    const merged = [
      ...unreadFromDb,
      ...queued.filter((notification) => !notification.id || !seenIds.has(notification.id)),
    ];

    if (merged.length > 0) {
      socket.emit('notifications', merged);
    }

    this.notificationQueue.delete(userId);
  }

  /**
   * Expose the in-memory offline queue for testing.
   */
  getQueuedNotifications(userId: string): NotificationData[] {
    return [...(this.notificationQueue.get(userId) ?? [])];
  }

  /**
   * Reset the in-memory offline queue. Intended for test isolation only.
   */
  resetQueueForTesting(): void {
    this.notificationQueue.clear();
  }

  // ─── Database helpers ─────────────────────────────────────────────────────

  async getUserNotifications(
    userId: string,
    options: { limit?: number; offset?: number; unreadOnly?: boolean; category?: string } = {}
  ): Promise<NotificationData[]> {
    // TODO: Fix missing notification model
    // const { limit = 50, offset = 0, unreadOnly = false, category } = options;
    // const where: any = { userId };
    // if (unreadOnly) where.isRead = false;
    // if (category) where.category = category;

    // return prisma.notification.findMany({
    //   where,
    //   orderBy: { createdAt: 'desc' },
    //   take: limit,
    //   skip: offset,
    // });
    return [];
  }

  async getUnreadCount(userId: string): Promise<number> {
    // TODO: Fix missing notification model
    // return await prisma.notification.count({ where: { userId, isRead: false } });
    return 0;
  }

  async markAsRead(notificationId: string): Promise<void> {
    // TODO: Fix missing notification model
    // await prisma.notification.update({
    //   where: { id: notificationId },
    //   data: { isRead: true, readAt: new Date() },
    // });
  }

  async markAllAsRead(userId: string): Promise<void> {
    // TODO: Fix missing notification model
    // await prisma.notification.updateMany({
    //   where: { userId, isRead: false },
    //   data: { isRead: true, readAt: new Date() },
    // });
  }

  async deleteNotification(notificationId: string): Promise<void> {
    // TODO: Fix missing notification model
    // await prisma.notification.delete({ where: { id: notificationId } });
  }

  async updatePreferences(
    userId: string,
    preferences: Partial<NotificationPreference>
  ): Promise<void> {
    // TODO: Fix missing notificationPreference model
    // await prisma.notificationPreference.upsert({
    //   where: { userId },
    //   update: preferences,
    //   create: { userId, ...preferences },
    // });
  }

  /** Check whether a user has at least one active WebSocket connection. */
  isUserOnline(userId: string): boolean {
    try {
      return SocketServer.getInstance().isUserOnline(userId);
    } catch {
      return false;
    }
  }

  getOnlineUsersCount(): number {
    try {
      return SocketServer.getInstance().getConnectionStats().uniqueUsers;
    } catch {
      return 0;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async saveNotification(notification: NotificationData): Promise<void> {
    // TODO: Fix missing notification model
    // await prisma.notification.create({
    //   data: {
    //     id: notification.id!,
    //     userId: notification.userId,
    //     type: notification.type,
    //     title: notification.title,
    //     message: notification.message,
    //     data: notification.data ?? {},
    //     priority: notification.priority,
    //     category: notification.category,
    //     actionUrl: notification.actionUrl,
    //     actionText: notification.actionText,
    //     isRead: notification.isRead ?? false,
    //     expiresAt: notification.expiresAt,
    //     sound: notification.sound,
    //   },
    // });
  }
}
