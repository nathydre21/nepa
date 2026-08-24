import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * Custom React hook for managing Socket.IO connection with automatic reconnection
 * using exponential backoff and graceful reconnection event handling.
 *
 * @param token - Authentication token for authenticating with the Socket.IO server
 * @returns Socket instance and connection state
 */
export const useSocket = ({ token }: { token: string | null }) => {
  // Refs
  const socketRef = useRef<Socket | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectionAttempt, setReconnectionAttempt] = useState(0);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  /**
   * Effect that initializes and manages the Socket.IO connection
   */
  useEffect(() => {
    if (!token) return;

    const socketUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    
    // Initialize socket connection with exponential backoff
    socketRef.current = io(socketUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying indefinitely
      reconnectionDelay: 1000, // Initial delay: 1 second
      reconnectionDelayMax: 30000, // Max delay: 30 seconds
      randomizationFactor: 0.5, // Add randomness to prevent thundering herd
      transports: ['websocket', 'polling']
    });

    const socket = socketRef.current;

    /**
     * Event handler for successful connection
     */
    const onConnect = () => {
      console.log('✅ Socket connected');
      setIsConnected(true);
      setIsReconnecting(false);
      setReconnectionAttempt(0);
      setLastError(null);
    };

    /**
     * Event handler for disconnection
     */
    const onDisconnect = (reason: string) => {
      console.log('❌ Socket disconnected:', reason);
      setIsConnected(false);
      // Don't set isReconnecting to true immediately—wait for reconnecting event
    };

    /**
     * Event handler for connection error
     */
    const onConnectError = (err: Error) => {
      console.error('⚠️ Socket connection error:', err.message);
      setLastError(err.message);
      setIsConnected(false);
    };

    /**
     * Event handler when reconnection process starts
     */
    const onReconnecting = (attemptNumber: number) => {
      console.log(`🔄 Attempting to reconnect... Attempt ${attemptNumber}`);
      setIsReconnecting(true);
      setReconnectionAttempt(attemptNumber);
    };

    /**
     * Event handler for successful reconnection
     */
    const onReconnect = (attemptNumber: number) => {
      console.log(`✅ Reconnected successfully after ${attemptNumber} attempt(s)`);
      setIsConnected(true);
      setIsReconnecting(false);
      setReconnectionAttempt(0);
      setLastError(null);
    };

    /**
     * Event handler when reconnection attempts fail (when reconnectionAttempts is reached)
     */
    const onReconnectFailed = () => {
      console.error('❌ Reconnection failed after all attempts');
      setIsReconnecting(false);
      setLastError('Reconnection failed after all attempts');
    };

    /**
     * Event handler when a reconnection attempt errors out
     */
    const onReconnectError = (err: Error) => {
      console.error('⚠️ Reconnection attempt error:', err.message);
      setLastError(err.message);
    };

    /**
     * Event handler when a reconnection attempt is made
     */
    const onReconnectAttempt = (attemptNumber: number) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}`);
    };

    /**
     * Event handler for incoming notifications
     */
    const onNotification = (data: any) => {
      setLastMessage(data);
    };

    // Register all event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('reconnecting', onReconnecting);
    socket.on('reconnect', onReconnect);
    socket.on('reconnect_failed', onReconnectFailed);
    socket.on('reconnect_error', onReconnectError);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('notification', onNotification);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('reconnecting', onReconnecting);
      socket.off('reconnect', onReconnect);
      socket.off('reconnect_failed', onReconnectFailed);
      socket.off('reconnect_error', onReconnectError);
      socket.off('reconnect_attempt', onReconnectAttempt);
      socket.off('notification', onNotification);

      cleanupRef.current.forEach((cleanup) => cleanup());
      cleanupRef.current = [];

      // Disconnect socket properly
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      // Clear references and reset state
      socketRef.current = null;
      setIsConnected(false);
      setIsReconnecting(false);
      setReconnectionAttempt(0);
      setLastError(null);
    };
  }, [token]);

  /**
   * Helper to subscribe to specific events with proper cleanup
   */
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

  /**
   * Manual cleanup function for external use
   */
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