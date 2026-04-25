import React, { useEffect, useRef } from 'react';
import { emptyStateAccessibility, prefersReducedMotion } from '../utils/accessibility';

export interface EmptyStateProps {
  /** The type of empty state to display */
  type?: 'no-data' | 'no-results' | 'no-connection' | 'error' | 'loading' | 'custom';
  /** Main title/headline for the empty state */
  title: string;
  /** Detailed description or message */
  description?: string;
  /** Icon to display (can be emoji, SVG, or React component) */
  icon?: React.ReactNode;
  /** Primary action button */
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Additional custom content */
  children?: React.ReactNode;
  /** Custom className for styling */
  className?: string;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Whether to show animation */
  animated?: boolean;
  /** Entity name for better accessibility (e.g., 'transactions', 'notifications') */
  entity?: string;
  /** Search term for no-results state */
  searchTerm?: string;
  /** Whether filters are applied */
  hasFilters?: boolean;
  /** Error message for error states */
  error?: string;
}

const defaultIcons = {
  'no-data': '📋',
  'no-results': '🔍',
  'no-connection': '📡',
  'error': '⚠️',
  'loading': '⏳',
  'custom': '📄'
};

const sizeClasses = {
  small: 'py-8 px-4',
  medium: 'py-12 px-6',
  large: 'py-16 px-8'
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'no-data',
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  children,
  className = '',
  size = 'medium',
  animated = true,
  entity,
  searchTerm,
  hasFilters,
  error
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayIcon = icon || defaultIcons[type];
  const shouldAnimate = animated && !prefersReducedMotion();
  const animationClass = shouldAnimate ? 'animate-fade-in' : '';

  // Generate accessibility attributes
  const ariaLabel = emptyStateAccessibility.getAriaLabel(type, entity);
  const role = emptyStateAccessibility.getRole(type);
  const ariaLive = emptyStateAccessibility.getAriaLive(type);
  const keyboardHint = emptyStateAccessibility.getKeyboardHint(
    !!primaryAction,
    !!secondaryAction
  );

  // Announce empty state to screen readers when it appears
  useEffect(() => {
    if (containerRef.current) {
      emptyStateAccessibility.announceEmptyState(type, {
        entity,
        searchTerm,
        hasFilters,
        error
      });
    }
  }, [type, entity, searchTerm, hasFilters, error]);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && primaryAction && !primaryAction.disabled) {
      primaryAction.onClick();
      event.preventDefault();
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col items-center justify-center text-center ${sizeClasses[size]} ${animationClass} ${className}`}
      role={role}
      aria-live={ariaLive}
      aria-label={ariaLabel}
      tabIndex={primaryAction ? 0 : -1}
      onKeyDown={handleKeyDown}
    >
      {/* Icon */}
      {displayIcon && (
        <div className="mb-4 text-6xl empty-state-icon" aria-hidden="true">
          {displayIcon}
        </div>
      )}

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2 empty-state-title">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-gray-600 mb-6 max-w-md empty-state-description">
          {description}
        </p>
      )}

      {/* Actions */}
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6" role="group" aria-label="Available actions">
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 empty-state-button"
              aria-label={primaryAction.label}
              ref={(el) => {
                if (el && primaryAction && document.activeElement === containerRef.current) {
                  // Auto-focus primary action when container is focused
                  setTimeout(() => el.focus(), 0);
                }
              }}
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 empty-state-button"
              aria-label={secondaryAction.label}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}

      {/* Keyboard navigation hint for screen readers */}
      <div className="sr-only" aria-live="polite">
        {keyboardHint}
      </div>

      {/* Custom content */}
      {children && (
        <div className="mt-4" role="complementary">
          {children}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
