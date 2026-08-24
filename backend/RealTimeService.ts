/**
 * RealTimeService — thin wrapper around SocketServer for application-level
 * real-time notifications.
 *
 * All emission goes through the SocketServer singleton so there is always a
 * single Socket.IO Server instance in the process.
 *
 * Note: Reconnection logic is handled on the client-side in useSocket.ts.
 * This service focuses on sending notifications from the server to clients.
 */

import { SocketServer, SERVER_EVENTS, ROOMS } from './SocketServer';

/**
 * Enumeration of all possible notification types sent via real-time updates
 */
export enum NotificationType {
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  BILL_GENERATED = 'BILL_GENERATED',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
}

/**
 * Interface for a standard notification payload sent to clients
 */
export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

export class RealTimeService {
  /**
   * Send a typed notification to a specific user's private room.
   * Emits both a generic 'notification' event and a type-specific event for selective listening.
   *
   * @param userId - ID of the user to send the notification to
   * @param type - Type of notification being sent
   * @param data - Additional data to include with the notification
   */
  static sendUserUpdate(userId: string, type: NotificationType, data: unknown): void {
    try {
      const socketServer = SocketServer.getInstance();

      const payload: NotificationPayload = {
        type,
        title: RealTimeService.getTitleForType(type),
        message: RealTimeService.getMessageForType(type, data),
        data,
        timestamp: new Date().toISOString(),
      };

      // Emit the generic notification event
      socketServer.sendNotification(userId, payload);

      // Also emit a granular event so clients can listen selectively
      socketServer.emitToUser(userId, type.toLowerCase(), data);

      console.log(`[RealTimeService] Sent ${type} to user ${userId}`);
    } catch (error) {
      console.error(`[RealTimeService] Failed to send ${type} to user ${userId}:`, error);
    }
  }

  /**
   * Broadcast a message to every connected authenticated user.
   *
   * @param type - Type of notification being broadcast
   * @param data - Additional data to include with the broadcast
   */
  static broadcast(type: NotificationType, data: unknown): void {
    try {
      SocketServer.getInstance().broadcast(SERVER_EVENTS.BROADCAST, {
        type,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[RealTimeService] Failed to broadcast message:', error);
    }
  }

  /**
   * Send a system-wide alert to the notifications room.
   * All users who have subscribed to `room_notifications` will receive it.
   *
   * @param message - The alert message to send
   * @param data - Optional additional data to include
   */
  static sendSystemAlert(message: string, data?: unknown): void {
    try {
      SocketServer.getInstance().emitToRoom(ROOMS.notifications, SERVER_EVENTS.NOTIFICATION, {
        type: NotificationType.SYSTEM_ALERT,
        title: 'System Alert',
        message,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[RealTimeService] Failed to send system alert:', error);
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Get a human-readable title for a given notification type
   *
   * @param type - The notification type
   * @returns The corresponding title string
   */
  private static getTitleForType(type: NotificationType): string {
    switch (type) {
      case NotificationType.PAYMENT_SUCCESS: return 'Payment Successful';
      case NotificationType.PAYMENT_FAILED:  return 'Payment Failed';
      case NotificationType.PAYMENT_PENDING: return 'Payment Processing';
      case NotificationType.BILL_GENERATED:  return 'New Bill Available';
      case NotificationType.SYSTEM_ALERT:    return 'System Alert';
      default: return 'Notification';
    }
  }

  /**
   * Get a formatted message for a given notification type and data
   *
   * @param type - The notification type
   * @param data - Data associated with the notification
   * @returns The corresponding message string
   */
  private static getMessageForType(type: NotificationType, data: any): string {
    switch (type) {
      case NotificationType.PAYMENT_SUCCESS:
        return `Your payment of ₦${data?.amount} was successful.`;
      case NotificationType.PAYMENT_FAILED:
        return `Payment failed: ${data?.reason ?? 'Unknown error'}`;
      case NotificationType.BILL_GENERATED:
        return `A new bill for ${data?.utilityName} is ready.`;
      default:
        return 'You have a new notification.';
    }
  }
}