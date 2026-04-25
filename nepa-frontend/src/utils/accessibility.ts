// Accessibility utilities for WCAG 2.1 AA compliance

/**
 * Generates a unique ID for accessibility purposes
 */
export const generateId = (prefix: string = 'id'): string => {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * ARIA label generators
 */
export const ariaLabels = {
  // Navigation
  menuToggle: 'Toggle navigation menu',
  themeToggle: 'Toggle color theme between light, dark, and system preference',
  
  // Dashboard
  totalSpent: 'Total amount spent on utility bills',
  avgMonthlyBill: 'Average monthly utility bill amount',
  pendingBills: 'Number of pending utility bills',
  successRate: 'Percentage of successful utility payments',
  
  // Charts
  usageChart: 'Monthly utility consumption and cost chart',
  budgetChart: 'Budget allocation and spending overview',
  consumptionTrend: 'Daily consumption pattern chart',
  
  // Forms
  searchInput: 'Search payments by meter ID or payment type',
  filterSelect: 'Filter payments by status',
  
  // Tables
  paymentTable: 'Payment history table',
  sortColumn: 'Sort table by this column',
  
  // Interactive elements
  expandDetails: 'Expand payment details',
  collapseDetails: 'Collapse payment details',
  viewMore: 'View more payment details',
};

/**
 * Role definitions for landmarks
 */
export const landmarkRoles = {
  main: 'main',
  navigation: 'navigation',
  banner: 'banner',
  contentinfo: 'contentinfo',
  search: 'search',
  complementary: 'complementary',
  region: 'region',
};

/**
 * Common ARIA attributes
 */
export const getAriaAttributes = {
  // For expandable content
  expanded: (isExpanded: boolean) => ({ 'aria-expanded': isExpanded.toString() }),
  
  // For selected items
  selected: (isSelected: boolean) => ({ 'aria-selected': isSelected.toString() }),
  
  // For disabled elements
  disabled: (isDisabled: boolean) => ({ 'aria-disabled': isDisabled.toString() }),
  
  // For required fields
  required: (isRequired: boolean) => ({ 'aria-required': isRequired.toString() }),
  
  // For invalid fields
  invalid: (isInvalid: boolean) => ({ 'aria-invalid': isInvalid.toString() }),
  
  // For busy elements
  busy: (isBusy: boolean) => ({ 'aria-busy': isBusy.toString() }),
};

/**
 * Keyboard navigation helpers
 */
export const keyboardKeys = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
};

/**
 * Focus management utilities
 */
export const focusManagement = {
  /**
   * Trap focus within a container
   */
  trapFocus: (container: HTMLElement) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key === keyboardKeys.TAB) {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };
    
    container.addEventListener('keydown', handleTabKey);
    
    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  },
  
  /**
   * Set focus to an element safely
   */
  setFocus: (element: HTMLElement | null) => {
    if (element) {
      requestAnimationFrame(() => {
        element.focus();
      });
    }
  },
};

/**
 * Screen reader announcements
 */
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

/**
 * Color contrast utilities
 */
export const colorContrast = {
  /**
   * Check if text meets WCAG AA contrast requirements
   */
  meetsAA: (foreground: string, background: string, fontSize: number = 16): boolean => {
    // This is a simplified check - in production, use a proper contrast calculation library
    const contrast = calculateContrast(foreground, background);
    const threshold = fontSize >= 18 ? 3 : 4.5;
    return contrast >= threshold;
  },
  
  /**
   * Get appropriate text color based on background
   */
  getTextColor: (backgroundColor: string): 'light' | 'dark' => {
    // Simplified logic - use proper color analysis in production
    const rgb = hexToRgb(backgroundColor);
    if (!rgb) return 'dark';
    
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5 ? 'dark' : 'light';
  },
};

/**
 * Helper functions (simplified versions - use proper libraries in production)
 */
function calculateContrast(foreground: string, background: string): number {
  // Simplified contrast calculation
  const fgRgb = hexToRgb(foreground);
  const bgRgb = hexToRgb(background);
  
  if (!fgRgb || !bgRgb) return 1;
  
  const fgLuminance = calculateLuminance(fgRgb);
  const bgLuminance = calculateLuminance(bgRgb);
  
  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);
  
  return (lighter + 0.05) / (darker + 0.05);
}

