import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { performanceMonitor } from './performanceMonitoring';

export interface UserEvent {
  eventType: 'page_view' | 'click' | 'form_submit' | 'login' | 'logout' | 'purchase' | 'error';
  userId?: string;
  sessionId?: string;
  timestamp: Date;
  properties: Record<string, any>;
  metadata: {
    ip?: string;
    userAgent?: string;
    referrer?: string;
    url?: string;
  };
}

export interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  totalSessions: number;
  averageSessionDuration: number;
  topPages: Array<{ page: string; views: number }>;
  userEvents: UserEvent[];
  conversionRates: Record<string, number>;
  errorRates: Record<string, number>;
}

class AnalyticsService {
  private events: UserEvent[] = [];
  private sessions: Map<string, { startTime: Date; lastActivity: Date; userId?: string }> = new Map();
  private maxEventsHistory: number = 10000;

  trackEvent(eventType: UserEvent['eventType'], properties: Record<string, any> = {}, metadata: Partial<UserEvent['metadata']> = {}, userId?: string): void {
    const event: UserEvent = {
      eventType,
      userId,
      sessionId: this.generateSessionId(userId),
      timestamp: new Date(),
      properties,
      metadata: {
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        referrer: metadata.referrer,
        url: metadata.url
      }
    };

    this.events.push(event);
    
    if (this.events.length > this.maxEventsHistory) {
      this.events = this.events.slice(-this.maxEventsHistory);
    }

    logger.debug('Analytics event tracked', {
      eventType,
      userId,
      sessionId: event.sessionId,
      properties
    });

    if (event.sessionId) {
      this.updateSessionActivity(event.sessionId, userId);
    }
  }

  trackPageView(url: string, userId?: string, metadata?: Partial<UserEvent['metadata']>): void {
    this.trackEvent('page_view', { url }, { ...metadata, url }, userId);
  }

  trackClick(element: string, userId?: string, metadata?: Partial<UserEvent['metadata']>): void {
    this.trackEvent('click', { element }, metadata, userId);
  }

  trackFormSubmit(formName: string, success: boolean, userId?: string, metadata?: Partial<UserEvent['metadata']>): void {
    this.trackEvent('form_submit', { formName, success }, metadata, userId);
  }

  trackLogin(userId: string, method: 'email' | 'wallet' | '2fa', success: boolean, metadata?: Partial<UserEvent['metadata']>): void {
    this.trackEvent('login', { method, success }, metadata, userId);
  }

  trackLogout(userId: string, metadata?: Partial<UserEvent['metadata']>): void {
    this.trackEvent('logout', {}, metadata, userId);
  }

  trackPurchase(amount: number, currency: string, productId?: string, userId?: string, metadata?: Partial<UserEvent['metadata']>): void {
    this.trackEvent('purchase', { amount, currency, productId }, metadata, userId);
  }

  trackError(errorType: string, errorMessage: string, userId?: string, metadata?: Partial<UserEvent['metadata']>): void {
    this.trackEvent('error', { errorType, errorMessage }, metadata, userId);
  }

  private generateSessionId(userId?: string): string {
    if (userId) {
      const existingSession = Array.from(this.sessions.entries()).find(([_, session]) => session.userId === userId);
      if (existingSession) {
        return existingSession[0];
      }
    }
    
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateSessionActivity(sessionId: string, userId?: string): void {
    const now = new Date();
    
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        startTime: now,
        lastActivity: now,
        userId
      });
    } else {
      const session = this.sessions.get(sessionId)!;
      session.lastActivity = now;
      if (userId) {
        session.userId = userId;
      }
    }

    this.cleanupOldSessions();
  }

  private cleanupOldSessions(): void {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < thirtyMinutesAgo) {
        this.sessions.delete(sessionId);
      }
    }
  }

  getAnalyticsData(): AnalyticsData {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentEvents = this.events.filter(event => event.timestamp >= twentyFourHoursAgo);
    const recentSessions = Array.from(this.sessions.values()).filter(session => session.startTime >= twentyFourHoursAgo);
    
    const uniqueUsers = new Set(recentEvents.filter(event => event.userId).map(event => event.userId));
    const pageViews = recentEvents.filter(event => event.eventType === 'page_view');
    const logins = recentEvents.filter(event => event.eventType === 'login');
    const errors = recentEvents.filter(event => event.eventType === 'error');
    
    const pageCounts = pageViews.reduce((acc, event) => {
      const page = event.properties.url || 'unknown';
      acc[page] = (acc[page] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topPages = Object.entries(pageCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([page, views]) => ({ page, views }));

    const successfulLogins = logins.filter(event => event.properties.success).length;
    const totalLogins = logins.length;
    const loginConversionRate = totalLogins > 0 ? (successfulLogins / totalLogins) * 100 : 0;

    const errorCounts = errors.reduce((acc, event) => {
      const errorType = event.properties.errorType || 'unknown';
      acc[errorType] = (acc[errorType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalEvents = recentEvents.length;
    const errorRates = Object.entries(errorCounts).reduce((acc, [errorType, count]) => {
      acc[errorType] = totalEvents > 0 ? (count / totalEvents) * 100 : 0;
      return acc;
    }, {} as Record<string, number>);

    const averageSessionDuration = recentSessions.length > 0 
      ? recentSessions.reduce((sum, session) => sum + (session.lastActivity.getTime() - session.startTime.getTime()), 0) / recentSessions.length / 1000
      : 0;

    return {
      totalUsers: uniqueUsers.size,
      activeUsers: uniqueUsers.size,
      totalSessions: recentSessions.length,
      averageSessionDuration,
      topPages,
      userEvents: recentEvents.slice(-100),
      conversionRates: {
        login: loginConversionRate
      },
      errorRates
    };
  }

  getUserAnalytics(userId: string): {
    totalEvents: number;
    eventTypes: Record<string, number>;
    sessionCount: number;
    lastActivity: Date | null;
  } {
    const userEvents = this.events.filter(event => event.userId === userId);
    const userSessions = Array.from(this.sessions.values()).filter(session => session.userId === userId);
    
    const eventTypes = userEvents.reduce((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const lastActivity = userEvents.length > 0 
      ? userEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0].timestamp
      : null;

    return {
      totalEvents: userEvents.length,
      eventTypes,
      sessionCount: userSessions.length,
      lastActivity
    };
  }

  clearAnalytics(): void {
    this.events = [];
    this.sessions.clear();
    logger.info('Analytics data cleared');
  }
}

export const analyticsService = new AnalyticsService();

export const analyticsMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id;
    const sessionId = analyticsService['generateSessionId'](userId);
    
    analyticsService.trackPageView(req.originalUrl, userId, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      referrer: req.get('Referrer'),
      url: req.originalUrl
    });

    const originalSend = res.send;
    res.send = function(body) {
      if (res.statusCode >= 400) {
        analyticsService.trackError('http_error', `HTTP ${res.statusCode}`, userId, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.originalUrl
        });
      }
      
      return originalSend.call(this, body);
    };

    next();
  };
};

export default analyticsService;
