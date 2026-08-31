// Jest setup file for contract tests

// Set default test environment variables
process.env.STELLAR_NETWORK = 'testnet';
process.env.STELLAR_HORIZON_URL = 'https://horizon-testnet.stellar.org';
process.env.CONTRACT_ADDRESS = 'GATEST1234567890123456789012345678901234567890';
process.env.STELLAR_SECRET_KEY = 'SAB654321098765432109876543210987654321098765432109876543210987654321';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Increase timeout for network operations
jest.setTimeout(30000);
