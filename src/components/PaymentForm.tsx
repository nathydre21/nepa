import React, { useState } from 'react';
import { PaymentFormData } from '../types';

interface Props {
  onSubmit: (data: PaymentFormData) => void;
  isLoading: boolean;
}

export const PaymentForm: React.FC<Props> = ({ onSubmit, isLoading }) => {
  const [form, setForm] = useState<PaymentFormData>({ destination: '', amount: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <input 
        placeholder="Destination Address"
        value={form.destination}
        onChange={e => setForm({...form, destination: e.target.value})}
        required
      />
      <input 
        type="number" 
        placeholder="Amount (XLM)"
        value={form.amount}
        onChange={e => setForm({...form, amount: e.target.value})}
        required
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Processing...' : 'Pay Bill'}
      </button>
    </form>
  );
};
