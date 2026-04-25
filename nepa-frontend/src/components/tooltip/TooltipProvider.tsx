import React, { createContext, useContext, useCallback, useState } from 'react';

interface TooltipContextType {
  tooltips: Map<string, boolean>;
  registerTooltip: (id: string, initialState?: boolean) => void;
  unregisterTooltip: (id: string) => void;
  setTooltipOpen: (id: string, open: boolean) => void;
  closeAllTooltips: () => void;
}

const TooltipContext = createContext<TooltipContextType | undefined>(undefined);

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tooltips, setTooltips] = useState<Map<string, boolean>>(new Map());

  const registerTooltip = useCallback((id: string, initialState = false) => {
    setTooltips(prev => new Map(prev).set(id, initialState));
  }, []);

  const unregisterTooltip = useCallback((id: string) => {
    setTooltips(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  }, []);

  const setTooltipOpen = useCallback((id: string, open: boolean) => {
    setTooltips(prev => new Map(prev).set(id, open));
  }, []);

  const closeAllTooltips = useCallback(() => {
    setTooltips(prev => {
      const newMap = new Map(prev);
      for (const key of newMap.keys()) {
        newMap.set(key, false);
      }
      return newMap;
    });
  }, []);

  const value = {
    tooltips,
    registerTooltip,
    unregisterTooltip,
    setTooltipOpen,
    closeAllTooltips,
  };

  return (
    <TooltipContext.Provider value={value}>
      {children}
    </TooltipContext.Provider>
  );
};

export const useTooltipContext = () => {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error('useTooltipContext must be used within a TooltipProvider');
  }
  return context;
};

export default TooltipProvider;