function calculateLuminance(rgb: { r: number; g: number; b: number }): number {
  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

/**
 * Skip link functionality
 */
export const createSkipLink = (targetId: string, text: string = 'Skip to main content'): HTMLElement => {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = text;
  skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-primary text-primary-foreground px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-ring z-50';
  skipLink.setAttribute('aria-label', text);
  
  return skipLink;
};

/**
 * Reduced motion detection
 */
export const prefersReducedMotion = (): boolean => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * High contrast mode detection
 */
export const prefersHighContrast = (): boolean => {
  return window.matchMedia('(prefers-contrast: high)').matches;
};

/**
 * Empty state specific accessibility utilities
 */
export const emptyStateAccessibility = {
  /**
   * Generate appropriate ARIA labels for empty states
   */
  getAriaLabel: (type: string, entity?: string): string => {
    const labels = {
      'no-data': entity ? `No ${entity} available` : 'No data available',
      'no-results': 'No search results found',
      'no-connection': 'Connection to server lost',
      'error': 'An error occurred',
      'loading': 'Loading content',
      'custom': 'Information'
    };
    return labels[type as keyof typeof labels] || 'Information';
  },

  /**
   * Generate descriptive messages for screen readers
   */
  getDescriptiveMessage: (type: string, details?: {
    entity?: string;
    searchTerm?: string;
    hasFilters?: boolean;
    error?: string;
  }): string => {
    switch (type) {
      case 'no-data':
        return details?.entity 
          ? `You have no ${details.entity} yet. Consider adding your first ${details.entity.slice(0, -1)} to get started.`
          : 'No data is currently available.';
      
      case 'no-results':
        if (details?.searchTerm && details?.hasFilters) {
          return `No results found for "${details.searchTerm}" with current filters applied.`;
        } else if (details?.searchTerm) {
          return `No results found for "${details.searchTerm}". Try different search terms.`;
        } else if (details?.hasFilters) {
          return 'No items match your current filters. Try adjusting or clearing your filters.';
        }
        return 'No results found. Try adjusting your search or filters.';
      
      case 'no-connection':
        return details?.error 
          ? `Connection error: ${details.error}. Please check your internet connection and try again.`
          : 'Unable to connect to the server. Please check your internet connection and try again.';
      
      case 'error':
        return details?.error 
          ? `An error occurred: ${details.error}. Please try again or contact support if the problem persists.`
          : 'An unexpected error occurred. Please try again.';
      
      case 'loading':
        return 'Content is currently loading. Please wait.';
      
      default:
        return 'Information';
    }
  },

  /**
   * Get appropriate role for empty state
   */
  getRole: (type: string): 'status' | 'alert' | 'region' => {
    const roles = {
      'no-data': 'status',
      'no-results': 'status',
      'no-connection': 'alert',
      'error': 'alert',
      'loading': 'status',
      'custom': 'region'
    };
    return roles[type as keyof typeof roles] || 'status';
  },

  /**
   * Get appropriate aria-live setting
   */
  getAriaLive: (type: string): 'polite' | 'assertive' => {
    const liveSettings = {
      'no-data': 'polite',
      'no-results': 'polite',
      'no-connection': 'assertive',
      'error': 'assertive',
      'loading': 'polite',
      'custom': 'polite'
    };
    return liveSettings[type as keyof typeof liveSettings] || 'polite';
  },

  /**
   * Announce empty state changes to screen readers
   */
  announceEmptyState: (type: string, details?: {
    entity?: string;
    searchTerm?: string;
    hasFilters?: boolean;
    error?: string;
  }) => {
    const message = emptyStateAccessibility.getDescriptiveMessage(type, details);
    const priority = emptyStateAccessibility.getAriaLive(type);
    announceToScreenReader(message, priority);
  },

  /**
   * Generate keyboard navigation hints for empty state actions
   */
  getKeyboardHint: (hasPrimaryAction: boolean, hasSecondaryAction: boolean): string => {
    if (hasPrimaryAction && hasSecondaryAction) {
      return 'Press Tab to navigate to available actions, or press Enter to activate the primary action.';
    } else if (hasPrimaryAction) {
      return 'Press Tab to navigate to the action button, or press Enter to activate it.';
    } else if (hasSecondaryAction) {
      return 'Press Tab to navigate to the action button.';
    }
    return 'Press Tab to continue navigating the page.';
  }
};
