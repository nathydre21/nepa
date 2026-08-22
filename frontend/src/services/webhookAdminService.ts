const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface FailedWebhookDelivery {
  eventId: string;
  webhookId: string;
  eventType: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

class WebhookAdminService {
  private static instance: WebhookAdminService;

  private constructor() {}

  public static getInstance(): WebhookAdminService {
    if (!WebhookAdminService.instance) {
      WebhookAdminService.instance = new WebhookAdminService();
    }
    return WebhookAdminService.instance;
  }

  private getAuthToken(): string {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token found');
    }
    return token;
  }

  private authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.getAuthToken()}`,
    };
  }

  /**
   * List webhook events that have permanently failed (retries exhausted).
   */
  async getFailedDeliveries(limit: number = 50): Promise<FailedWebhookDelivery[]> {
    const response = await fetch(`${API_BASE_URL}/webhooks/admin/failed-deliveries?limit=${limit}`, {
      method: 'GET',
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch failed deliveries: ${response.statusText}`);
    }

    const data = await response.json();
    return data.failedDeliveries;
  }

  /**
   * Retry a single failed delivery. Resets its attempt count and
   * re-runs delivery immediately.
   */
  async retryEvent(webhookId: string, eventId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/webhooks/${webhookId}/events/${eventId}/retry`,
      {
        method: 'POST',
        headers: this.authHeaders(),
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || `Failed to retry event: ${response.statusText}`);
    }
  }
}

export const webhookAdminService = WebhookAdminService.getInstance();
export default webhookAdminService;
