import React, { useEffect, useRef, useCallback, useState } from 'react';
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';
import { getPerformanceMonitoringService } from '../services/PerformanceMonitoring';

export interface PerformanceHookOptions {
  enabled?: boolean;
  trackComponentRenders?: boolean;
  trackUserInteractions?: boolean;
  sendToAnalytics?: boolean;
}

export interface ComponentMetrics {
  renderCount: number;
  totalRenderTime: number;
  averageRenderTime: number;
  lastRenderTime: number;
}

/**
 * Performance monitoring hook for React components
 * Tracks Core Web Vitals, component performance, and user interactions
 */
export const usePerformanceMonitoring = (options: PerformanceHookOptions = {}) => {
  const {
    enabled = process.env.NODE_ENV === 'production',
    trackComponentRenders = true,
    trackUserInteractions = true,
    sendToAnalytics = true
  } = options;

  const performanceService = getPerformanceMonitoringService();
  const renderStartTime = useRef<number>(0);
  const componentMetrics = useRef<ComponentMetrics>({
    renderCount: 0,
    totalRenderTime: 0,
    averageRenderTime: 0,
    lastRenderTime: 0
  });
  const componentName = useRef<string>('Unknown');

  // Track Core Web Vitals
  useEffect(() => {
    if (!enabled) return;

    const handleWebVital = (metric: any) => {
      // Send to performance service
      performanceService.recordComponentRender(metric.name, metric.value);
      
      // Send to analytics if enabled
      if (sendToAnalytics) {
        console.log(`Web Vital: ${metric.name}`, metric);
        
        // You could send this to your analytics service
        if (window.gtag) {
          window.gtag('event', metric.name, {
            value: metric.value,
            event_category: 'Web Vitals',
            non_interaction: true
          });
        }
      }
    };

    // Measure Core Web Vitals
    getCLS(handleWebVital);
    getFID(handleWebVital);
    getFCP(handleWebVital);
    getLCP(handleWebVital);
    getTTFB(handleWebVital);

  }, [enabled, sendToAnalytics, performanceService]);

  // Track component render performance
  const trackRenderStart = useCallback((name?: string) => {
    if (!trackComponentRenders || !enabled) return;
    
    componentName.current = name || 'Component';
    renderStartTime.current = performance.now();
  }, [trackComponentRenders, enabled]);

  const trackRenderEnd = useCallback(() => {
    if (!trackComponentRenders || !enabled) return;
    
    const renderTime = performance.now() - renderStartTime.current;
    const metrics = componentMetrics.current;
    
    metrics.renderCount++;
    metrics.totalRenderTime += renderTime;
    metrics.averageRenderTime = metrics.totalRenderTime / metrics.renderCount;
    metrics.lastRenderTime = renderTime;
    
    // Record in performance service
    performanceService.recordComponentRender(componentName.current, renderTime);
    
    // Log slow renders
    if (renderTime > 16) { // 16ms is one frame at 60fps
      console.warn(`Slow render detected: ${componentName.current} took ${renderTime.toFixed(2)}ms`);
    }
  }, [trackComponentRenders, enabled, performanceService]);

  // Track user interactions
  const trackInteraction = useCallback((type: string, target?: string) => {
    if (!trackUserInteractions || !enabled) return;
    
    const interaction = {
      type,
      target: target || 'Unknown',
      timestamp: Date.now(),
      duration: 0
    };
    
    console.log('User interaction tracked:', interaction);
  }, [trackUserInteractions, enabled]);

  // Get performance metrics
  const getMetrics = useCallback(() => {
    return {
      component: componentMetrics.current,
      global: performanceService.getMetrics(),
      score: performanceService.getPerformanceScore(),
      recommendations: performanceService.getRecommendations()
    };
  }, [performanceService]);

  return {
    trackRenderStart,
    trackRenderEnd,
    trackInteraction,
    getMetrics,
    componentMetrics: componentMetrics.current
  };
};

/**
 * Higher-order component for performance monitoring
 */
export const withPerformanceMonitoring = <P extends object>(
  Component: React.ComponentType<P>,
  options: PerformanceHookOptions & { componentName?: string } = {}
) => {
  const WrappedComponent = (props: P) => {
    const { trackRenderStart, trackRenderEnd } = usePerformanceMonitoring(options);
    
    useEffect(() => {
      trackRenderStart(options.componentName || Component.name);
      
      return () => {
        trackRenderEnd();
      };
    });
    
    return React.createElement(Component, props);
  };
  
  WrappedComponent.displayName = `withPerformanceMonitoring(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

/**
 * Hook for monitoring page performance
 */
export const usePagePerformance = (pageName: string) => {
  const { trackRenderStart, trackRenderEnd, getMetrics } = usePerformanceMonitoring();
  const pageLoadTime = useRef<number>(0);

  useEffect(() => {
    trackRenderStart(pageName);
    pageLoadTime.current = performance.now();
    
    return () => {
      trackRenderEnd();
      const totalTime = performance.now() - pageLoadTime.current;
      console.log(`Page ${pageName} load time: ${totalTime.toFixed(2)}ms`);
    };
  }, [pageName, trackRenderStart, trackRenderEnd]);

  return {
    pageLoadTime: pageLoadTime.current,
    getMetrics
  };
};

/**
 * Hook for monitoring network performance
 */
export const useNetworkPerformance = () => {
  const [networkInfo, setNetworkInfo] = useState({
    effectiveType: '4g',
    downlink: 10,
    rtt: 100,
    saveData: false
  });

  useEffect(() => {
    const updateNetworkInfo = () => {
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        setNetworkInfo({
          effectiveType: connection.effectiveType || '4g',
          downlink: connection.downlink || 10,
          rtt: connection.rtt || 100,
          saveData: connection.saveData || false
        });
      }
    };

    updateNetworkInfo();
    
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection.addEventListener('change', updateNetworkInfo);
      
      return () => {
        connection.removeEventListener('change', updateNetworkInfo);
      };
    }
  }, []);

  const isSlowConnection = networkInfo.effectiveType === 'slow-2g' || 
                          networkInfo.effectiveType === '2g' ||
                          networkInfo.saveData;

  return {
    networkInfo,
    isSlowConnection
  };
};

/**
 * Hook for monitoring memory usage
 */
export const useMemoryMonitoring = () => {
  const [memoryInfo, setMemoryInfo] = useState({
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    jsHeapSizeLimit: 0
  });

  const updateMemoryInfo = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      setMemoryInfo({
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      });
    }
  }, []);

  useEffect(() => {
    updateMemoryInfo();
    
    const interval = setInterval(updateMemoryInfo, 5000); // Update every 5 seconds
    
    return () => clearInterval(interval);
  }, [updateMemoryInfo]);

  const memoryUsagePercentage = memoryInfo.jsHeapSizeLimit > 0 
    ? (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100 
    : 0;

  const isHighMemoryUsage = memoryUsagePercentage > 80;

  return {
    memoryInfo,
    memoryUsagePercentage,
    isHighMemoryUsage,
    updateMemoryInfo
  };
};

export default usePerformanceMonitoring;
