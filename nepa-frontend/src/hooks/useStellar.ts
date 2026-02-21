import { useState } from 'react';
import { StellarState, PaymentFormData } from '../types';

export const useStellar = () => {
  const [state, setState] = useState<StellarState>({
    address: null,
    status: 'idle',
    error: null,
  });

  const connectWallet = async () => {
    setState(prev => ({ ...prev, status: 'loading' }));
    // Mocking Stellar Wallet Connection
    setTimeout(() => {
      setState({ address: "G...NEPA", status: 'idle', error: null });
    }, 1000);
  };

  const sendPayment = async (data: PaymentFormData) => {
    setState(prev => ({ ...prev, status: 'loading' }));
    console.log("Processing Transaction:", data);
    setTimeout(() => {
      setState(prev => ({ ...prev, status: 'success' }));
    }, 2000);
  };

  return { ...state, connectWallet, sendPayment };
};
