import React, { useState } from 'react';
import { EmptyState } from './EmptyState';
import { NoDataEmptyState, NoResultsEmptyState, ConnectionErrorEmptyState, ListEmptyState } from './EmptyStateVariants';

/**
 * Example component demonstrating different empty state usage patterns
 */
export const EmptyStateExample: React.FC = () => {
  const [currentExample, setCurrentExample] = useState<'transactions' | 'notifications' | 'search' | 'error'>('transactions');

  const renderExample = () => {
    switch (currentExample) {
      case 'transactions':
        return (
          <ListEmptyState
            listType="transactions"
            state="no-data"
            primaryAction={{
              label: 'Make a Payment',
              onClick: () => console.log('Navigate to payment'),
            }}
            secondaryAction={{
              label: 'View Payment History',
              onClick: () => console.log('View history'),
            }}
          />
        );

      case 'notifications':
        return (
          <ListEmptyState
            listType="notifications"
            state="no-data"
            primaryAction={{
              label: 'View Settings',
              onClick: () => console.log('Open settings'),
            }}
          />
        );

      case 'search':
        return (
          <NoResultsEmptyState
            searchTerm="electricity bill"
            hasFilters={true}
            onClear={() => console.log('Clear filters')}
            primaryAction={{
              label: 'Browse All Items',
              onClick: () => console.log('Browse all'),
            }}
          />
        );

      case 'error':
        return (
          <ConnectionErrorEmptyState
            error="Failed to connect to the server. Please check your internet connection."
            onRetry={() => console.log('Retry connection')}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Empty State Examples</h1>
      
      {/* Example selector */}
      <div className="mb-8 flex gap-4">
        <button
          onClick={() => setCurrentExample('transactions')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            currentExample === 'transactions'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          No Transactions
        </button>
        <button
          onClick={() => setCurrentExample('notifications')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            currentExample === 'notifications'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          No Notifications
        </button>
        <button
          onClick={() => setCurrentExample('search')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            currentExample === 'search'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          No Search Results
        </button>
        <button
          onClick={() => setCurrentExample('error')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            currentExample === 'error'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          Connection Error
        </button>
      </div>

      {/* Current example */}
      <div className="bg-gray-50 rounded-lg p-8">
        {renderExample()}
      </div>

      {/* Usage documentation */}
      <div className="mt-12 prose max-w-none">
        <h2 className="text-xl font-bold mb-4">Usage Examples</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">Basic Empty State</h3>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto">
              <code>{`<EmptyState
  title="No data available"
  description="There's nothing to show here yet."
  icon="📋"
  primaryAction={{
    label: 'Add Item',
    onClick: handleAddItem
  }}
/>`}</code>
            </pre>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">List Empty State</h3>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto">
              <code>{`<ListEmptyState
  listType="transactions"
  state="no-data"
  primaryAction={{
    label: 'Make a Payment',
    onClick: handlePayment
  }}
/>`}</code>
            </pre>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">No Results Empty State</h3>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto">
              <code>{`<NoResultsEmptyState
  searchTerm="electricity"
  hasFilters={true}
  onClear={handleClearFilters}
/>`}</code>
            </pre>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Error Empty State</h3>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto">
              <code>{`<ConnectionErrorEmptyState
  error="Failed to load data"
  onRetry={handleRetry}
/>`}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmptyStateExample;
