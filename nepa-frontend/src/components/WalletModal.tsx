import React from 'react';
import { WalletProvider } from '../types';

export const WalletModal = ({ onSelect, onClose }: { onSelect: (p: WalletProvider) => void, onClose: () => void }) => (
  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-black text-xl text-slate-800">Select Wallet</h3>
        <button onClick={onClose} className="text-slate-400 text-2xl">&times;</button>
      </div>
      <div className="space-y-3">
        {['freighter', 'albedo', 'walletconnect'].map((p) => (
          <button key={p} onClick={() => onSelect(p as WalletProvider)} className="w-full flex items-center p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all capitalize font-bold text-slate-700">
            <div className="w-10 h-10 bg-slate-100 rounded-full mr-4" />
            {p}
          </button>
        ))}
      </div>
    </div>
  </div>
);
