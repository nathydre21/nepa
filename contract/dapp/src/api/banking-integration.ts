import { IntegrationLayer, APIConfig, APIResponse } from './integration-layer';

export interface BankAccount {
  id: string;
  accountNumber: string;
  accountType: 'checking' | 'savings' | 'business';
  bankName: string;
  routingNumber: string;
  balance: number;
  currency: string;
  status: 'active' | 'inactive' | 'frozen';
  lastUpdated: Date;
}

export interface Transaction {
  id: string;
  accountId: string;
  type: 'debit' | 'credit';
  amount: number;
  currency: string;
  description: string;
  category: string;
  date: Date;
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

export interface PaymentRequest {
  accountId: string;
  recipientAccount: string;
  amount: number;
  currency: string;
  description: string;
  reference?: string;
  scheduledDate?: Date;
}

export interface PaymentResponse {
  paymentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimatedArrival?: Date;
  fees: number;
  trackingUrl?: string;
}

export interface Balance {
  available: number;
  current: number;
  pending: number;
  currency: string;
  lastUpdated: Date;
}

export interface BankingConfig {
  apiKey: string;
  apiSecret: string;
  environment: 'sandbox' | 'production';
  webhookUrl: string;
  supportedBanks: string[];
  defaultCurrency: string;
}

export class BankingIntegration {
  private integrationLayer: IntegrationLayer;
  private config: BankingConfig;

  constructor(config: BankingConfig) {
    this.config = config;
    
    const apiConfig: APIConfig = {
      baseURL: config.environment === 'production' 
        ? 'https://api.bankingprovider.com/v1' 
        : 'https://sandbox.bankingprovider.com/v1',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      rateLimitRPS: 10,
      auth: {
        type: 'apikey',
        credentials: {
          apiKey: config.apiKey,
          apiSecret: config.apiSecret
        }
      },
      headers: {
        'X-Client-Version': '1.0.0',
        'X-Environment': config.environment
      }
    };

    this.integrationLayer = new IntegrationLayer(
      apiConfig,
      {
        windowMs: 60000,
        maxRequests: 600, // 10 requests per second
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      },
      {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 500,
        strategy: 'lru'
      }
    );

    this.setupWebhooks();
  }

  private setupWebhooks(): void {
    this.integrationLayer.addWebhook('banking-events', {
      url: this.config.webhookUrl,
      secret: this.config.apiSecret,
      events: ['payment_completed', 'payment_failed', 'account_updated'],
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 2000
      }
    });
  }

