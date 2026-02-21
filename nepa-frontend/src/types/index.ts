export type TransactionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface StellarState {
  address: string | null;
  status: TransactionStatus;
  error: string | null;
}

export interface PaymentFormData {
  destination: string;
  amount: string;
}
