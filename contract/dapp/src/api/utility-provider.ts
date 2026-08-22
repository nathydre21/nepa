import { IntegrationLayer, APIConfig, APIResponse } from './integration-layer';

export interface UtilityProvider {
  id: string;
  name: string;
  type: 'electricity' | 'water' | 'gas' | 'internet';
  country: string;
  region: string;
  supportedServices: string[];
  apiVersion: string;
  status: 'active' | 'inactive' | 'maintenance';
}

export interface UtilityAccount {
  id: string;
  providerId: string;
  accountNumber: string;
  serviceAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  serviceType: 'electricity' | 'water' | 'gas' | 'internet';
  status: 'active' | 'inactive' | 'suspended';
  customerSince: Date;
  lastUpdated: Date;
}

export interface UtilityBill {
  id: string;
  accountId: string;
  billNumber: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  dueDate: Date;
  amount: number;
  currency: string;
  status: 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled';
  usage: {
    current: number;
    previous: number;
    unit: string;
  };
  rates: {
    baseRate: number;
    usageRate: number;
    taxes: number;
    fees: number;
  };
  paymentMethods: string[];
  pdfUrl?: string;
}

export interface PaymentRequest {
  accountId: string;
  billId?: string;
  amount: number;
  currency: string;
  paymentMethod: 'bank_transfer' | 'credit_card' | 'debit_card' | 'crypto';
  paymentDetails: {
    // Bank transfer
    bankAccountId?: string;
    routingNumber?: string;
    // Card payment
    cardNumber?: string;
    expiryDate?: string;
    cvv?: string;
    cardholderName?: string;
    // Crypto
    walletAddress?: string;
    blockchain?: string;
  };
  scheduledDate?: Date;
  reference?: string;
}

export interface PaymentResponse {
  paymentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  fees: number;
  processedAt?: Date;
  estimatedCompletion?: Date;
  transactionId?: string;
  confirmationUrl?: string;
}

export interface UsageData {
  accountId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  usage: {
    current: number;
    previous: number;
    unit: string;
    dailyAverage: number;
  };
  cost: {
    current: number;
    previous: number;
    currency: string;
  };
  trends: {
    direction: 'increasing' | 'decreasing' | 'stable';
    percentage: number;
  };
  forecasts: {
    nextPeriod: number;
    nextMonth: number;
    accuracy: number;
  };
}

export interface ServiceOutage {
  id: string;
  providerId: string;
  type: 'planned' | 'unplanned';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedAreas: Array<{
    region: string;
    zipCodes: string[];
    estimatedCustomers: number;
  }>;
  startTime: Date;
  estimatedEndTime?: Date;
  actualEndTime?: Date;
  status: 'scheduled' | 'active' | 'resolved';
  updates: Array<{
    timestamp: Date;
    message: string;
    author: string;
  }>;
}

export interface UtilityProviderConfig {
  apiKey: string;
  apiSecret: string;
  environment: 'sandbox' | 'production';
  webhookUrl: string;
  defaultCurrency: string;
  supportedProviders: string[];
}

export class UtilityProviderIntegration {
  private integrationLayer: IntegrationLayer;
  private config: UtilityProviderConfig;
  private providers: Map<string, UtilityProvider> = new Map();

  constructor(config: UtilityProviderConfig) {
    this.config = config;
    
    const apiConfig: APIConfig = {
      baseURL: config.environment === 'production' 
        ? 'https://api.utilityproviders.com/v1' 
        : 'https://sandbox.utilityproviders.com/v1',
      timeout: 25000,
      retryAttempts: 3,
      retryDelay: 1500,
      rateLimitRPS: 20,
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
        maxRequests: 1200, // 20 requests per second
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      },
      {
        enabled: true,
        ttl: 600000, // 10 minutes for utility data
        maxSize: 1000,
        strategy: 'lru'
      }
    );

