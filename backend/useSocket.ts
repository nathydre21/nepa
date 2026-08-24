import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * Custom React hook for managing Socket.IO connection with automatic reconnection
 * using exponential backoff and graceful reconnection event handling.
 */
export const useSocket = ({ token }: { token: string | null }) => {
  const socketRef = useRef<Socket | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);

  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectionAttempt, setReconnectionAttempt] = useState(0);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const socketUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';

    socketRef.current = io(socketUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      transports: ['websocket', 'polling'],
    });

    const socket = socketRef.current;

    const onConnect = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      setReconnectionAttempt(0);
      setLastError(null);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onConnectError = (err: Error) => {
      setLastError(err.message);
      setIsConnected(false);
    };

    const onReconnecting = (attemptNumber: number) => {
      setIsReconnecting(true);
      setReconnectionAttempt(attemptNumber);
    };

    const onReconnect = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      setReconnectionAttempt(0);
      setLastError(null);
    };

    const onReconnectFailed = () => {
      setIsReconnecting(false);
      setLastError('Reconnection failed after all attempts');
    };

    const onReconnectError = (err: Error) => {
      setLastError(err.message);
    };

    const onNotification = (data: any) => {
      setLastMessage(data);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('reconnecting', onReconnecting);
    socket.on('reconnect', onReconnect);
    socket.on('reconnect_failed', onReconnectFailed);
    socket.on('reconnect_error', onReconnectError);
    socket.on('notification', onNotification);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('reconnecting', onReconnecting);
      socket.off('reconnect', onReconnect);
      socket.off('reconnect_failed', onReconnectFailed);
      socket.off('reconnect_error', onReconnectError);
      socket.off('notification', onNotification);

      cleanupRef.current.forEach((cleanup) => cleanup());
      cleanupRef.current = [];

      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      socketRef.current = null;
      setIsConnected(false);
      setIsReconnecting(false);
      setReconnectionAttempt(0);
      setLastError(null);
    };
  }, [token]);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (!socketRef.current) {
      return () => {};
    }

    const socket = socketRef.current;
    socket.on(event, callback);

    const cleanup = () => {
      socket.off(event, callback);
    };

    cleanupRef.current.push(cleanup);
    return cleanup;
  }, []);

  const cleanup = useCallback(() => {
    cleanupRef.current.forEach((fn) => fn());
    cleanupRef.current = [];

    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    socketRef.current = null;
    setIsConnected(false);
    setIsReconnecting(false);
    setReconnectionAttempt(0);
    setLastError(null);
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    isReconnecting,
    reconnectionAttempt,
    lastMessage,
    lastError,
    subscribe,
    cleanup,
  };
};
