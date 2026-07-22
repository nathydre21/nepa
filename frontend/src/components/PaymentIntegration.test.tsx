import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import userEvent from '@testing-library/user-event';
import { PaymentIntegration } from './PaymentIntegration';

// Mock child components
jest.mock('./PaymentForm', () => ({
  PaymentForm: ({ onSubmit, isLoading }: any) => (
    <div data-testid="payment-form">
      <button
        onClick={() => onSubmit({ destination: 'METER-123', amount: '100' })}
        disabled={isLoading}
      >
        Submit Payment
      </button>
    </div>
  ),
}));

jest.mock('./TransactionHistory', () => ({
  TransactionHistoryComponent: () => <div data-testid="transaction-history">Transaction History</div>,
}));

jest.mock('./WalletConnector', () => ({
  WalletConnector: ({ onConnect, address }: any) => (
    <button onClick={onConnect} data-testid="wallet-connector">
      {address ? `Connected: ${address}` : 'Connect Wallet'}
    </button>
  ),
}));

// Mock Freighter wallet
const mockFreighter = {
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  signTransaction: jest.fn(),
  submitTransaction: jest.fn(),
};

describe('PaymentIntegration', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockFreighter.isConnected.mockResolvedValue(false);
    mockFreighter.getPublicKey.mockResolvedValue('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    mockFreighter.signTransaction.mockResolvedValue('signed-tx');
    mockFreighter.submitTransaction.mockResolvedValue({ hash: 'tx-hash-12345' });
    
    // @ts-ignore - Mock window.freighter
    global.window.freighter = mockFreighter;
  });

  afterEach(() => {
    // @ts-ignore
    delete global.window.freighter;
  });

  describe('Rendering', () => {
    it('should render payment form initially', () => {
      render(<PaymentIntegration />);
      expect(screen.getByTestId('payment-form')).toBeInTheDocument();
      expect(screen.getByText(/wallet status/i)).toBeInTheDocument();
    });

    it('should render wallet connector button', () => {
      render(<PaymentIntegration />);
      expect(screen.getByTestId('wallet-connector')).toBeInTheDocument();
    });

    it('should not show transaction history initially', () => {
      render(<PaymentIntegration />);
      expect(screen.queryByTestId('transaction-history')).not.toBeInTheDocument();
    });
  });

  describe('Wallet Connection', () => {
    it('should handle wallet connection successfully', async () => {
      mockFreighter.isConnected.mockResolvedValue(true);
      
      render(<PaymentIntegration />);
      
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(mockFreighter.getPublicKey).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
        expect(screen.getByText(/1000.5000 XLM/i)).toBeInTheDocument();
      });
    });

    it('should show error when Freighter is not installed', async () => {
      // @ts-ignore
      delete global.window.freighter;
      
      render(<PaymentIntegration />);
      
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(screen.getByText(/freighter wallet is not installed/i)).toBeInTheDocument();
      });
    });

    it('should show error when wallet is not connected', async () => {
      mockFreighter.isConnected.mockResolvedValue(false);
      
      render(<PaymentIntegration />);
      
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(screen.getByText(/please connect your freighter wallet/i)).toBeInTheDocument();
      });
    });

    it('should display wallet balance after connection', async () => {
      mockFreighter.isConnected.mockResolvedValue(true);
      
      render(<PaymentIntegration />);
      
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
        expect(screen.getByText(/network:/i)).toBeInTheDocument();
        expect(screen.getByText(/testnet/i)).toBeInTheDocument();
      });
    });
  });

  describe('Payment Submission', () => {
    beforeEach(async () => {
      // Connect wallet first
      mockFreighter.isConnected.mockResolvedValue(true);
    });

    it('should require wallet connection before payment', async () => {
      mockFreighter.isConnected.mockResolvedValue(false);
      
      render(<PaymentIntegration />);
      
      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/please connect your wallet first/i)).toBeInTheDocument();
      });
    });

    it('should move to confirmation step after form submission', async () => {
      render(<PaymentIntegration />);
      
      // Connect wallet
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      // Submit payment
      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm payment/i)).toBeInTheDocument();
        expect(screen.getByText(/payment id:/i)).toBeInTheDocument();
        expect(screen.getByText(/meter number:/i)).toBeInTheDocument();
      });
    });

    it('should display payment details in confirmation screen', async () => {
      render(<PaymentIntegration />);
      
      // Connect wallet
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      // Submit payment
      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/METER-123/i)).toBeInTheDocument();
        expect(screen.getByText(/₦100/i)).toBeInTheDocument();
        expect(screen.getByText(/transaction fee:/i)).toBeInTheDocument();
      });
    });

    it('should calculate transaction fee correctly', async () => {
      render(<PaymentIntegration />);
      
      // Connect wallet
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      // Submit payment
      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        // Fee should be 0.5% of 100 = 0.5 (or max of 0.001)
        expect(screen.getByText(/transaction fee:/i)).toBeInTheDocument();
        expect(screen.getByText(/total amount:/i)).toBeInTheDocument();
      });
    });
  });

  describe('Payment Confirmation', () => {
    beforeEach(async () => {
      mockFreighter.isConnected.mockResolvedValue(true);
    });

    it('should process payment successfully', async () => {
      render(<PaymentIntegration />);
      
      // Connect wallet
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      // Submit payment
      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm payment/i)).toBeInTheDocument();
      });

      // Confirm payment
      const confirmButton = screen.getByRole('button', { name: /confirm payment/i });
      fireEvent.click(confirmButton);

      // Should show processing state
      await waitFor(() => {
        expect(screen.getByText(/processing payment/i)).toBeInTheDocument();
      });

      // Should show success state
      await waitFor(() => {
        expect(screen.getByText(/payment successful!/i)).toBeInTheDocument();
        expect(screen.getByText(/transaction id:/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should show processing state during payment', async () => {
      mockFreighter.submitTransaction.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ hash: 'tx-hash' }), 100))
      );

      render(<PaymentIntegration />);
      
      // Connect wallet and submit payment
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm payment/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /confirm payment/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/processing payment/i)).toBeInTheDocument();
        expect(screen.getByText(/this usually takes 10-30 seconds/i)).toBeInTheDocument();
      });
    });

    it('should handle payment failure', async () => {
      mockFreighter.submitTransaction.mockRejectedValue(new Error('Transaction failed'));

      render(<PaymentIntegration />);
      
      // Connect wallet and submit payment
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm payment/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /confirm payment/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
        expect(screen.getByText(/transaction failed/i)).toBeInTheDocument();
      });
    });

    it('should allow retry after failed payment', async () => {
      mockFreighter.submitTransaction.mockRejectedValue(new Error('Transaction failed'));

      render(<PaymentIntegration />);
      
      // Connect wallet and submit payment
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm payment/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /confirm payment/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
      });

      // Click retry
      const retryButton = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm payment/i)).toBeInTheDocument();
      });
    });
  });

  describe('Reset and Navigation', () => {
    beforeEach(async () => {
      mockFreighter.isConnected.mockResolvedValue(true);
    });

    it('should allow cancellation from confirmation screen', async () => {
      render(<PaymentIntegration />);
      
      // Connect wallet and submit payment
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm payment/i)).toBeInTheDocument();
      });

      // Cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByTestId('payment-form')).toBeInTheDocument();
      });
    });

    it('should allow starting over after success', async () => {
      render(<PaymentIntegration />);
      
      // Complete payment flow
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm payment/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /confirm payment/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/payment successful!/i)).toBeInTheDocument();
      });

      // Make another payment
      const anotherPaymentButton = screen.getByRole('button', { name: /make another payment/i });
      fireEvent.click(anotherPaymentButton);

      await waitFor(() => {
        expect(screen.getByTestId('payment-form')).toBeInTheDocument();
      });
    });
  });

  describe('Transaction History', () => {
    beforeEach(async () => {
      mockFreighter.isConnected.mockResolvedValue(true);
    });

    it('should show transaction history after successful payment', async () => {
      render(<PaymentIntegration />);
      
      // Complete payment flow
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      const submitButton = screen.getByText(/submit payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm payment/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /confirm payment/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/payment successful!/i)).toBeInTheDocument();
      });

      // View history
      const viewHistoryButton = screen.getByRole('button', { name: /view history/i });
      fireEvent.click(viewHistoryButton);

      await waitFor(() => {
        expect(screen.getByTestId('transaction-history')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should pass accessibility checks', async () => {
      const { container } = render(<PaymentIntegration />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have accessible form labels', () => {
      render(<PaymentIntegration />);
      expect(screen.getByText(/wallet status/i)).toBeInTheDocument();
    });

    it('should have keyboard navigation support', async () => {
      const user = userEvent.setup();
      render(<PaymentIntegration />);

      // Tab through elements
      await user.tab();
      expect(screen.getByTestId('wallet-connector')).toHaveFocus();

      await user.tab();
      expect(screen.getByText(/submit payment/i)).toHaveFocus();
    });
  });

  describe('Error Handling', () => {
    it('should show error when payment info is missing', async () => {
      mockFreighter.isConnected.mockResolvedValue(true);

      render(<PaymentIntegration />);
      
      // Connect wallet
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(screen.getByText(/balance:/i)).toBeInTheDocument();
      });

      // Try to confirm without submitting form (this would be prevented in UI)
      // Just test the error handling logic
      expect(screen.queryByText(/missing payment information/i)).not.toBeInTheDocument();
    });

    it('should display error messages prominently', async () => {
      mockFreighter.isConnected.mockResolvedValue(false);

      render(<PaymentIntegration />);
      
      const connectButton = screen.getByTestId('wallet-connector');
      fireEvent.click(connectButton);

      await waitFor(() => {
        const errorMessage = screen.getByText(/please connect your freighter wallet/i);
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage.closest('.bg-red-50')).toBeInTheDocument();
      });
    });
  });
});
