import React from 'react';
import { EmptyState, EmptyStateProps } from './EmptyState';

// Specialized empty state components for common scenarios

export interface NoDataEmptyStateProps extends Omit<EmptyStateProps, 'type' | 'title' | 'icon'> {
  /** Entity name (e.g., "transactions", "notifications", "bills") */
  entity: string;
  /** Whether this is the first time user sees this feature */
  isFirstTime?: boolean;
}

export const NoDataEmptyState: React.FC<NoDataEmptyStateProps> = ({
  entity,
  isFirstTime = false,
  primaryAction,
  secondaryAction,
  ...props
}) => {
  const title = isFirstTime 
    ? `Get started with ${entity}`
    : `No ${entity} yet`;

  const description = isFirstTime
    ? `Create your first ${entity.slice(0, -1)} to begin tracking and managing your ${entity}.`
    : `You haven't added any ${entity} yet. Start by adding your first ${entity.slice(0, -1)}.`;

  return (
    <EmptyState
      type="no-data"
      title={title}
      description={description}
      icon="📋"
      primaryAction={primaryAction || {
        label: `Add ${entity.slice(0, -1)}`,
        onClick: () => {}, // Will be overridden by caller
      }}
      secondaryAction={secondaryAction}
      {...props}
    />
  );
};

export interface NoResultsEmptyStateProps extends Omit<EmptyStateProps, 'type' | 'title' | 'icon'> {
  /** What was being searched for */
  searchTerm?: string;
  /** Whether filters are applied */
  hasFilters?: boolean;
  /** Function to clear filters/search */
  onClear?: () => void;
}

export const NoResultsEmptyState: React.FC<NoResultsEmptyStateProps> = ({
  searchTerm,
  hasFilters = false,
  onClear,
  ...props
}) => {
  const title = 'No results found';
  
  let description = 'Try adjusting your search terms or filters to find what you\'re looking for.';
  if (searchTerm && hasFilters) {
    description = `No results found for "${searchTerm}" with current filters. Try different search terms or adjust your filters.`;
  } else if (searchTerm) {
    description = `No results found for "${searchTerm}". Try a different search term or browse all items.`;
  } else if (hasFilters) {
    description = 'No items match your current filters. Try adjusting or clearing your filters.';
  }

  return (
    <EmptyState
      type="no-results"
      title={title}
      description={description}
      icon="🔍"
      secondaryAction={onClear ? {
        label: hasFilters ? 'Clear Filters' : 'Clear Search',
        onClick: onClear,
      } : undefined}
      {...props}
    />
  );
};

export interface ConnectionErrorEmptyStateProps extends Omit<EmptyStateProps, 'type' | 'title' | 'icon'> {
  /** Whether to show retry button */
  showRetry?: boolean;
  /** Retry function */
  onRetry?: () => void;
  /** Error message */
  error?: string;
}

export const ConnectionErrorEmptyState: React.FC<ConnectionErrorEmptyStateProps> = ({
  showRetry = true,
  onRetry,
  error,
  ...props
}) => {
  return (
    <EmptyState
      type="no-connection"
      title="Connection lost"
      description={error || "We couldn't connect to the server. Please check your internet connection and try again."}
      icon="📡"
      primaryAction={showRetry && onRetry ? {
        label: 'Try Again',
        onClick: onRetry,
      } : undefined}
      {...props}
    />
  );
};

export interface ListEmptyStateProps extends Omit<EmptyStateProps, 'type'> {
  /** Type of list */
  listType: 'transactions' | 'notifications' | 'bills' | 'payments' | 'search' | 'custom';
  /** Current state */
  state: 'loading' | 'error' | 'no-data' | 'no-results';
  /** Search term if applicable */
  searchTerm?: string;
  /** Whether filters are applied */
  hasFilters?: boolean;
  /** Error message if applicable */
  error?: string;
  /** Retry function */
  onRetry?: () => void;
  /** Clear function */
  onClear?: () => void;
}

export const ListEmptyState: React.FC<ListEmptyStateProps> = ({
  listType,
  state,
  searchTerm,
  hasFilters,
  error,
  onRetry,
  onClear,
  ...props
}) => {
  const getListConfig = () => {
    switch (listType) {
      case 'transactions':
        return {
          entity: 'transactions',
          primaryLabel: 'Make a Payment',
          icon: '💳'
        };
      case 'notifications':
        return {
          entity: 'notifications',
          primaryLabel: 'View Settings',
          icon: '🔔'
        };
      case 'bills':
        return {
          entity: 'bills',
          primaryLabel: 'Generate Bill',
          icon: '📄'
        };
      case 'payments':
        return {
          entity: 'payments',
          primaryLabel: 'Make Payment',
          icon: '💰'
        };
      case 'search':
        return {
          entity: 'results',
          primaryLabel: 'Browse All',
          icon: '🔍'
        };
      default:
        return {
          entity: 'items',
          primaryLabel: 'Add Item',
          icon: '📋'
        };
    }
  };

  const config = getListConfig();

  if (state === 'loading') {
    return (
      <EmptyState
        type="loading"
        title="Loading..."
        description="Please wait while we fetch your data."
        icon="⏳"
        {...props}
      />
    );
  }

  if (state === 'error') {
    return (
      <ConnectionErrorEmptyState
        error={error}
        onRetry={onRetry}
        {...props}
      />
    );
  }

  if (state === 'no-results') {
    return (
      <NoResultsEmptyState
        searchTerm={searchTerm}
        hasFilters={hasFilters}
        onClear={onClear}
        {...props}
      />
    );
  }

  // Default: no-data
  return (
    <NoDataEmptyState
      entity={config.entity}
      primaryAction={{
        label: config.primaryLabel,
        onClick: () => {}, // Will be overridden by caller
      }}
      icon={config.icon}
      {...props}
    />
  );
};

export default EmptyStateVariants;
