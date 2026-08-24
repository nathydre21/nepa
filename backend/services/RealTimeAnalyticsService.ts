/**
 * RealTimeAnalyticsService — broadcasts live analytics metrics to admin
 * subscribers via the shared SocketServer singleton.
 *
 * The old implementation created its own `socket.io` Server instance.
 * This version delegates all WebSocket I/O to SocketServer.
 */

import { SocketServer, ROOMS, SERVER_EVENTS, CLIENT_EVENTS } from '../SocketServer';
import { AnalyticsService } from './AnalyticsService';

interface RealTimeMetrics {
  timestamp: string;
  totalRevenue: number;
  overdueBills: number;
  pendingBills: number;
  successfulPayments: number;
  failedPayments: number;
  successRate: number;
  todayRevenue: number;
  activeUsers: number;
}

class RealTimeAnalyticsService {
  private analyticsService: AnalyticsService;
  private metricsInterval: NodeJS.Timeout | null = null;
  private readonly BROADCAST_INTERVAL_MS = 30_000; // 30 seconds

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  /**
   * Wire up analytics-specific socket events and start the broadcast loop.
   * Must be called once from server.ts after SocketServer has been initialised.
   */
  initialize(): void {
    const io = SocketServer.getIO();

    io.on('connection', (socket) => {
      // Send a snapshot of current metrics to the newly connected client
      this.fetchMetrics()
        .then((metrics) => socket.emit(SERVER_EVENTS.ANALYTICS_UPDATE, { metrics, timestamp: new Date().toISOString() }))
        .catch((err) => console.error('[RealTimeAnalyticsService] Initial metrics error:', err));

      // Custom date-range request
      socket.on(
        'get_metrics_range',
        async (data: { startDate: string; endDate: string }) => {
          try {
            const start = new Date(data.startDate);
            const end = new Date(data.endDate);
            const metrics = await this.fetchCustomRangeMetrics(start, end);
            socket.emit('metrics_range_response', metrics);
          } catch (err) {
            socket.emit('analytics_error', { message: 'Failed to fetch custom range metrics' });
          }
        }
      );

      // subscribe_analytics / unsubscribe_analytics are handled by SocketServer
      // (it joins/leaves ROOMS.analytics).  We only need to react to the
      // connection event above to send the initial snapshot.
    });

    this.startBroadcast();
  }

  // ─── Metrics fetching ─────────────────────────────────────────────────────

  private async fetchMetrics(): Promise<RealTimeMetrics> {
    const [stats, todayRevenue, userMetrics] = await Promise.all([
      this.analyticsService.getBillingStats(),
      this.analyticsService.getDailyRevenue(1),
      this.analyticsService.getUserMetrics(1),
    ]);

    return {
      timestamp: new Date().toISOString(),
      totalRevenue: Number(stats.totalRevenue),
      overdueBills: stats.overdueBills,
      pendingBills: stats.pendingBills,
      successfulPayments: stats.successfulPayments,
      failedPayments: stats.failedPayments,
      successRate: stats.successRate,
      todayRevenue: todayRevenue.reduce((sum: number, day: any) => sum + day.value, 0),
      activeUsers: userMetrics.activeUsers,
    };
  }

  private async fetchCustomRangeMetrics(startDate: Date, endDate: Date) {
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const [stats, revenueData, userGrowth, paymentTrends] = await Promise.all([
      this.analyticsService.getBillingStats(startDate, endDate),
      this.analyticsService.getDailyRevenue(days, startDate, endDate),
      this.analyticsService.getUserGrowth(days),
      this.analyticsService.getPaymentTrends(days),
    ]);

    return {
      summary: stats,
      charts: { revenue: revenueData, userGrowth, paymentTrends },
      dateRange: { startDate, endDate },
    };
  }

  // ─── Broadcast loop ───────────────────────────────────────────────────────

  private startBroadcast(): void {
    if (this.metricsInterval) clearInterval(this.metricsInterval);

    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.fetchMetrics();
        SocketServer.getInstance().emitAnalyticsUpdate(metrics);
      } catch (err) {
        console.error('[RealTimeAnalyticsService] Broadcast error:', err);
        // TODO: Fix socket.io emit
        // SocketServer.getIO()
        //   .to(ROOMS.analytics)
        //   .emit('analytics_error', { message: 'Failed to fetch real-time metrics' });
      }
    }, this.BROADCAST_INTERVAL_MS);

    // Don't keep the process alive just for the interval
    this.metricsInterval.unref?.();

    console.log(
      `[RealTimeAnalyticsService] Broadcast started (${this.BROADCAST_INTERVAL_MS / 1000}s interval)`
    );
  }

  public stopBroadcast(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      console.log('[RealTimeAnalyticsService] Broadcast stopped');
    }
  }

  /**
   * Trigger an immediate metrics push to all analytics subscribers.
   * Useful after a payment is processed or a bill is generated.
   */
  public async triggerUpdate(): Promise<void> {
    try {
      const metrics = await this.fetchMetrics();
      SocketServer.getInstance().emitAnalyticsUpdate(metrics);
    } catch (err) {
      console.error('[RealTimeAnalyticsService] triggerUpdate error:', err);
    }
  }
}

export default RealTimeAnalyticsService;
