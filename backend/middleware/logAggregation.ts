/**
 * Log Aggregation Service
 * Collects, processes, and stores logs for analysis
 */

import { EventEmitter } from 'events';
import { LogLevel, LogCategory, LogContext } from './logger';

export interface AggregatedLog {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  count: number;
  contexts: LogContext[];
}

export interface LogQuery {
  startTime?: Date;
  endTime?: Date;
  level?: LogLevel;
  category?: LogCategory;
  search?: string;
  limit?: number;
}

export class LogAggregator extends EventEmitter {
  private logs: AggregatedLog[] = [];
  private maxLogs: number;
  private aggregationWindow: number;

  constructor(maxLogs = 10000, aggregationWindow = 60000) {
    super();
    this.maxLogs = maxLogs;
    this.aggregationWindow = aggregationWindow;
    this.startAggregation();
  }

  addLog(level: LogLevel, message: string, context?: LogContext): void {
    const log: AggregatedLog = {
      timestamp: new Date(),
      level,
      category: context?.category || LogCategory.APPLICATION,
      message,
      count: 1,
      contexts: context ? [context] : []
    };

    this.logs.push(log);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  query(query: LogQuery): AggregatedLog[] {
    let results = [...this.logs];

    if (query.startTime) {
      results = results.filter(log => log.timestamp >= query.startTime!);
    }

    if (query.endTime) {
      results = results.filter(log => log.timestamp <= query.endTime!);
    }

    if (query.level) {
      results = results.filter(log => log.level === query.level);
    }

    if (query.category) {
      results = results.filter(log => log.category === query.category);
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      results = results.filter(log => log.message.toLowerCase().includes(searchLower));
    }

    if (query.limit) {
      results = results.slice(-query.limit);
    }

    return results;
  }

  private startAggregation(): void {
    setInterval(() => {
      this.aggregateSimilarLogs();
    }, this.aggregationWindow);
  }

  private aggregateSimilarLogs(): void {
    const grouped = new Map<string, AggregatedLog[]>();

    for (const log of this.logs) {
      const key = `${log.level}:${log.category}:${log.message}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(log);
    }

    const aggregated: AggregatedLog[] = [];
    for (const [, logs] of grouped) {
      if (logs.length === 1) {
        aggregated.push(logs[0]);
      } else {
        const first = logs[0];
        aggregated.push({
          ...first,
          count: logs.length,
          contexts: logs.flatMap(l => l.contexts)
        });
      }
    }

    this.logs = aggregated;
  }

  clear(): void {
    this.logs = [];
  }

  getStats() {
    return {
      totalLogs: this.logs.length,
      byLevel: this.groupByLevel(),
      byCategory: this.groupByCategory()
    };
  }

  private groupByLevel() {
    return this.logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + log.count;
      return acc;
    }, {} as Record<LogLevel, number>);
  }

  private groupByCategory() {
    return this.logs.reduce((acc, log) => {
      acc[log.category] = (acc[log.category] || 0) + log.count;
      return acc;
    }, {} as Record<LogCategory, number>);
  }
}

export const createLogAggregator = (maxLogs?: number, aggregationWindow?: number): LogAggregator => {
  return new LogAggregator(maxLogs, aggregationWindow);
};

export default LogAggregator;
