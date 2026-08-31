import { IntegrationLayer, APIConfig, APIResponse } from './integration-layer';
import { ErrorHandler, NetworkError } from '../utils/errorHandler';

export interface StellarTransaction {
  id: string;
  from: string;
  to: string;
  amount: string;
  asset: string;
  memo?: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Date;
  hash?: string;
}

export interface StellarPaymentRequest {
  from: string;
  to: string;
  amount: string;
  asset: string;
  memo?: string;
}

export interface StellarPaymentResponse {
  transactionId: string;
  status: 'pending' | 'completed' | 'failed';
  hash?: string;
  estimatedCompletion?: Date;
}

export interface StellarConfig {
  horizonUrl: string;
  passphrase: string;
  network: 'testnet' | 'public';
  timeout: number;
  maxRetries: number;
}

export class StellarIntegration {
  private integrationLayer: IntegrationLayer;
  private config: StellarConfig;

  constructor(config: StellarConfig) {
    this.config = config;
    
    const apiConfig: APIConfig = {
      baseURL: config.horizonUrl,
      timeout: config.timeout,
      retryAttempts: config.maxRetries,
      retryDelay: 1000,
      rateLimitRPS: 10,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NEPA-Stellar-Integration/1.0'
      }
    };

    this.integrationLayer = new IntegrationLayer(
      apiConfig,
      {
        windowMs: 60000,
        maxRequests: 600,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      },
      {
        enabled: true,
        ttl: 300000,
        maxSize: 500,
        strategy: 'lru'
      }
    );
  }

  async sendPayment(request: StellarPaymentRequest): Promise<APIResponse<StellarPaymentResponse>> {
    try {
      // Validate payment request
      this.validatePaymentRequest(request);

      // Create transaction with retry logic
      const response = await ErrorHandler.retryWithBackoff(async () => {
        const transactionResponse = await this.integrationLayer.post('/transactions', {
          transaction: {
            source: request.from,
            destination: request.to,
            amount: request.amount,
            asset: request.asset,
            memo: request.memo
          }
        });

        if (!transactionResponse.success) {
          throw new Error(transactionResponse.error || 'Failed to create transaction');
        }

        return transactionResponse;
      }, {
        maxRetries: this.config.maxRetries,
        baseDelay: 1500,
        maxDelay: 10000
      });

      if (response.success && response.data) {
        return {
          success: true,
          data: {
            transactionId: response.data.id,
            status: 'pending',
            hash: response.data.hash,
            estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
          }
        };
      }

      return response;
    } catch (error) {
      const networkError = ErrorHandler.classifyError(error);
      ErrorHandler.logError(networkError, { request, operation: 'sendPayment' });

      // Provide specific error messages for Stellar operations
      let errorMessage = networkError.message;
      if (networkError.type === 'validation_error') {
        errorMessage = 'Invalid payment details. Please check the recipient address and amount.';
      } else if (networkError.type === 'network_error') {
        errorMessage = 'Unable to connect to Stellar network. Please check your internet connection.';
      } else if (networkError.type === 'timeout_error') {
        errorMessage = 'Transaction timed out. The network may be congested. Please try again.';
      } else if (networkError.type === 'server_error') {
        errorMessage = 'Stellar network is experiencing issues. Please try again later.';
      }

      return {
        success: false,
        error: errorMessage,
        statusCode: networkError.statusCode
      };
    }
  }

  async getTransactionStatus(transactionId: string): Promise<APIResponse<StellarTransaction>> {
    try {
      const response = await ErrorHandler.retryWithBackoff(async () => {
        return await this.integrationLayer.get<StellarTransaction>(`/transactions/${transactionId}`);
      }, {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 5000
      });

      if (response.success && response.data) {
        return {
          success: true,
          data: {
            ...response.data,
            timestamp: new Date(response.data.timestamp)
          }
        };
      }

      return response;
    } catch (error) {
      const networkError = ErrorHandler.classifyError(error);
      ErrorHandler.logError(networkError, { transactionId, operation: 'getTransactionStatus' });

      return {
        success: false,
        error: `Failed to get transaction status: ${networkError.message}`,
        statusCode: networkError.statusCode
      };
    }
  }

  async getAccountBalance(accountId: string): Promise<APIResponse<{
    balance: string;
    asset: string;
    available: string;
  }>> {
    try {
      const response = await ErrorHandler.retryWithBackoff(async () => {
        return await this.integrationLayer.get(`/accounts/${accountId}/balances`);
      }, {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 5000
      });

      return response;
    } catch (error) {
      const networkError = ErrorHandler.classifyError(error);
      ErrorHandler.logError(networkError, { accountId, operation: 'getAccountBalance' });

      return {
        success: false,
        error: `Failed to get account balance: ${networkError.message}`,
        statusCode: networkError.statusCode
      };
    }
  }

  async submitTransaction(transactionXdr: string): Promise<APIResponse<StellarPaymentResponse>> {
    try {
      const response = await ErrorHandler.retryWithBackoff(async () => {
        const submitResponse = await this.integrationLayer.post('/transactions', {
          tx: transactionXdr
        });

        if (!submitResponse.success) {
          // Handle specific Stellar transaction errors
          if (submitResponse.statusCode === 400) {
            throw new Error('Transaction failed: Invalid transaction format or insufficient funds');
          } else if (submitResponse.statusCode === 503) {
            throw new Error('Stellar network is temporarily unavailable');
          }
          throw new Error(submitResponse.error || 'Transaction submission failed');
        }

        return submitResponse;
      }, {
        maxRetries: this.config.maxRetries,
        baseDelay: 2000,
        maxDelay: 15000
      });

      if (response.success && response.data) {
        return {
          success: true,
          data: {
            transactionId: response.data.hash || response.data.id,
            status: 'pending',
            hash: response.data.hash,
            estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000)
          }
        };
      }

      return response;
    } catch (error) {
      const networkError = ErrorHandler.classifyError(error);
      ErrorHandler.logError(networkError, { operation: 'submitTransaction' });

      let errorMessage = networkError.message;
      if (networkError.type === 'validation_error') {
        errorMessage = 'Invalid transaction. Please check all transaction details.';
      } else if (networkError.type === 'network_error') {
        errorMessage = 'Network connection failed. Transaction was not submitted.';
      } else if (networkError.type === 'timeout_error') {
        errorMessage = 'Transaction submission timed out. Please check if the transaction was submitted.';
      }

      return {
        success: false,
        error: errorMessage,
        statusCode: networkError.statusCode
      };
    }
  }

  private validatePaymentRequest(request: StellarPaymentRequest): void {
    if (!request.from || !request.to) {
      throw new Error('Source and destination addresses are required');
    }

    if (!request.amount || parseFloat(request.amount) <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    if (!request.asset) {
      throw new Error('Asset type is required');
    }

    // Basic Stellar address validation
    const stellarAddressRegex = /^G[A-Z0-9]{55}$/;
    if (!stellarAddressRegex.test(request.from) || !stellarAddressRegex.test(request.to)) {
      throw new Error('Invalid Stellar address format');
    }
  }

  // Utility methods
  getMetrics() {
    return this.integrationLayer.getMetrics();
  }

  async healthCheck() {
    try {
      const response = await this.integrationLayer.get('/');
      return {
        healthy: response.success,
        details: {
          horizonUrl: this.config.horizonUrl,
          network: this.config.network,
          metrics: this.getMetrics()
        }
      };
    } catch (error) {
      const networkError = ErrorHandler.classifyError(error);
      return {
        healthy: false,
        details: {
          error: networkError.message,
          horizonUrl: this.config.horizonUrl,
          network: this.config.network
        }
      };
    }
  }

  updateConfig(newConfig: Partial<StellarConfig>) {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.horizonUrl || newConfig.timeout || newConfig.maxRetries) {
      const apiConfig: APIConfig = {
        baseURL: this.config.horizonUrl,
        timeout: this.config.timeout,
        retryAttempts: this.config.maxRetries,
        retryDelay: 1000,
        rateLimitRPS: 10,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'NEPA-Stellar-Integration/1.0'
        }
      };
      
      this.integrationLayer.updateConfig(apiConfig);
    }
  }
}
