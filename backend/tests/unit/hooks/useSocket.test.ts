import { renderHook, act } from '@testing-library/react';
import { useSocket } from '../../../useSocket';

jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
  };

  return {
    io: jest.fn(() => mockSocket),
  };
});

describe('useSocket Hook', () => {
  const mockToken = 'test-auth-token-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('initializes with correct default state when no token is provided', () => {
      const { result } = renderHook(() => useSocket({ token: null }));

      expect(result.current).toMatchObject({
        socket: null,
        isConnected: false,
        isReconnecting: false,
        reconnectionAttempt: 0,
        lastMessage: null,
        lastError: null,
      });
      expect(typeof result.current.subscribe).toBe('function');
      expect(typeof result.current.cleanup).toBe('function');
    });

    it('initializes socket when token is provided', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      expect(result.current.socket).not.toBeNull();
    });
  });

  describe('state transitions for connection events', () => {
    it('updates state when connected', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      const connectHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'connect'
      )?.[1];

      if (connectHandler) {
        act(() => {
          connectHandler();
        });
      }

      expect(result.current.isConnected).toBe(true);
      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.reconnectionAttempt).toBe(0);
      expect(result.current.lastError).toBeNull();
    });

    it('updates state when disconnected', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      const connectHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'connect'
      )?.[1];
      const disconnectHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'disconnect'
      )?.[1];

      if (connectHandler) {
        act(() => connectHandler());
      }

      if (disconnectHandler) {
        act(() => disconnectHandler('io server disconnect'));
      }

      expect(result.current.isConnected).toBe(false);
    });

    it('updates state when reconnecting starts', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      const reconnectingHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnecting'
      )?.[1];

      if (reconnectingHandler) {
        act(() => reconnectingHandler(2));
      }

      expect(result.current.isReconnecting).toBe(true);
      expect(result.current.reconnectionAttempt).toBe(2);
    });

    it('updates state when reconnection succeeds', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      const reconnectingHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnecting'
      )?.[1];
      const reconnectHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnect'
      )?.[1];

      if (reconnectingHandler) {
        act(() => reconnectingHandler(3));
      }

      if (reconnectHandler) {
        act(() => reconnectHandler(3));
      }

      expect(result.current.isConnected).toBe(true);
      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.reconnectionAttempt).toBe(0);
    });

    it('updates state when reconnection fails', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      const reconnectFailedHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnect_failed'
      )?.[1];

      if (reconnectFailedHandler) {
        act(() => reconnectFailedHandler());
      }

      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.lastError).toBe('Reconnection failed after all attempts');
    });

    it('updates lastError when connect error occurs', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      const testError = new Error('Connection refused');
      const connectErrorHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'connect_error'
      )?.[1];

      if (connectErrorHandler) {
        act(() => connectErrorHandler(testError));
      }

      expect(result.current.lastError).toBe(testError.message);
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('subscribe function', () => {
    it('registers an event listener and returns a cleanup function', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;
      const testCallback = jest.fn();

      const cleanup = result.current.subscribe('test-event', testCallback);

      expect(typeof cleanup).toBe('function');
      expect(socket?.on).toHaveBeenCalledWith('test-event', testCallback);
    });
  });

  describe('cleanup', () => {
    it('cleans up listeners and disconnects when cleanup is called', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      act(() => {
        result.current.cleanup();
      });

      expect(socket?.disconnect).toHaveBeenCalled();
    });

    it('cleans up when the hook unmounts', () => {
      const { result, unmount } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      unmount();

      expect(socket?.disconnect).toHaveBeenCalled();
      expect(socket?.off).toHaveBeenCalled();
    });
  });
});
