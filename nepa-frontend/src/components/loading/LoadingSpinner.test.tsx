import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-live', 'polite');
  });

  it('renders with custom label', () => {
    render(<LoadingSpinner label="Loading data..." />);
    
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('renders with different sizes', () => {
    const { rerender } = render(<LoadingSpinner size="xs" />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<LoadingSpinner size="lg" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders with different variants', () => {
    const { rerender } = render(<LoadingSpinner variant="primary" />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<LoadingSpinner variant="success" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('hides label when showLabel is false', () => {
    render(<LoadingSpinner label="Should not show" showLabel={false} />);
    
    expect(screen.queryByText('Should not show')).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<LoadingSpinner label="Test loading" />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-live', 'polite');
    expect(spinner).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className="custom-class" />);
    
    const container = screen.getByRole('status').parentElement;
    expect(container).toHaveClass('custom-class');
  });
});
