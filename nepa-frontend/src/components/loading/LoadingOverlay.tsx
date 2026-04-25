import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { ProgressBar } from './ProgressBar';
import { cn } from '../../utils/cn';
import { createAccessibleLoadingProps, prefersReducedMotion } from '../../utils/loadingAccessibility';

export interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  progress?: number;
  max?: number;
  showProgress?: boolean;
  variant?: 'spinner' | 'dots' | 'pulse' | 'skeleton';
  size?: 'sm' | 'md' | 'lg';
  backdrop?: boolean;
  backdropBlur?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  message = 'Loading...',
  progress,
  max = 100,
  showProgress = false,
  variant = 'spinner',
  size = 'md',
  backdrop = true,
  backdropBlur = false,
  className = '',
  children
}) => {
  if (!isLoading) {
    return <>{children}</>;
  }

  const shouldAnimate = !prefersReducedMotion();

  const renderLoadingIndicator = () => {
    switch (variant) {
      case 'spinner':
        return <LoadingSpinner size={size} label={message} showLabel={!showProgress} />;
      
      case 'dots':
        return (
          <div className="flex space-x-2" role="status" aria-live="polite">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className={cn(
                  'w-3 h-3 bg-blue-600 rounded-full',
                  shouldAnimate && 'animate-bounce'
                )}
                style={{
                  animationDelay: shouldAnimate ? `${index * 0.1}s` : '0s'
                }}
                aria-hidden="true"
              />
            ))}
            <span className="sr-only">{message}</span>
          </div>
        );
      
      case 'pulse':
        return (
          <div className="flex flex-col items-center space-y-4" role="status" aria-live="polite">
            <div
              className={cn(
                'w-16 h-16 bg-blue-600 rounded-lg',
                shouldAnimate && 'animate-pulse'
              )}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-gray-600">{message}</span>
          </div>
        );
      
      case 'skeleton':
        return (
          <div className="w-full max-w-md space-y-4" role="status" aria-live="polite">
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse" aria-hidden="true" />
              <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" aria-hidden="true" />
              <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" aria-hidden="true" />
            </div>
            <span className="sr-only">{message}</span>
          </div>
        );
      
      default:
        return <LoadingSpinner size={size} label={message} />;
    }
  };

  const overlayContent = (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        backdrop && 'bg-black/50',
        backdropBlur && 'backdrop-blur-sm',
        className
      )}
      {...createAccessibleLoadingProps(isLoading, message)}
    >
      <div className="bg-white rounded-lg p-8 shadow-xl max-w-sm w-full mx-4">
        {renderLoadingIndicator()}
        
        {showProgress && progress !== undefined && (
          <div className="mt-6">
            <ProgressBar
              value={progress}
              max={max}
              size="sm"
              showPercentage
              label={message}
            />
          </div>
        )}
        
        {message && !showProgress && variant !== 'skeleton' && (
          <p className="mt-4 text-center text-sm text-gray-600">{message}</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {children}
      {overlayContent}
    </>
  );
};

export interface LoadingButtonProps {
  isLoading: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading,
  children,
  disabled = false,
  className = '',
  loadingText,
  variant = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses: Record<string, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500'
  };

  const sizeClasses: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button
      type={type}
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || isLoading}
      onClick={onClick}
      {...createAccessibleLoadingProps(isLoading, loadingText || 'Loading')}
      {...props}
    >
      {isLoading && (
        <LoadingSpinner
          size="sm"
          variant="white"
          showLabel={false}
          className="mr-2"
        />
      )}
      {isLoading ? (loadingText || 'Loading...') : children}
    </button>
  );
};

export interface LoadingCardProps {
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
  skeletonLines?: number;
  showAvatar?: boolean;
}

export const LoadingCard: React.FC<LoadingCardProps> = ({
  isLoading,
  children,
  className = '',
  skeletonLines = 3,
  showAvatar = false
}) => {
  if (isLoading) {
    return (
      <div className={cn('p-6 bg-white rounded-lg shadow-sm border border-gray-200', className)}>
        {showAvatar && (
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
              <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse" />
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          {Array.from({ length: skeletonLines }, (_, index) => (
            <div
              key={index}
              className={cn(
                'h-4 bg-gray-200 rounded animate-pulse',
                index === skeletonLines - 1 && 'w-3/4'
              )}
              aria-hidden="true"
            />
          ))}
        </div>
        
        <span className="sr-only">Loading content...</span>
      </div>
    );
  }

  return <>{children}</>;
};

export default LoadingOverlay;