  async getAccounts(): Promise<APIResponse<BankAccount[]>> {
    try {
      const response = await this.integrationLayer.get<BankAccount[]>('/accounts');
      
      if (response.success && response.data) {
        // Transform data to match our interface
        const accounts = response.data.map(account => ({
          ...account,
          lastUpdated: new Date(account.lastUpdated)
        }));
        
        return {
          ...response,
          data: accounts
        };
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getAccount(accountId: string): Promise<APIResponse<BankAccount>> {
    try {
      const response = await this.integrationLayer.get<BankAccount>(`/accounts/${accountId}`);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            lastUpdated: new Date(response.data.lastUpdated)
          }
        };
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getBalance(accountId: string): Promise<APIResponse<Balance>> {
    try {
      const response = await this.integrationLayer.get<Balance>(`/accounts/${accountId}/balance`);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            lastUpdated: new Date(response.data.lastUpdated)
          }
        };
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getTransactions(
    accountId: string, 
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      category?: string;
    }
  ): Promise<APIResponse<Transaction[]>> {
    try {
      const params: any = {};
      
      if (options?.limit) params.limit = options.limit;
      if (options?.offset) params.offset = options.offset;
      if (options?.startDate) params.startDate = options.startDate.toISOString();
      if (options?.endDate) params.endDate = options.endDate.toISOString();
      if (options?.category) params.category = options.category;

      const response = await this.integrationLayer.get<Transaction[]>(
        `/accounts/${accountId}/transactions`,
        { params }
      );
      
      if (response.success && response.data) {
        const transactions = response.data.map(transaction => ({
          ...transaction,
          date: new Date(transaction.date)
        }));
        
        return {
          ...response,
          data: transactions
        };
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async initiatePayment(request: PaymentRequest): Promise<APIResponse<PaymentResponse>> {
    try {
      const payload = {
        accountId: request.accountId,
        recipientAccount: request.recipientAccount,
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        reference: request.reference,
        scheduledDate: request.scheduledDate?.toISOString()
      };

      const response = await this.integrationLayer.post<PaymentResponse>('/payments', payload);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            estimatedArrival: response.data.estimatedArrival 
              ? new Date(response.data.estimatedArrival) 
              : undefined
          }
        };
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getPaymentStatus(paymentId: string): Promise<APIResponse<PaymentResponse>> {
    try {
      const response = await this.integrationLayer.get<PaymentResponse>(`/payments/${paymentId}`);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            estimatedArrival: response.data.estimatedArrival 
              ? new Date(response.data.estimatedArrival) 
              : undefined
          }
        };
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async cancelPayment(paymentId: string): Promise<APIResponse<{ cancelled: boolean; reason?: string }>> {
    try {
      const response = await this.integrationLayer.post(`/payments/${paymentId}/cancel`);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async validateAccount(accountNumber: string, routingNumber: string): Promise<APIResponse<{
    valid: boolean;
    bankName?: string;
    accountType?: string;
  }>> {
    try {
      const response = await this.integrationLayer.post('/accounts/validate', {
        accountNumber,
        routingNumber
      });
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getSupportedBanks(): Promise<APIResponse<{
    banks: Array<{
      code: string;
      name: string;
      countries: string[];
      supportedAccountTypes: string[];
    }>;
  }>> {
    try {
      const response = await this.integrationLayer.get('/banks/supported');
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async linkBankAccount(bankCode: string, credentials: {
    username: string;
    password: string;
    mfa?: string;
  }): Promise<APIResponse<{
    linkToken: string;
    expiresAt: Date;
  }>> {
    try {
      const response = await this.integrationLayer.post('/banks/link', {
        bankCode,
        credentials
      });
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            expiresAt: new Date(response.data.expiresAt)
          }
        };
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async unlinkBankAccount(accountId: string): Promise<APIResponse<{ unlinked: boolean }>> {
    try {
      const response = await this.integrationLayer.delete(`/accounts/${accountId}/link`);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getAccountSummary(accountId: string): Promise<APIResponse<{
    account: BankAccount;
    balance: Balance;
    recentTransactions: Transaction[];
    monthlySpending: Array<{
      month: string;
      amount: number;
      category: string;
    }>;
  }>> {
    try {
      // Batch multiple requests for efficiency
      const [accountResponse, balanceResponse, transactionsResponse] = await Promise.all([
        this.getAccount(accountId),
        this.getBalance(accountId),
        this.getTransactions(accountId, { limit: 10 })
      ]);

      if (!accountResponse.success || !balanceResponse.success || !transactionsResponse.success) {
        return {
          success: false,
          error: 'Failed to fetch account summary'
        };
      }

      // Get monthly spending data
      const monthlySpendingResponse = await this.integrationLayer.get(
        `/accounts/${accountId}/analytics/monthly-spending`
      );

      return {
        success: true,
        data: {
          account: accountResponse.data!,
          balance: balanceResponse.data!,
          recentTransactions: transactionsResponse.data || [],
          monthlySpending: monthlySpendingResponse.success ? monthlySpendingResponse.data || [] : []
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async scheduleRecurringPayment(config: {
    accountId: string;
    recipientAccount: string;
    amount: number;
    currency: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    startDate: Date;
    endDate?: Date;
    description: string;
  }): Promise<APIResponse<{
    scheduleId: string;
    nextPaymentDate: Date;
    status: 'active' | 'paused' | 'completed';
  }>> {
    try {
      const payload = {
        ...config,
        startDate: config.startDate.toISOString(),
        endDate: config.endDate?.toISOString()
      };

      const response = await this.integrationLayer.post('/payments/recurring', payload);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            nextPaymentDate: new Date(response.data.nextPaymentDate)
          }
        };
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getRecurringPayments(accountId: string): Promise<APIResponse<Array<{
    scheduleId: string;
    amount: number;
    frequency: string;
    nextPaymentDate: Date;
    status: string;
  }>>> {
    try {
      const response = await this.integrationLayer.get(`/accounts/${accountId}/payments/recurring`);
      
      if (response.success && response.data) {
        const schedules = response.data.map((schedule: any) => ({
          ...schedule,
          nextPaymentDate: new Date(schedule.nextPaymentDate)
        }));
        
        return {
          ...response,
          data: schedules
        };
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Utility methods
  getMetrics() {
    return this.integrationLayer.getMetrics();
  }

  async healthCheck() {
    return this.integrationLayer.healthCheck();
  }

  updateConfig(newConfig: Partial<BankingConfig>) {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.apiKey || newConfig.apiSecret || newConfig.environment) {
      const apiConfig: APIConfig = {
        baseURL: this.config.environment === 'production' 
          ? 'https://api.bankingprovider.com/v1' 
          : 'https://sandbox.bankingprovider.com/v1',
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
        rateLimitRPS: 10,
        auth: {
          type: 'apikey',
          credentials: {
            apiKey: this.config.apiKey,
            apiSecret: this.config.apiSecret
          }
        }
      };
      
      this.integrationLayer.updateConfig(apiConfig);
    }
  }
}
