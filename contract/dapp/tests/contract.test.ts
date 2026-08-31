import { ContractManager, createContractManager } from '../src/contractManager';

describe('Contract Integration Tests', () => {
  let contractManager: ContractManager;
  let testConfig: any;

  beforeAll(() => {
    // Test configuration
    testConfig = {
      network: 'testnet',
      contractAddress: 'GATEST1234567890123456789012345678901234567890',
      secretKey: 'SAB654321098765432109876543210987654321098765432109876543210987654321',
      horizonUrl: 'https://horizon-testnet.stellar.org'
    };

    contractManager = new ContractManager(testConfig);
  });

  describe('Contract Validation', () => {
    test('should validate contract address', async () => {
      // Mock the server.loadAccount method
      const mockAccount = {
        balances: [{ asset_type: 'native', balance: '1000.0000000' }]
      };

      jest.spyOn(contractManager['server'], 'loadAccount')
        .mockResolvedValue(mockAccount as any);

      const isValid = await contractManager.validateContract();
      expect(isValid).toBe(true);
    });

    test('should handle invalid contract address', async () => {
      jest.spyOn(contractManager['server'], 'loadAccount')
        .mockRejectedValue(new Error('Account not found'));

      const isValid = await contractManager.validateContract();
      expect(isValid).toBe(false);
    });
  });

  describe('Payment Processing', () => {
    test('should process payment successfully', async () => {
      const paymentData = {
        meterId: 'METER-001',
        amount: '10.0000000',
        from: 'GTEST1234567890123456789012345678901234567890'
      };

      // Mock account loading
      const mockAccount = {
        sequence: '1',
        balances: [{ asset_type: 'native', balance: '1000.0000000' }]
      };

      // Mock transaction submission
      const mockResult = {
        successful: true,
        hash: 'test-transaction-hash'
      };

      jest.spyOn(contractManager['server'], 'loadAccount')
        .mockResolvedValue(mockAccount as any);
      
      jest.spyOn(contractManager['server'], 'submitTransaction')
        .mockResolvedValue(mockResult as any);

      const result = await contractManager.processPayment(paymentData);

      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe('test-transaction-hash');
      expect(result.amount).toBe(paymentData.amount);
      expect(result.meterId).toBe(paymentData.meterId);
    });

    test('should handle payment processing errors', async () => {
      const paymentData = {
        meterId: 'METER-001',
        amount: '10.0000000',
        from: 'GTEST1234567890123456789012345678901234567890'
      };

      jest.spyOn(contractManager['server'], 'loadAccount')
        .mockRejectedValue(new Error('Account not found'));

      const result = await contractManager.processPayment(paymentData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Meter Status', () => {
    test('should get meter status', async () => {
      const meterId = 'METER-001';

      // Mock transaction records
      const mockTransactions = {
        records: [
          {
            id: 'tx-1',
            memo: 'PAYMENT:METER-001',
            ledger_attr: 1000,
            created_at: '2024-01-01T00:00:00Z'
          }
        ]
      };

      // Mock operations
      const mockOperations = {
        records: [
          {
            type: 'payment',
            asset_type: 'native',
            amount: '5.0000000'
          }
        ]
      };

      jest.spyOn(contractManager['server'], 'transactions')
        .mockReturnValue({
          forAccount: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              call: jest.fn().mockResolvedValue(mockTransactions)
            })
          })
        } as any);

      jest.spyOn(contractManager['server'], 'operations')
        .mockReturnValue({
          forTransaction: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue(mockOperations)
          })
        } as any);

      const status = await contractManager.getMeterStatus(meterId);

      expect(status).toBeDefined();
      expect(status.meterId).toBe(meterId);
      expect(status.totalPaid).toBe('5.0000000');
      expect(['PAID', 'PENDING']).toContain(status.status);
    });

    test('should handle meter status errors', async () => {
      jest.spyOn(contractManager['server'], 'transactions')
        .mockReturnValue({
          forAccount: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              call: jest.fn().mockRejectedValue(new Error('Network error'))
            })
          })
        } as any);

      const status = await contractManager.getMeterStatus('METER-001');
      expect(status).toBeNull();
    });
  });

  describe('Total Paid Calculation', () => {
    test('should calculate total paid amount', async () => {
      const meterId = 'METER-001';

      const mockTransactions = {
        records: [
          {
            id: 'tx-1',
            memo: 'PAYMENT:METER-001',
            created_at: '2024-01-01T00:00:00Z'
          },
          {
            id: 'tx-2',
            memo: 'PAYMENT:METER-001',
            created_at: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const mockOperations = {
        records: [
          { type: 'payment', asset_type: 'native', amount: '3.0000000' },
          { type: 'payment', asset_type: 'native', amount: '2.0000000' }
        ]
      };

      jest.spyOn(contractManager['server'], 'transactions')
        .mockReturnValue({
          forAccount: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              call: jest.fn().mockResolvedValue(mockTransactions)
            })
          })
        } as any);

      jest.spyOn(contractManager['server'], 'operations')
        .mockReturnValue({
          forTransaction: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue(mockOperations)
          })
        } as any);

      const total = await contractManager.getTotalPaid(meterId);
      expect(total).toBe('5.0000000');
    });

    test('should return zero for meter with no payments', async () => {
      jest.spyOn(contractManager['server'], 'transactions')
        .mockReturnValue({
          forAccount: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              call: jest.fn().mockRejectedValue(new Error('No transactions'))
            })
          })
        } as any);

      const total = await contractManager.getTotalPaid('METER-999');
      expect(total).toBe('0');
    });
  });

  describe('Event Listening', () => {
    test('should start event listener', async () => {
      const mockCallback = jest.fn();

      // Mock setInterval to avoid actual polling
      const mockSetInterval = jest.spyOn(global, 'setInterval')
        .mockImplementation(() => 123 as any);

      await contractManager.listenForEvents(mockCallback);

      expect(mockSetInterval).toHaveBeenCalled();
      mockSetInterval.mockRestore();
    });
  });

  describe('Environment Configuration', () => {
    test('should create contract manager from environment', () => {
      const originalEnv = process.env;

      // Set test environment variables
      process.env = {
        ...originalEnv,
        STELLAR_NETWORK: 'testnet',
        CONTRACT_ADDRESS: 'GTEST1234567890123456789012345678901234567890',
        STELLAR_SECRET_KEY: 'SAB654321098765432109876543210987654321098765432109876543210987654321',
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org'
      };

      const manager = createContractManager();
      expect(manager).toBeInstanceOf(ContractManager);

      // Restore original environment
      process.env = originalEnv;
    });

    test('should throw error for missing environment variables', () => {
      const originalEnv = process.env;

      // Clear environment variables
      process.env = {
        ...originalEnv,
        CONTRACT_ADDRESS: '',
        STELLAR_SECRET_KEY: ''
      };

      expect(() => createContractManager()).toThrow('Missing required environment variables');

      // Restore original environment
      process.env = originalEnv;
    });
  });
});
