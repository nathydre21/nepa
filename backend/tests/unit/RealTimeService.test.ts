import { RealTimeService, NotificationType } from '../../RealTimeService';
import { SocketServer, SERVER_EVENTS, ROOMS } from '../../SocketServer';

jest.mock('../../SocketServer', () => {
  const mockSocketServer = {
    sendNotification: jest.fn(),
    emitToUser: jest.fn(),
    broadcast: jest.fn(),
    emitToRoom: jest.fn(),
  };

  return {
    SocketServer: {
      getInstance: jest.fn(() => mockSocketServer),
    },
    SERVER_EVENTS: {
      BROADCAST: 'broadcast',
      NOTIFICATION: 'notification',
    },
    ROOMS: {
      notifications: 'room_notifications',
    },
  };
});

describe('RealTimeService', () => {
  const mockSocketServer = SocketServer.getInstance() as jest.Mocked<
    ReturnType<typeof SocketServer.getInstance>
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends user-specific notifications with typed payload', () => {
    RealTimeService.sendUserUpdate('user-1', NotificationType.PAYMENT_SUCCESS, {
      amount: 2500,
    });

    expect(mockSocketServer.sendNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        type: NotificationType.PAYMENT_SUCCESS,
        title: 'Payment Successful',
      })
    );
    expect(mockSocketServer.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'payment_success',
      { amount: 2500 }
    );
  });

  it('broadcasts messages to all connected clients', () => {
    RealTimeService.broadcast(NotificationType.SYSTEM_ALERT, { message: 'Update' });

    expect(mockSocketServer.broadcast).toHaveBeenCalledWith(
      SERVER_EVENTS.BROADCAST,
      expect.objectContaining({
        type: NotificationType.SYSTEM_ALERT,
        data: { message: 'Update' },
      })
    );
  });

  it('sends system alerts to the notifications room', () => {
    RealTimeService.sendSystemAlert('Maintenance window');

    expect(mockSocketServer.emitToRoom).toHaveBeenCalledWith(
      ROOMS.notifications,
      SERVER_EVENTS.NOTIFICATION,
      expect.objectContaining({
        type: NotificationType.SYSTEM_ALERT,
        message: 'Maintenance window',
      })
    );
  });
});
