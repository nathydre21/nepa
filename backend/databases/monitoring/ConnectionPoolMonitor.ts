// Connection pool monitoring for database services
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

export interface PoolMetrics {
  service: string;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalConnections: number;
}

export class ConnectionPoolMonitor {
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

  async getPoolMetrics(serviceName: string): Promise<PoolMetrics> {
    const client = this.clients[serviceName as keyof typeof this.clients];

    try {
      // Query PostgreSQL for connection stats
      if (!client) {
        throw new Error('Database client is null');
      }
      const result = await (client as any).$queryRaw<any[]>`
        SELECT 
          count(*) FILTER (WHERE state = 'active') as active,
          count(*) FILTER (WHERE state = 'idle') as idle,
          count(*) as total
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;

      const stats = result[0];

      return {
        service: serviceName,
        activeConnections: Number(stats.active) || 0,
        idleConnections: Number(stats.idle) || 0,
        waitingRequests: 0, // Would need additional monitoring
        totalConnections: Number(stats.total) || 0,
      };
    } catch (error) {
      console.error(`Error getting pool metrics for ${serviceName}:`, error);
      return {
        service: serviceName,
        activeConnections: 0,
        idleConnections: 0,
        waitingRequests: 0,
        totalConnections: 0,
      };
    }
  }

  async getAllPoolMetrics(): Promise<PoolMetrics[]> {
    const metrics = Object.keys(this.clients).map((service) =>
      this.getPoolMetrics(service)
    );
    return Promise.all(metrics);
  }

  async logPoolMetrics(): Promise<void> {
    const metrics = await this.getAllPoolMetrics();
    console.log('\n📊 Database Connection Pool Metrics:');
    console.table(metrics);
  }

  startMonitoring(intervalMs: number = 60000): NodeJS.Timeout {
    console.log(`🔍 Starting connection pool monitoring (interval: ${intervalMs}ms)`);
    return setInterval(() => this.logPoolMetrics(), intervalMs);
  }
}

export default new ConnectionPoolMonitor();
