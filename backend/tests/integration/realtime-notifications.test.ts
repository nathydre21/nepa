/**
 * @jest-environment node
 */

import http from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import {
  SocketServer,
  SERVER_EVENTS,
  ROOMS,
  CLIENT_EVENTS,
} from '../../SocketServer';
import { RealTimeService, NotificationType } from '../../RealTimeService';
import { RealTimeNotificationService } from '../../services/NotificationService';
import { prisma } from '../setup';

describe('Real-time notifications integration', () => {
  let httpServer: http.Server;
  let port: number;
  let socketServer: SocketServer;
  let notificationService: RealTimeNotificationService;

  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_for_testing_only';

  function createToken(payload: {
    userId: string;
    email?: string;
    role?: string;
    sessionId?: string;
  }): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  }

  function connectClient(
    token: string | null,
    options: { captureRooms?: boolean } = {}
  ): Promise<ClientSocket | { client: ClientSocket; joinedRooms: string[] }> {
    return new Promise((resolve, reject) => {
      const joinedRooms: string[] = [];
      const client = ioClient(`http://localhost:${port}`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });

      if (options.captureRooms) {
        client.on(SERVER_EVENTS.ROOM_JOINED, (payload: { room: string }) => {
          joinedRooms.push(payload.room);
        });
      }

      const timeout = setTimeout(() => {
        client.disconnect();
        reject(new Error('Connection timeout'));
      }, 5000);

      client.on('connect', () => {
        clearTimeout(timeout);
        if (options.captureRooms) {
          resolve({ client, joinedRooms });
        } else {
          resolve(client);
        }
      });

      client.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  function waitForEvent<T>(
    client: ClientSocket,
    event: string,
    timeoutMs = 5000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for event: ${event}`));
      }, timeoutMs);

      client.once(event, (payload: T) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });
  }

  beforeAll((done) => {
    process.env.JWT_SECRET = JWT_SECRET;
    httpServer = http.createServer();
    socketServer = SocketServer.getInstance(httpServer);
    notificationService = RealTimeNotificationService.getInstance();
    notificationService.initialize();

    httpServer.listen(0, () => {
      port = (httpServer.address() as { port: number }).port;
      done();
    });
  });

  afterAll((done) => {
    notificationService.resetQueueForTesting();
    SocketServer.resetForTesting();
    httpServer.close(done);
  });

  afterEach(() => {
    notificationService.resetQueueForTesting();
  });

  describe('connection authentication', () => {
    it('rejects connections without a token', async () => {
      await expect(connectClient(null)).rejects.toThrow();
    });

    it('rejects connections with an invalid token', async () => {
      await expect(connectClient('not-a-valid-token')).rejects.toThrow();
    });

    it('accepts connections with a valid JWT containing userId', async () => {
      const token = createToken({
        userId: 'user-auth-test',
        email: 'auth@test.com',
        role: 'USER',
      });

      const client = await connectClient(token);
      expect(client.connected).toBe(true);
      client.disconnect();
    });

    it('auto-joins the user private room and notifications room', async () => {
      const userId = 'user-room-test';
      const token = createToken({
        userId,
        email: 'rooms@test.com',
        role: 'USER',
      });

      const { client, joinedRooms } = (await connectClient(token, {
        captureRooms: true,
      })) as { client: ClientSocket; joinedRooms: string[] };

      expect(joinedRooms).toEqual(
        expect.arrayContaining([ROOMS.user(userId), ROOMS.notifications])
      );

      client.disconnect();
    });
  });

  describe('event broadcasting', () => {
    it('broadcasts events to all connected clients', async () => {
      const tokenA = createToken({
        userId: 'user-broadcast-a',
        email: 'a@test.com',
        role: 'USER',
      });
      const tokenB = createToken({
        userId: 'user-broadcast-b',
        email: 'b@test.com',
        role: 'USER',
      });

      const clientA = await connectClient(tokenA);
      const clientB = await connectClient(tokenB);

      const payloadPromiseA = waitForEvent<{ type: NotificationType }>(
        clientA,
        SERVER_EVENTS.BROADCAST
      );
      const payloadPromiseB = waitForEvent<{ type: NotificationType }>(
        clientB,
        SERVER_EVENTS.BROADCAST
      );

      RealTimeService.broadcast(NotificationType.SYSTEM_ALERT, { message: 'Hello all' });

      const [payloadA, payloadB] = await Promise.all([payloadPromiseA, payloadPromiseB]);

      expect(payloadA.type).toBe(NotificationType.SYSTEM_ALERT);
      expect(payloadB.type).toBe(NotificationType.SYSTEM_ALERT);

      clientA.disconnect();
      clientB.disconnect();
    });

    it('delivers user-specific notifications via RealTimeService', async () => {
      const userId = 'user-direct-test';
      const token = createToken({
        userId,
        email: 'direct@test.com',
        role: 'USER',
      });

      const client = await connectClient(token);
      const notificationPromise = waitForEvent<{ type: NotificationType; title: string }>(
        client,
        SERVER_EVENTS.NOTIFICATION
      );

      RealTimeService.sendUserUpdate(userId, NotificationType.PAYMENT_SUCCESS, {
        amount: 5000,
        transactionId: 'tx-123',
      });

      const notification = await notificationPromise;
      expect(notification.type).toBe(NotificationType.PAYMENT_SUCCESS);
      expect(notification.title).toBe('Payment Successful');

      client.disconnect();
    });
  });

  describe('room-based notifications', () => {
    it('delivers system alerts to the notifications room', async () => {
      const token = createToken({
        userId: 'user-system-alert',
        email: 'alert@test.com',
        role: 'USER',
      });

      const client = await connectClient(token);
      const alertPromise = waitForEvent<{ message: string; type: NotificationType }>(
        client,
        SERVER_EVENTS.NOTIFICATION
      );

      RealTimeService.sendSystemAlert('Scheduled maintenance at midnight');

      const alert = await alertPromise;
      expect(alert.type).toBe(NotificationType.SYSTEM_ALERT);
      expect(alert.message).toBe('Scheduled maintenance at midnight');

      client.disconnect();
    });

    it('restricts admin rooms to privileged users', async () => {
      const userToken = createToken({
        userId: 'user-non-admin',
        email: 'user@test.com',
        role: 'USER',
      });
      const adminToken = createToken({
        userId: 'user-admin',
        email: 'admin@test.com',
        role: 'ADMIN',
      });

      const userClient = await connectClient(userToken);
      const adminClient = await connectClient(adminToken);

      const adminJoined = waitForEvent<{ room: string }>(adminClient, SERVER_EVENTS.ROOM_JOINED);
      adminClient.emit(CLIENT_EVENTS.JOIN_ROOM, ROOMS.admins);
      const adminRoomEvent = await adminJoined;
      expect(adminRoomEvent.room).toBe(ROOMS.admins);

      const userErrors: string[] = [];
      userClient.on(SERVER_EVENTS.ERROR, (payload: { message: string }) => {
        userErrors.push(payload.message);
      });

      userClient.emit(CLIENT_EVENTS.JOIN_ROOM, ROOMS.admins);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(userErrors.some((message) => message.includes('Not authorised'))).toBe(true);

      userClient.disconnect();
      adminClient.disconnect();
    });
  });

  describe('reconnection handling', () => {
    it('allows clients to reconnect with the same token', async () => {
      const userId = 'user-reconnect-test';
      const token = createToken({
        userId,
        email: 'reconnect@test.com',
        role: 'USER',
      });

      const firstClient = await connectClient(token);
      firstClient.disconnect();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const secondClient = await connectClient(token);
      expect(secondClient.connected).toBe(true);
      expect(socketServer.isUserOnline(userId)).toBe(true);

      secondClient.disconnect();
    });

    it('responds to ping events after reconnecting', async () => {
      const token = createToken({
        userId: 'user-ping-test',
        email: 'ping@test.com',
        role: 'USER',
      });

      const client = await connectClient(token);
      client.disconnect();

      const reconnected = await connectClient(token);
      const pongPromise = waitForEvent<{ timestamp: number }>(reconnected, SERVER_EVENTS.PONG);

      reconnected.emit(CLIENT_EVENTS.PING);
      const pong = await pongPromise;

      expect(typeof pong.timestamp).toBe('number');
      reconnected.disconnect();
    });
  });

  describe('notification persistence for offline users', () => {
    async function createUser(email: string) {
      const bcrypt = await import('bcryptjs');
      return prisma.user.create({
        data: {
          email,
          password: await bcrypt.hash('password123', 10),
          role: 'USER',
        },
      });
    }

    it('queues notifications while offline and delivers them on reconnect', async () => {
      const user = await createUser('offline-persist@test.com');

      const notificationId = await notificationService.sendNotification({
        userId: user.id,
        type: 'INFO',
        title: 'Offline message',
        message: 'You were offline when this was sent',
        priority: 'MEDIUM',
      });

      expect(notificationService.getQueuedNotifications(user.id)).toHaveLength(1);

      const token = createToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const client = await connectClient(token);
      const pendingPromise = waitForEvent<Array<{ id: string; title: string }>>(
        client,
        'notifications'
      );

      const pending = await pendingPromise;
      expect(pending.some((item) => item.id === notificationId)).toBe(true);
      expect(pending.some((item) => item.title === 'Offline message')).toBe(true);
      expect(notificationService.getQueuedNotifications(user.id)).toHaveLength(0);

      client.disconnect();
    });

    it('delivers unread notifications from the database on connect', async () => {
      const user = await createUser('db-persist@test.com');

      await notificationService.sendNotification({
        userId: user.id,
        type: 'SUCCESS',
        title: 'Persisted notification',
        message: 'Stored in database',
        priority: 'LOW',
      });

      notificationService.resetQueueForTesting();

      const token = createToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const client = await connectClient(token);
      const pendingPromise = waitForEvent<Array<{ title: string }>>(client, 'notifications');
      const pending = await pendingPromise;

      expect(pending.some((item) => item.title === 'Persisted notification')).toBe(true);

      client.disconnect();
    });
  });
});
