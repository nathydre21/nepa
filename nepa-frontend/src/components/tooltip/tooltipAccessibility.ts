export interface TooltipAccessibilityOptions {
  content: string;
  triggerType: 'hover' | 'click' | 'focus' | 'manual';
  isPersistent?: boolean;
  hasIcon?: boolean;
}

export const tooltipAccessibility = {
  /**
   * Get appropriate ARIA attributes for tooltip triggers
   */
  getTriggerProps: (options: TooltipAccessibilityOptions) => {
    const { content, triggerType, isPersistent, hasIcon } = options;
    
    const props: Record<string, string | boolean> = {
      'aria-label': hasIcon ? content : undefined,
      'aria-describedby': isPersistent ? 'tooltip-content' : undefined,
      'tabIndex': triggerType === 'focus' || triggerType === 'click' ? 0 : -1,
    };

    // For non-persistent tooltips, we use aria-label instead of aria-describedby
    if (!isPersistent && !hasIcon) {
      props['aria-label'] = content;
      delete props['aria-describedby'];
    }

    return props;
  },

  /**
   * Get appropriate ARIA attributes for tooltip content
   */
  getContentProps: (options: TooltipAccessibilityOptions) => {
    const { triggerType } = options;
    
    return {
      role: 'tooltip',
      'aria-live': triggerType === 'manual' ? 'polite' : 'assertive',
      'id': 'tooltip-content',
    };
  },

  /**
   * Announce tooltip content to screen readers
   */
  announceTooltip: (content: string, triggerType: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.rate = 1.1;
      window.speechSynthesis.speak(utterance);
    }

    // Also use ARIA live region for non-speech users
    const liveRegion = document.getElementById('tooltip-live-region');
    if (liveRegion) {
      liveRegion.textContent = content;
      setTimeout(() => {
        liveRegion.textContent = '';
      }, 1000);
    }
  },

  /**
   * Get keyboard navigation hints
   */
  getKeyboardHint: (triggerType: string) => {
    switch (triggerType) {
      case 'click':
        return 'Press Enter or Space to toggle tooltip';
      case 'focus':
        return 'Press Tab to focus and show tooltip';
      case 'hover':
        return 'Hover over element to show tooltip';
      default:
        return '';
    }
  },

  /**
   * Check if user prefers reduced motion
   */
  prefersReducedMotion: () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  /**
   * Check if user has high contrast mode enabled
   */
  prefersHighContrast: () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-contrast: high)').matches;
  },

  /**
   * Get appropriate animation classes based on user preferences
   */
  getAnimationClasses: () => {
    const reducedMotion = tooltipAccessibility.prefersReducedMotion();
    const highContrast = tooltipAccessibility.prefersHighContrast();
    
    const classes = [];
    
    if (!reducedMotion) {
      classes.push('tooltip-fade-in');
    } else {
      classes.push('tooltip-no-animation');
    }
    
    if (highContrast) {
      classes.push('tooltip-high-contrast');
    }
    
    return classes.join(' ');
  },

  /**
   * Create live region for screen reader announcements
   */
  createLiveRegion: () => {
    if (typeof document === 'undefined') return;
    
    if (!document.getElementById('tooltip-live-region')) {
      const liveRegion = document.createElement('div');
      liveRegion.id = 'tooltip-live-region';
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      document.body.appendChild(liveRegion);
    }
  },

  /**
   * Handle escape key to close tooltips
   */
  handleEscapeKey: (event: KeyboardEvent, onClose: () => void) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  },

  /**
   * Focus management for tooltip triggers
   */
  manageFocus: (triggerElement: HTMLElement, tooltipElement: HTMLElement) => {
    if (!triggerElement || !tooltipElement) return;

    // Focus trap within tooltip when open
    const focusableElements = tooltipElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }
  },

  /**
   * Get tooltip positioning for better accessibility
   */
  getAccessiblePosition: (
    triggerRect: DOMRect,
    tooltipRect: DOMRect,
    preferredPosition: string
  ) => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.pageXOffset,
      scrollY: window.pageYOffset,
    };

    // Check if preferred position would cause overflow
    const wouldOverflow = (position: string) => {
      switch (position) {
        case 'top':
          return triggerRect.top - tooltipRect.height < 0;
        case 'bottom':
          return triggerRect.bottom + tooltipRect.height > viewport.height;
        case 'left':
          return triggerRect.left - tooltipRect.width < 0;
        case 'right':
          return triggerRect.right + tooltipRect.width > viewport.width;
        default:
          return false;
      }
    };

    // Find best position that doesn't overflow
    const positions = ['top', 'bottom', 'left', 'right'];
    const bestPosition = positions.find(pos => !wouldOverflow(pos)) || preferredPosition;

    return bestPosition;
  },
};

// Initialize live region on module load
if (typeof window !== 'undefined') {
  tooltipAccessibility.createLiveRegion();
}

export default tooltipAccessibility;
