import React from 'react';
import { cn } from '../../utils/cn';

export interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'white' | 'success' | 'warning' | 'error';
  className?: string;
  label?: string;
  showLabel?: boolean;
}

const sizeClasses: Record<string, string> = {
  xs: 'w-4 h-4',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
};

const variantClasses: Record<string, string> = {
  primary: 'border-blue-200 border-t-blue-600',
  secondary: 'border-gray-200 border-t-gray-600',
  white: 'border-white/20 border-t-white',
  success: 'border-green-200 border-t-green-600',
  warning: 'border-yellow-200 border-t-yellow-600',
  error: 'border-red-200 border-t-red-600'
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'primary',
  className = '',
  label,
  showLabel = true
}) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-2" role="status" aria-live="polite">
      <div
        className={cn(
          'border-4 border-solid rounded-full animate-spin',
          sizeClasses[size],
          variantClasses[variant],
          className
        )}
        aria-hidden="true"
      />
      {label && showLabel && (
        <span className="text-sm font-medium text-gray-600 animate-pulse">
          {label}
        </span>
      )}
    </div>
  );
};

export default LoadingSpinner;
