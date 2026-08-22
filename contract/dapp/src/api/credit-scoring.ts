import { IntegrationLayer, APIConfig, APIResponse } from './integration-layer';

export interface CreditScoreRequest {
  customerId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ssn?: string; // Last 4 digits for security
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  email: string;
  phone: string;
  annualIncome: number;
  employmentStatus: 'employed' | 'self-employed' | 'unemployed' | 'student' | 'retired';
  employerName?: string;
  employmentDuration?: number; // in months
}

export interface CreditScoreResponse {
  score: number;
  scoreRange: {
    min: number;
    max: number;
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    description: string;
    weight: number;
  }>;
  recommendations: string[];
  lastUpdated: Date;
  confidence: number; // 0-1
}

export interface CreditReport {
  customerId: string;
  reportId: string;
  creditScore: CreditScoreResponse;
  paymentHistory: Array<{
    date: Date;
    type: 'on_time' | 'late' | 'missed';
    amount: number;
    creditor: string;
  }>;
  accounts: Array<{
    id: string;
    type: 'credit_card' | 'loan' | 'mortgage' | 'line_of_credit';
    creditor: string;
    balance: number;
    limit?: number;
    status: 'open' | 'closed' | 'charged_off';
    paymentHistory: string; // e.g., "AAAAA" for 5 months of on-time payments
  }>;
  inquiries: Array<{
    date: Date;
    type: 'hard' | 'soft';
    creditor: string;
    purpose: string;
  }>;
  publicRecords: Array<{
    type: 'bankruptcy' | 'lien' | 'judgment';
    date: Date;
    status: 'active' | 'resolved';
    amount?: number;
  }>;
  generatedAt: Date;
}

export interface FraudDetectionRequest {
  customerId: string;
  transactionDetails: {
    amount: number;
    currency: string;
    merchant: string;
    location: {
      ip?: string;
      device?: string;
      geolocation?: {
        latitude: number;
        longitude: number;
      };
    };
    timestamp: Date;
  };
  customerBehavior: {
    averageTransactionAmount: number;
    transactionFrequency: number;
    usualLocations: string[];
    usualMerchants: string[];
  };
}

export interface FraudDetectionResponse {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  factors: Array<{
    factor: string;
    impact: number;
    description: string;
  }>;
  recommendation: 'approve' | 'review' | 'decline';
  reason: string;
}

export interface CreditScoringConfig {
  apiKey: string;
  apiSecret: string;
  environment: 'sandbox' | 'production';
  webhookUrl: string;
  defaultCurrency: string;
  scoreModel: 'fico' | 'vantage' | 'custom';
}

export class CreditScoringService {
  private integrationLayer: IntegrationLayer;
  private config: CreditScoringConfig;

  constructor(config: CreditScoringConfig) {
    this.config = config;
    
    const apiConfig: APIConfig = {
      baseURL: config.environment === 'production' 
        ? 'https://api.creditscore.com/v2' 
        : 'https://sandbox.creditscore.com/v2',
      timeout: 45000, // Credit scoring can take longer
      retryAttempts: 2,
      retryDelay: 2000,
      rateLimitRPS: 5, // More restrictive for sensitive data
      auth: {
        type: 'apikey',
        credentials: {
          apiKey: config.apiKey,
          apiSecret: config.apiSecret
        }
      },
      headers: {
        'X-Client-Version': '1.0.0',
        'X-Environment': config.environment,
        'X-Score-Model': config.scoreModel
      }
    };

    this.integrationLayer = new IntegrationLayer(
      apiConfig,
      {
        windowMs: 60000,
        maxRequests: 300, // 5 requests per second
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      },
      {
        enabled: true,
        ttl: 1800000, // 30 minutes for credit data
        maxSize: 200,
        strategy: 'lru'
      }
    );

    this.setupWebhooks();
  }

