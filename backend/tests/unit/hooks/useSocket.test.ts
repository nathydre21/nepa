import { renderHook, act } from '@testing-library/react';
import { useSocket } from '../../../useSocket';

// Mock socket.io-client
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
    it('should initialize with correct default state when no token is provided', () => {
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

    it('should initialize socket when token is provided', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));

      // Socket should not be null immediately after initialization
      expect(result.current.socket).not.toBeNull();
    });
  });

  describe('state transitions for connection events', () => {
    it('should update state when connected', async () => {
      const { result, rerender } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      // Find the onConnect handler registered on 'connect' event
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

    it('should update state when disconnected', async () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      // First, simulate a successful connection
      const connectHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'connect'
      )?.[1];

      if (connectHandler) {
        act(() => {
          connectHandler();
        });
      }

      // Then simulate disconnect
      const disconnectHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'disconnect'
      )?.[1];

      if (disconnectHandler) {
        act(() => {
          disconnectHandler('io server disconnect');
        });
      }

      expect(result.current.isConnected).toBe(false);
    });

    it('should update state when reconnecting starts', async () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      const reconnectingHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnecting'
      )?.[1];

      if (reconnectingHandler) {
        act(() => {
          reconnectingHandler(2);
        });
      }

      expect(result.current.isReconnecting).toBe(true);
      expect(result.current.reconnectionAttempt).toBe(2);
    });

    it('should update state when reconnection succeeds', async () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      // First simulate reconnecting
      const reconnectingHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnecting'
      )?.[1];

      if (reconnectingHandler) {
        act(() => {
          reconnectingHandler(3);
        });
      }

      // Then simulate successful reconnect
      const reconnectHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnect'
      )?.[1];

      if (reconnectHandler) {
        act(() => {
          reconnectHandler(3);
        });
      }

      expect(result.current.isConnected).toBe(true);
      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.reconnectionAttempt).toBe(0);
    });

    it('should update state when reconnection fails', async () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      const reconnectFailedHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnect_failed'
      )?.[1];

      if (reconnectFailedHandler) {
        act(() => {
          reconnectFailedHandler();
        });
      }

      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.lastError).toBe('Reconnection failed after all attempts');
    });

    it('should update lastError when connect error occurs', async () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      const testError = new Error('Connection refused');
      const connectErrorHandler = (socket?.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'connect_error'
      )?.[1];

      if (connectErrorHandler) {
        act(() => {
          connectErrorHandler(testError);
        });
      }

      expect(result.current.lastError).toBe(testError.message);
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('subscribe function', () => {
    it('should register an event listener and return a cleanup function', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;
      const testCallback = jest.fn();

      const cleanup = result.current.subscribe('test-event', testCallback);
      
      expect(typeof cleanup).toBe('function');
      expect(socket?.on).toHaveBeenCalledWith('test-event', testCallback);
    });
  });

  describe('cleanup', () => {
    it('should clean up listeners and disconnect when cleanup is called', () => {
      const { result } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      act(() => {
        result.current.cleanup();
      });

      expect(socket?.disconnect).toHaveBeenCalled();
    });

    it('should clean up when the hook unmounts', () => {
      const { result, unmount } = renderHook(() => useSocket({ token: mockToken }));
      const socket = result.current.socket;

      unmount();

      expect(socket?.disconnect).toHaveBeenCalled();
      // Check that event listeners were removed
      expect(socket?.off).toHaveBeenCalled();
    });
  });
});