    this.setupWebhooks();
    this.loadProviders();
  }

  private setupWebhooks(): void {
    this.integrationLayer.addWebhook('utility-events', {
      url: this.config.webhookUrl,
      secret: this.config.apiSecret,
      events: ['bill_issued', 'payment_received', 'service_outage', 'usage_updated'],
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 2000
      }
    });
  }

  private async loadProviders(): Promise<void> {
    try {
      const response = await this.getProviders();
      if (response.success && response.data) {
        response.data.forEach(provider => {
          this.providers.set(provider.id, provider);
        });
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  }

  async getProviders(): Promise<APIResponse<UtilityProvider[]>> {
    try {
      const response = await this.integrationLayer.get<UtilityProvider[]>('/providers');
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getProvider(providerId: string): Promise<APIResponse<UtilityProvider>> {
    try {
      const response = await this.integrationLayer.get<UtilityProvider>(`/providers/${providerId}`);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async linkUtilityAccount(
    providerId: string,
    credentials: {
      accountNumber: string;
      customerNumber?: string;
      zipCode: string;
      lastName?: string;
      phone?: string;
      email?: string;
    }
  ): Promise<APIResponse<{
    accountId: string;
    status: 'pending' | 'verified' | 'failed';
    verificationRequired: boolean;
  }>> {
    try {
      const response = await this.integrationLayer.post(`/providers/${providerId}/accounts/link`, credentials);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getUtilityAccounts(): Promise<APIResponse<UtilityAccount[]>> {
    try {
      const response = await this.integrationLayer.get<UtilityAccount[]>('/accounts');
      
      if (response.success && response.data) {
        const accounts = response.data.map((account: any) => ({
          ...account,
          customerSince: new Date(account.customerSince),
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

  async getUtilityAccount(accountId: string): Promise<APIResponse<UtilityAccount>> {
    try {
      const response = await this.integrationLayer.get<UtilityAccount>(`/accounts/${accountId}`);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            customerSince: new Date(response.data.customerSince),
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

  async getBills(accountId: string, options?: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<APIResponse<UtilityBill[]>> {
    try {
      const params: any = {};
      
      if (options?.status) params.status = options.status;
      if (options?.startDate) params.startDate = options.startDate.toISOString();
      if (options?.endDate) params.endDate = options.endDate.toISOString();
      if (options?.limit) params.limit = options.limit;

      const response = await this.integrationLayer.get<UtilityBill[]>(
        `/accounts/${accountId}/bills`,
        { params }
      );
      
      if (response.success && response.data) {
        const bills = response.data.map((bill: any) => ({
          ...bill,
          period: {
            startDate: new Date(bill.period.startDate),
            endDate: new Date(bill.period.endDate)
          },
          dueDate: new Date(bill.dueDate)
        }));
        
        return {
          ...response,
          data: bills
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

  async getBill(accountId: string, billId: string): Promise<APIResponse<UtilityBill>> {
    try {
      const response = await this.integrationLayer.get<UtilityBill>(`/accounts/${accountId}/bills/${billId}`);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            period: {
              startDate: new Date(response.data.period.startDate),
              endDate: new Date(response.data.period.endDate)
            },
            dueDate: new Date(response.data.dueDate)
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

  async makePayment(request: PaymentRequest): Promise<APIResponse<PaymentResponse>> {
    try {
      const payload = {
        ...request,
        scheduledDate: request.scheduledDate?.toISOString()
      };

      const response = await this.integrationLayer.post<PaymentResponse>('/payments', payload);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            processedAt: response.data.processedAt 
              ? new Date(response.data.processedAt) 
              : undefined,
            estimatedCompletion: response.data.estimatedCompletion 
              ? new Date(response.data.estimatedCompletion) 
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
            processedAt: response.data.processedAt 
              ? new Date(response.data.processedAt) 
              : undefined,
            estimatedCompletion: response.data.estimatedCompletion 
              ? new Date(response.data.estimatedCompletion) 
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

  async cancelPayment(paymentId: string): Promise<APIResponse<{ cancelled: boolean; refundAmount?: number }>> {
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

  async getUsageData(
    accountId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      granularity?: 'hourly' | 'daily' | 'weekly' | 'monthly';
    }
  ): Promise<APIResponse<UsageData[]>> {
    try {
      const params: any = {};
      
      if (options?.startDate) params.startDate = options.startDate.toISOString();
      if (options?.endDate) params.endDate = options.endDate.toISOString();
      if (options?.granularity) params.granularity = options.granularity;

      const response = await this.integrationLayer.get<UsageData[]>(
        `/accounts/${accountId}/usage`,
        { params }
      );
      
      if (response.success && response.data) {
        const usageData = response.data.map((data: any) => ({
          ...data,
          period: {
            startDate: new Date(data.period.startDate),
            endDate: new Date(data.period.endDate)
          }
        }));
        
        return {
          ...response,
          data: usageData
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

  async getServiceOutages(providerId?: string): Promise<APIResponse<ServiceOutage[]>> {
    try {
      const url = providerId 
        ? `/providers/${providerId}/outages`
        : '/outages';
      
      const response = await this.integrationLayer.get<ServiceOutage[]>(url);
      
      if (response.success && response.data) {
        const outages = response.data.map((outage: any) => ({
          ...outage,
          startTime: new Date(outage.startTime),
          estimatedEndTime: outage.estimatedEndTime ? new Date(outage.estimatedEndTime) : undefined,
          actualEndTime: outage.actualEndTime ? new Date(outage.actualEndTime) : undefined,
          updates: outage.updates.map((update: any) => ({
            ...update,
            timestamp: new Date(update.timestamp)
          }))
        }));
        
        return {
          ...response,
          data: outages
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

  async reportServiceIssue(
    accountId: string,
    issue: {
      type: 'outage' | 'billing' | 'service_quality' | 'other';
      description: string;
      urgency: 'low' | 'medium' | 'high' | 'emergency';
      contactPhone?: string;
      contactEmail?: string;
    }
  ): Promise<APIResponse<{
    ticketId: string;
    status: 'submitted' | 'under_review' | 'resolved';
    estimatedResponseTime?: Date;
  }>> {
    try {
      const response = await this.integrationLayer.post(`/accounts/${accountId}/issues`, issue);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            estimatedResponseTime: response.data.estimatedResponseTime 
              ? new Date(response.data.estimatedResponseTime) 
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

  async getPaymentHistory(
    accountId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      status?: string;
      limit?: number;
    }
  ): Promise<APIResponse<PaymentResponse[]>> {
    try {
      const params: any = {};
      
      if (options?.startDate) params.startDate = options.startDate.toISOString();
      if (options?.endDate) params.endDate = options.endDate.toISOString();
      if (options?.status) params.status = options.status;
      if (options?.limit) params.limit = options.limit;

      const response = await this.integrationLayer.get<PaymentResponse[]>(
        `/accounts/${accountId}/payments`,
        { params }
      );
      
      if (response.success && response.data) {
        const payments = response.data.map((payment: any) => ({
          ...payment,
          processedAt: payment.processedAt ? new Date(payment.processedAt) : undefined,
          estimatedCompletion: payment.estimatedCompletion ? new Date(payment.estimatedCompletion) : undefined
        }));
        
        return {
          ...response,
          data: payments
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

  async getAccountSummary(accountId: string): Promise<APIResponse<{
    account: UtilityAccount;
    currentBill?: UtilityBill;
    recentPayments: PaymentResponse[];
    usageTrends: {
      direction: string;
      percentage: number;
      monthlyAverage: number;
    };
    nextBillEstimate: {
      amount: number;
      dueDate: Date;
      confidence: number;
    };
  }>> {
    try {
      // Batch multiple requests for efficiency
      const [accountResponse, billsResponse, paymentsResponse] = await Promise.all([
        this.getUtilityAccount(accountId),
        this.getBills(accountId, { limit: 1 }),
        this.getPaymentHistory(accountId, { limit: 5 })
      ]);

      if (!accountResponse.success) {
        return {
          success: false,
          error: 'Failed to fetch account information'
        };
      }

      // Get usage trends and next bill estimate
      const [usageResponse, estimateResponse] = await Promise.all([
        this.getUsageData(accountId, { granularity: 'monthly', limit: 12 }),
        this.integrationLayer.get(`/accounts/${accountId}/estimate`)
      ]);

      const currentBill = billsResponse.success && billsResponse.data?.length > 0 
        ? billsResponse.data[0] 
        : undefined;

      return {
        success: true,
        data: {
          account: accountResponse.data!,
          currentBill,
          recentPayments: paymentsResponse.data || [],
          usageTrends: usageResponse.success ? (usageResponse.data as any)?.trends || {} : {},
          nextBillEstimate: estimateResponse.success ? {
            ...estimateResponse.data,
            dueDate: new Date((estimateResponse.data as any).dueDate)
          } : {
            amount: 0,
            dueDate: new Date(),
            confidence: 0
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async setupAutoPay(
    accountId: string,
    config: {
      paymentMethod: 'bank_transfer' | 'credit_card';
      paymentDetails: any;
      autoPayAmount: 'full_balance' | 'minimum_amount' | 'fixed_amount';
      fixedAmount?: number;
      maxAmount?: number;
      notifyBefore: number; // Days before due date
    }
  ): Promise<APIResponse<{
    autoPayId: string;
    status: 'active' | 'inactive' | 'suspended';
    nextPaymentDate: Date;
  }>> {
    try {
      const response = await this.integrationLayer.post(`/accounts/${accountId}/autopay`, config);
      
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

  // Utility methods
  getMetrics() {
    return this.integrationLayer.getMetrics();
  }

  async healthCheck() {
    return this.integrationLayer.healthCheck();
  }

  updateConfig(newConfig: Partial<UtilityProviderConfig>) {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.apiKey || newConfig.apiSecret || newConfig.environment) {
      const apiConfig: APIConfig = {
        baseURL: this.config.environment === 'production' 
          ? 'https://api.utilityproviders.com/v1' 
          : 'https://sandbox.utilityproviders.com/v1',
        timeout: 25000,
        retryAttempts: 3,
        retryDelay: 1500,
        rateLimitRPS: 20,
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