  private setupWebhooks(): void {
    this.integrationLayer.addWebhook('credit-events', {
      url: this.config.webhookUrl,
      secret: this.config.apiSecret,
      events: ['score_updated', 'fraud_detected', 'report_generated'],
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 3000
      }
    });
  }

  async getCreditScore(request: CreditScoreRequest): Promise<APIResponse<CreditScoreResponse>> {
    try {
      // Validate request data
      this.validateCreditScoreRequest(request);

      const response = await this.integrationLayer.post<CreditScoreResponse>('/score', request);
      
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

  async getCreditReport(customerId: string): Promise<APIResponse<CreditReport>> {
    try {
      const response = await this.integrationLayer.get<CreditReport>(`/report/${customerId}`);
      
      if (response.success && response.data) {
        const report = response.data;
        
        return {
          ...response,
          data: {
            ...report,
            creditScore: {
              ...report.creditScore,
              lastUpdated: new Date(report.creditScore.lastUpdated)
            },
            paymentHistory: report.paymentHistory.map(payment => ({
              ...payment,
              date: new Date(payment.date)
            })),
            inquiries: report.inquiries.map(inquiry => ({
              ...inquiry,
              date: new Date(inquiry.date)
            })),
            publicRecords: report.publicRecords.map(record => ({
              ...record,
              date: new Date(record.date)
            })),
            generatedAt: new Date(report.generatedAt)
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

  async detectFraud(request: FraudDetectionRequest): Promise<APIResponse<FraudDetectionResponse>> {
    try {
      const payload = {
        ...request,
        transactionDetails: {
          ...request.transactionDetails,
          timestamp: request.transactionDetails.timestamp.toISOString()
        }
      };

      const response = await this.integrationLayer.post<FraudDetectionResponse>('/fraud/detect', payload);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async updateCreditProfile(
    customerId: string,
    updates: Partial<CreditScoreRequest>
  ): Promise<APIResponse<{ updated: boolean; newScore?: CreditScoreResponse }>> {
    try {
      const response = await this.integrationLayer.put(`/profile/${customerId}`, updates);
      
      if (response.success && response.data?.newScore) {
        return {
          ...response,
          data: {
            ...response.data,
            newScore: {
              ...response.data.newScore,
              lastUpdated: new Date(response.data.newScore.lastUpdated)
            }
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

  async getScoreHistory(customerId: string, options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<APIResponse<Array<{
    date: Date;
    score: number;
    grade: string;
    factors: string[];
  }>>> {
    try {
      const params: any = {};
      
      if (options?.startDate) params.startDate = options.startDate.toISOString();
      if (options?.endDate) params.endDate = options.endDate.toISOString();
      if (options?.limit) params.limit = options.limit;

      const response = await this.integrationLayer.get(`/history/${customerId}`, { params });
      
      if (response.success && response.data) {
        const history = response.data.map((item: any) => ({
          ...item,
          date: new Date(item.date)
        }));
        
        return {
          ...response,
          data: history
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

  async getScoreFactors(customerId: string): Promise<APIResponse<{
    positiveFactors: Array<{
      factor: string;
      description: string;
      impact: number;
    }>;
    negativeFactors: Array<{
      factor: string;
      description: string;
      impact: number;
    }>;
    recommendations: Array<{
      category: string;
      action: string;
      potentialImpact: number;
    }>;
  }>> {
    try {
      const response = await this.integrationLayer.get(`/factors/${customerId}`);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async simulateScoreChange(
    customerId: string,
    scenarios: Array<{
      type: 'payment_history' | 'credit_utilization' | 'new_credit' | 'credit_age' | 'credit_mix';
      change: number; // Percentage or absolute value depending on type
      description: string;
    }>
  ): Promise<APIResponse<Array<{
    scenario: string;
    currentScore: number;
    projectedScore: number;
    scoreChange: number;
    timeframe: string;
    confidence: number;
  }>>> {
    try {
      const response = await this.integrationLayer.post(`/simulate/${customerId}`, { scenarios });
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async disputeItem(
    customerId: string,
    itemType: 'account' | 'inquiry' | 'public_record',
    itemId: string,
    reason: string,
    description: string,
    supportingDocuments?: string[]
  ): Promise<APIResponse<{
    disputeId: string;
    status: 'submitted' | 'under_review' | 'resolved';
    estimatedResolutionDate: Date;
  }>> {
    try {
      const payload = {
        itemType,
        itemId,
        reason,
        description,
        supportingDocuments
      };

      const response = await this.integrationLayer.post(`/dispute/${customerId}`, payload);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            estimatedResolutionDate: new Date(response.data.estimatedResolutionDate)
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

  async getDisputeStatus(customerId: string, disputeId: string): Promise<APIResponse<{
    disputeId: string;
    status: string;
    resolutionDate?: Date;
    outcome?: 'upheld' | 'removed' | 'updated';
    explanation?: string;
  }>> {
    try {
      const response = await this.integrationLayer.get(`/dispute/${customerId}/${disputeId}`);
      
      if (response.success && response.data) {
        return {
          ...response,
          data: {
            ...response.data,
            resolutionDate: response.data.resolutionDate 
              ? new Date(response.data.resolutionDate) 
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

  async getCreditEducation(customerId: string): Promise<APIResponse<{
    currentLevel: 'beginner' | 'intermediate' | 'advanced';
    modules: Array<{
      id: string;
      title: string;
      description: string;
      duration: number; // in minutes
      completed: boolean;
      score?: number;
    }>;
    recommendations: Array<{
      type: 'article' | 'video' | 'tool';
      title: string;
      url: string;
      relevanceScore: number;
    }>;
  }>> {
    try {
      const response = await this.integrationLayer.get(`/education/${customerId}`);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getMonitoringAlerts(customerId: string): Promise<APIResponse<Array<{
    id: string;
    type: 'score_change' | 'new_account' | 'hard_inquiry' | 'late_payment' | 'fraud_alert';
    severity: 'low' | 'medium' | 'high';
    message: string;
    date: Date;
    actionRequired: boolean;
    details?: Record<string, any>;
  }>>> {
    try {
      const response = await this.integrationLayer.get(`/alerts/${customerId}`);
      
      if (response.success && response.data) {
        const alerts = response.data.map((alert: any) => ({
          ...alert,
          date: new Date(alert.date)
        }));
        
        return {
          ...response,
          data: alerts
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

  private validateCreditScoreRequest(request: CreditScoreRequest): void {
    const required = ['customerId', 'firstName', 'lastName', 'dateOfBirth', 'address', 'email', 'phone'];
    const missing = required.filter(field => !request[field as keyof CreditScoreRequest]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      throw new Error('Invalid email format');
    }

    // Validate date of birth (must be at least 18 years old)
    const dob = new Date(request.dateOfBirth);
    const ageDiff = Date.now() - dob.getTime();
    const age = Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365));
    
    if (age < 18) {
      throw new Error('Customer must be at least 18 years old');
    }

    // Validate income
    if (request.annualIncome < 0) {
      throw new Error('Annual income cannot be negative');
    }
  }

  // Utility methods
  getMetrics() {
    return this.integrationLayer.getMetrics();
  }

  async healthCheck() {
    return this.integrationLayer.healthCheck();
  }

  updateConfig(newConfig: Partial<CreditScoringConfig>) {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.apiKey || newConfig.apiSecret || newConfig.environment || newConfig.scoreModel) {
      const apiConfig: APIConfig = {
        baseURL: this.config.environment === 'production' 
          ? 'https://api.creditscore.com/v2' 
          : 'https://sandbox.creditscore.com/v2',
        timeout: 45000,
        retryAttempts: 2,
        retryDelay: 2000,
        rateLimitRPS: 5,
        auth: {
          type: 'apikey',
          credentials: {
            apiKey: this.config.apiKey,
            apiSecret: this.config.apiSecret
          }
        },
        headers: {
          'X-Client-Version': '1.0.0',
          'X-Environment': this.config.environment,
          'X-Score-Model': this.config.scoreModel
        }
      };
      
      this.integrationLayer.updateConfig(apiConfig);
    }
  }
}
