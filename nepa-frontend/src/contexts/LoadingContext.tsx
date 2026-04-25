import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
  max?: number;
}

export interface LoadingContextType {
  globalLoading: LoadingState;
  setGlobalLoading: (loading: Partial<LoadingState>) => void;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
  updateProgress: (progress: number, max?: number) => void;
  withLoading: <T>(promise: Promise<T>, message?: string) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export interface LoadingProviderProps {
  children: ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  const [globalLoading, setGlobalLoadingState] = useState<LoadingState>({
    isLoading: false,
    message: '',
    progress: 0,
    max: 100
  });

  const setGlobalLoading = useCallback((loading: Partial<LoadingState>) => {
    setGlobalLoadingState(prev => ({ ...prev, ...loading }));
  }, []);

  const startLoading = useCallback((message?: string) => {
    setGlobalLoadingState({
      isLoading: true,
      message: message || 'Loading...',
      progress: 0,
      max: 100
    });
  }, []);

  const stopLoading = useCallback(() => {
    setGlobalLoadingState({
      isLoading: false,
      message: undefined,
      progress: undefined,
      max: undefined
    });
  }, []);

  const updateProgress = useCallback((progress: number, max?: number) => {
    setGlobalLoadingState(prev => ({
      ...prev,
      progress,
      max: max || prev.max
    }));
  }, []);

  const withLoading = useCallback(async <T,>(promise: Promise<T>, message?: string): Promise<T> => {
    startLoading(message);
    try {
      const result = await promise;
      return result;
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  const value: LoadingContextType = {
    globalLoading,
    setGlobalLoading,
    startLoading,
    stopLoading,
    updateProgress,
    withLoading
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = (): LoadingContextType => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

export default LoadingContext;
