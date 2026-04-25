export interface LoadingAnnouncement {
  message: string;
  priority?: 'polite' | 'assertive';
  delay?: number;
}

export class LoadingAccessibilityManager {
  private announcementQueue: LoadingAnnouncement[] = [];
  private isAnnouncing = false;
  private liveRegion: HTMLElement | null = null;

  constructor() {
    this.createLiveRegion();
  }

  private createLiveRegion(): void {
    if (typeof document === 'undefined') return;

    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = 'sr-only';
    document.body.appendChild(this.liveRegion);
  }

  public announceLoading(announcement: LoadingAnnouncement): void {
    if (!this.liveRegion) return;

    this.announcementQueue.push(announcement);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isAnnouncing || this.announcementQueue.length === 0) return;

    this.isAnnouncing = true;

    while (this.announcementQueue.length > 0) {
      const announcement = this.announcementQueue.shift();
      if (!announcement || !this.liveRegion) continue;

      // Set the appropriate aria-live value
      this.liveRegion.setAttribute('aria-live', announcement.priority || 'polite');

      // Clear previous content
      this.liveRegion.textContent = '';

      // Add delay if specified
      if (announcement.delay && announcement.delay > 0) {
        await this.delay(announcement.delay);
      }

      // Announce the message
      this.liveRegion.textContent = announcement.message;

      // Wait for screen reader to process
      await this.delay(100);
    }

    this.isAnnouncing = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public announceLoadingStart(context?: string): void {
    this.announceLoading({
      message: context ? `Loading ${context}...` : 'Loading...',
      priority: 'polite'
    });
  }

  public announceLoadingProgress(current: number, total: number, context?: string): void {
    const percentage = Math.round((current / total) * 100);
    this.announceLoading({
      message: context 
        ? `${context}: ${percentage}% complete`
        : `${percentage}% complete`,
      priority: 'polite'
    });
  }

  public announceLoadingComplete(context?: string): void {
    this.announceLoading({
      message: context ? `${context} loaded successfully` : 'Loading complete',
      priority: 'assertive'
    });
  }

  public announceLoadingError(error: string, context?: string): void {
    this.announceLoading({
      message: context 
        ? `Error loading ${context}: ${error}`
        : `Error: ${error}`,
      priority: 'assertive'
    });
  }

  public cleanup(): void {
    if (this.liveRegion && this.liveRegion.parentNode) {
      this.liveRegion.parentNode.removeChild(this.liveRegion);
      this.liveRegion = null;
    }
  }
}

// Singleton instance
export const loadingAccessibility = new LoadingAccessibilityManager();

export interface LoadingFocusTrap {
  element: HTMLElement;
  previousFocus: HTMLElement | null;
  restoreFocus: () => void;
}

export class LoadingFocusManager {
  private focusTraps: Set<LoadingFocusTrap> = new Set();

  public trapFocus(element: HTMLElement): LoadingFocusTrap {
    const previousFocus = document.activeElement as HTMLElement;
    
    // Move focus to the loading element
    element.focus();

    const trap: LoadingFocusTrap = {
      element,
      previousFocus,
      restoreFocus: () => {
        this.focusTraps.delete(trap);
        if (previousFocus && previousFocus.focus) {
          previousFocus.focus();
        }
      }
    };

    this.focusTraps.add(trap);
    return trap;
  }

  public releaseFocus(trap: LoadingFocusTrap): void {
    trap.restoreFocus();
  }

  public releaseAllFocus(): void {
    this.focusTraps.forEach(trap => trap.restoreFocus());
    this.focusTraps.clear();
  }
}

export const loadingFocusManager = new LoadingFocusManager();

export interface LoadingKeyboardNavigation {
  handleKeyDown: (event: KeyboardEvent) => void;
  cleanup: () => void;
}

export class LoadingKeyboardManager {
  private handlers: Map<HTMLElement, LoadingKeyboardNavigation> = new Map();

  public addKeyboardNavigation(
    element: HTMLElement,
    onEscape?: () => void,
    onEnter?: () => void
  ): LoadingKeyboardNavigation {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          if (onEscape) {
            event.preventDefault();
            onEscape();
          }
          break;
        case 'Enter':
        case ' ':
          if (onEnter) {
            event.preventDefault();
            onEnter();
          }
          break;
      }
    };

    element.addEventListener('keydown', handleKeyDown);

    const navigation: LoadingKeyboardNavigation = {
      handleKeyDown,
      cleanup: () => {
        element.removeEventListener('keydown', handleKeyDown);
        this.handlers.delete(element);
      }
    };

    this.handlers.set(element, navigation);
    return navigation;
  }

  public removeKeyboardNavigation(element: HTMLElement): void {
    const navigation = this.handlers.get(element);
    if (navigation) {
      navigation.cleanup();
    }
  }

  public cleanup(): void {
    this.handlers.forEach(navigation => navigation.cleanup());
    this.handlers.clear();
  }
}

export const loadingKeyboardManager = new LoadingKeyboardManager();

// Utility functions for common loading accessibility patterns
export const createAccessibleLoadingProps = (
  isLoading: boolean,
  label?: string,
  description?: string
) => ({
  role: 'status' as const,
  'aria-live': 'polite' as const,
  'aria-busy': isLoading,
  'aria-label': label || (isLoading ? 'Loading' : undefined),
  'aria-describedby': description ? undefined : undefined
});

export const createAccessibleProgressProps = (
  value: number,
  max: number,
  label?: string
) => ({
  role: 'progressbar' as const,
  'aria-valuenow': value,
  'aria-valuemin': 0,
  'aria-valuemax': max,
  'aria-label': label || 'Progress'
});

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const getLoadingAnimationClass = (baseClass: string): string => {
  return prefersReducedMotion() ? baseClass.replace('animate-', '') : baseClass;
};
