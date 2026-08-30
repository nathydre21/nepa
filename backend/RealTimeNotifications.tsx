import React, { useEffect, useRef } from 'react';
import { useSocket } from './useSocket';
import { toast } from 'react-hot-toast'; // Assuming react-hot-toast is used

interface Props {
  token: string | null;
}

export const RealTimeNotifications: React.FC<Props> = ({ token }) => {
  const { isConnected, subscribe } = useSocket({ token });
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    // Clean up previous subscriptions before setting up new ones
    cleanupFunctionsRef.current.forEach(cleanup => cleanup());
    cleanupFunctionsRef.current = [];

    if (!isConnected) return;

    // Handle Payment Success
    const unsubscribeSuccess = subscribe('payment_success', (data: any) => {
      const toastId = toast.success(
        <div>
          <p className="font-bold">Payment Successful!</p>
          <p className="text-sm">Transaction {data.transactionId} confirmed.</p>
          <p className="text-xs mt-1">Amount: ₦{data.amount}</p>
        </div>,
        { 
          duration: 5000, 
          position: 'top-right',
          id: `payment-success-${data.transactionId}` // Unique ID to prevent duplicates
        }
      );
      
      // Optional: Refresh data logic here
      // queryClient.invalidateQueries('transactions');
    });

    // Handle Payment Failure
    const unsubscribeFailure = subscribe('payment_failed', (data: any) => {
      const toastId = toast.error(
        <div>
          <p className="font-bold">Payment Failed</p>
          <p className="text-sm">{data.reason}</p>
        </div>,
        { 
          duration: 6000,
          id: `payment-failed-${data.transactionId || Date.now()}` // Unique ID
        }
      );
    });

    // Handle Bill Generation
    const unsubscribeBill = subscribe('bill_generated', (data: any) => {
      const toastId = toast(
        <div>
          <p className="font-bold">New Bill Available</p>
          <p className="text-sm">{data.utilityName}: ₦{data.amount}</p>
        </div>,
        { 
          icon: '📄', 
          duration: 4000,
          id: `bill-generated-${data.billId || Date.now()}` // Unique ID
        }
      );
    });

    // Handle System Alerts
    const unsubscribeSystemAlert = subscribe('system_alert', (data: any) => {
      const toastId = toast(
        <div>
          <p className="font-bold">System Alert</p>
          <p className="text-sm">{data.message}</p>
        </div>,
        { 
          duration: 8000,
          id: `system-alert-${data.id || Date.now()}` // Unique ID
        }
      );
    });

    // Store cleanup functions
    cleanupFunctionsRef.current = [
      unsubscribeSuccess,
      unsubscribeFailure,
      unsubscribeBill,
      unsubscribeSystemAlert
    ];

    // Cleanup function
    return () => {
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
    };
  }, [isConnected, subscribe]); // Added subscribe to dependency array

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
    };
  }, []);

  // Render connection status indicator (optional, for debugging or UI)
  if (process.env.NODE_ENV === 'development') {
    return (
      <div 
        className={`fixed bottom-2 right-2 w-3 h-3 rounded-full transition-colors ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`} 
        title={isConnected ? "Real-time connected" : "Disconnected"} 
      />
    );
  }

  return null;
};
