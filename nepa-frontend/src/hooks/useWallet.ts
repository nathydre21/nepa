import { useState } from 'react';
import { WalletState, WalletProvider, TransactionHistory, TransactionStep, PaymentFormData } from '../types';

export const useWallet = () => {
  const [state, setState] = useState<WalletState>({
    address: null,
    balance: "0.00",
    provider: null,
    status: 'idle',
    currentStep: TransactionStep.IDLE,
    txHash: null,
    history: [
        { id: '1', amount: '50.00', meter: '62140098721', date: '2024-02-18', status: 'completed' },
        { id: '2', amount: '12.00', meter: '62140098721', date: '2024-02-15', status: 'completed' }
    ],
    error: null,
  });

  const connect = async (provider: WalletProvider) => {
    setState(prev => ({ ...prev, status: 'loading', currentStep: TransactionStep.CONNECTING }));
    setTimeout(() => {
      const mockAddr = provider === 'freighter' ? 'GCF...RTR' : provider === 'albedo' ? 'GBA...ALB' : 'GWC...WCN';
      setState(prev => ({ ...prev, address: mockAddr, balance: "142.50", provider, status: 'idle', currentStep: TransactionStep.IDLE }));
    }, 1200);
  };

  const sendPayment = async (data: PaymentFormData) => {
    setState(prev => ({ ...prev, status: 'loading', currentStep: TransactionStep.SIGNING }));
    setTimeout(() => {
      setState(prev => ({ ...prev, currentStep: TransactionStep.SUBMITTING }));
      setTimeout(() => {
        setState(prev => ({ ...prev, currentStep: TransactionStep.FINALIZING }));
        setTimeout(() => {
          const newTx: TransactionHistory = {
            id: Math.random().toString(36).substr(2, 9),
            amount: data.amount,
            meter: data.meterNumber,
            date: new Date().toISOString().split('T')[0],
            status: 'completed'
          };
          setState(prev => ({ 
            ...prev, 
            status: 'success', 
            currentStep: TransactionStep.COMPLETE, 
            txHash: "7b4c...f2e1", 
            history: [newTx, ...prev.history] 
          }));
        }, 1500);
      }, 1500);
    }, 1000);
  };

  const disconnect = () => setState(prev => ({ ...prev, address: null, provider: null, history: [] }));
  const reset = () => setState(prev => ({ ...prev, status: 'idle', currentStep: TransactionStep.IDLE }));

  return { ...state, connect, disconnect, sendPayment, reset };
};
