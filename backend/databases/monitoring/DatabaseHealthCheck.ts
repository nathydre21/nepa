// Database health check utility for all services
import {
  userClient,
  notificationClient,
  documentClient,
  utilityClient,
  paymentClient,
  billingClient,
  analyticsClient,
  webhookClient,
} from '../clients';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  error?: string;
}

export class DatabaseHealthCheck {
  private clients = {
    'user-service': userClient,
    'notification-service': notificationClient,
    'document-service': documentClient,
    'utility-service': utilityClient,
    'payment-service': paymentClient,
    'billing-service': billingClient,
    'analytics-service': analyticsClient,
    'webhook-service': webhookClient,
  };

  async checkService(serviceName: string): Promise<HealthCheckResult> {
    const client = this.clients[serviceName as keyof typeof this.clients];
    const startTime = Date.now();

    try {
      // Simple query to check database connectivity
      if (!client) {
        throw new Error('Database client is null');
      }
      await (client as any).$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;

      return {
        service: serviceName,
        status: 'healthy',
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        service: serviceName,
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkAll(): Promise<HealthCheckResult[]> {
    const checks = Object.keys(this.clients).map((service) =>
      this.checkService(service)
    );
    return Promise.all(checks);
  }

  async getHealthReport(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: HealthCheckResult[];
    timestamp: Date;
  }> {
    const services = await this.checkAll();
    const unhealthyCount = services.filter((s) => s.status === 'unhealthy').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount === 0) {
      overall = 'healthy';
    } else if (unhealthyCount < services.length / 2) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return {
      overall,
      services,
      timestamp: new Date(),
    };
  }
}

export default new DatabaseHealthCheck();
