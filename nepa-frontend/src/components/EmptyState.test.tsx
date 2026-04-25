import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EmptyState from './EmptyState';
import { NoDataEmptyState, NoResultsEmptyState, ConnectionErrorEmptyState, ListEmptyState } from './EmptyStateVariants';

describe('EmptyState Components', () => {
  describe('EmptyState', () => {
    test('renders with basic props', () => {
      render(<EmptyState title="Test Title" description="Test description" />);
      
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test description')).toBeInTheDocument();
    });

    test('renders with custom icon', () => {
      render(<EmptyState title="Test" icon="🎉" />);
      
      expect(screen.getByText('🎉')).toBeInTheDocument();
    });

    test('renders primary action button', () => {
      const handleClick = jest.fn();
      render(
        <EmptyState 
          title="Test" 
          primaryAction={{ label: 'Click me', onClick: handleClick }}
        />
      );
      
      const button = screen.getByRole('button', { name: 'Click me' });
      expect(button).toBeInTheDocument();
      
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalled();
    });

    test('renders secondary action button', () => {
      const handleClick = jest.fn();
      render(
        <EmptyState 
          title="Test" 
          secondaryAction={{ label: 'Secondary', onClick: handleClick }}
        />
      );
      
      const button = screen.getByRole('button', { name: 'Secondary' });
      expect(button).toBeInTheDocument();
      
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalled();
    });

    test('applies correct size classes', () => {
      const { container } = render(<EmptyState title="Test" size="large" />);
      
      expect(container.firstChild).toHaveClass('py-16', 'px-8');
    });

    test('has proper accessibility attributes', () => {
      render(<EmptyState title="Test Title" />);
      
      const container = screen.getByRole('status');
      expect(container).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('NoDataEmptyState', () => {
    test('renders for first-time user', () => {
      render(<NoDataEmptyState entity="transactions" isFirstTime />);
      
      expect(screen.getByText('Get started with transactions')).toBeInTheDocument();
      expect(screen.getByText(/Create your first transaction/)).toBeInTheDocument();
    });

    test('renders for returning user', () => {
      render(<NoDataEmptyState entity="transactions" />);
      
      expect(screen.getByText('No transactions yet')).toBeInTheDocument();
      expect(screen.getByText(/You haven't added any transactions/)).toBeInTheDocument();
    });
  });

  describe('NoResultsEmptyState', () => {
    test('renders with search term', () => {
      render(<NoResultsEmptyState searchTerm="test" />);
      
      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByText(/No results found for "test"/)).toBeInTheDocument();
    });

    test('renders with filters', () => {
      const handleClear = jest.fn();
      render(<NoResultsEmptyState hasFilters onClear={handleClear} />);
      
      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByText(/No items match your current filters/)).toBeInTheDocument();
      
      const clearButton = screen.getByRole('button', { name: 'Clear Filters' });
      fireEvent.click(clearButton);
      expect(handleClear).toHaveBeenCalled();
    });
  });

  describe('ConnectionErrorEmptyState', () => {
    test('renders with retry functionality', () => {
      const handleRetry = jest.fn();
      render(<ConnectionErrorEmptyState onRetry={handleRetry} />);
      
      expect(screen.getByText('Connection lost')).toBeInTheDocument();
      
      const retryButton = screen.getByRole('button', { name: 'Try Again' });
      fireEvent.click(retryButton);
      expect(handleRetry).toHaveBeenCalled();
    });

    test('renders with custom error message', () => {
      render(<ConnectionErrorEmptyState error="Custom error message" />);
      
      expect(screen.getByText('Custom error message')).toBeInTheDocument();
    });
  });

  describe('ListEmptyState', () => {
    test('renders loading state', () => {
      render(<ListEmptyState listType="transactions" state="loading" />);
      
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Please wait while we fetch your data.')).toBeInTheDocument();
    });

    test('renders error state', () => {
      const handleRetry = jest.fn();
      render(<ListEmptyState listType="transactions" state="error" onRetry={handleRetry} />);
      
      expect(screen.getByText('Connection lost')).toBeInTheDocument();
    });

    test('renders no-results state', () => {
      render(<ListEmptyState listType="transactions" state="no-results" searchTerm="test" />);
      
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });

    test('renders no-data state for transactions', () => {
      render(<ListEmptyState listType="transactions" state="no-data" />);
      
      expect(screen.getByText('No transactions yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Make a Payment' })).toBeInTheDocument();
    });

    test('renders no-data state for notifications', () => {
      render(<ListEmptyState listType="notifications" state="no-data" />);
      
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'View Settings' })).toBeInTheDocument();
    });
  });
});
