import React from 'react';
import { TransactionHistory as TxType } from '../types';

export const TransactionHistory = ({ history }: { history: TxType[] }) => (
  <div className="mt-8">
    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Recent Payments</h3>
    <div className="space-y-3">
      {history.map(tx => (
        <div key={tx.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div>
            <p className="font-bold text-slate-800 text-sm">{tx.amount} XLM</p>
            <p className="text-[10px] text-slate-400">Meter: {tx.meter}</p>
          </div>
          <div className="text-right text-[10px]">
            <p className="font-bold text-green-500 uppercase">{tx.status}</p>
            <p className="text-slate-400">{tx.date}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);
