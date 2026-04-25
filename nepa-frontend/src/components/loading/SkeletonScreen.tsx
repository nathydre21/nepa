import React from 'react';
import { cn } from '../../utils/cn';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  lines?: number;
  animated?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  width,
  height,
  lines = 1,
  animated = true
}) => {
  const variantClasses: Record<string, string> = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-lg'
  };

  const baseClasses = cn(
    'bg-gray-200',
    animated && 'animate-pulse',
    variantClasses[variant],
    className
  );

  const style: React.CSSProperties = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1rem' : '40px')
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className="space-y-2" role="presentation" aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className={cn(
              baseClasses,
              index === lines - 1 ? 'w-3/4' : 'w-full'
            )}
            style={style}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={baseClasses}
      style={style}
      role="presentation"
      aria-hidden="true"
    />
  );
};

export interface SkeletonCardProps {
  className?: string;
  showAvatar?: boolean;
  showTitle?: boolean;
  showSubtitle?: boolean;
  showText?: boolean;
  textLines?: number;
  showButton?: boolean;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  className = '',
  showAvatar = true,
  showTitle = true,
  showSubtitle = true,
  showText = true,
  textLines = 3,
  showButton = true
}) => {
  return (
    <div className={cn('p-6 bg-white rounded-lg shadow-sm border border-gray-200', className)}>
      {showAvatar && (
        <div className="flex items-center space-x-4 mb-4">
          <Skeleton variant="circular" width={48} height={48} />
          <div className="flex-1">
            {showTitle && <Skeleton className="mb-2" width="60%" />}
            {showSubtitle && <Skeleton width="40%" />}
          </div>
        </div>
      )}
      
      {showText && (
        <div className="space-y-2 mb-4">
          <Skeleton lines={textLines} />
        </div>
      )}
      
      {showButton && <Skeleton width={120} height={40} variant="rounded" />}
    </div>
  );
};

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
  showHeader?: boolean;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4,
  className = '',
  showHeader = true
}) => {
  return (
    <div className={cn('w-full', className)}>
      {showHeader && (
        <div className="flex space-x-4 mb-4 pb-2 border-b border-gray-200">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={`header-${index}`} variant="text" height={20} />
          ))}
        </div>
      )}
      
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex space-x-4">
            {Array.from({ length: columns }, (_, colIndex) => (
              <Skeleton
                key={`cell-${rowIndex}-${colIndex}`}
                variant="text"
                height={16}
                width={colIndex === 0 ? '80%' : '60%'}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export interface SkeletonListProps {
  items?: number;
  className?: string;
  showAvatar?: boolean;
  avatarSize?: number;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({
  items = 5,
  className = '',
  showAvatar = true,
  avatarSize = 40
}) => {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="flex items-center space-x-3">
          {showAvatar && (
            <Skeleton variant="circular" width={avatarSize} height={avatarSize} />
          )}
          <div className="flex-1 space-y-2">
            <Skeleton width="70%" />
            <Skeleton width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default Skeleton;
