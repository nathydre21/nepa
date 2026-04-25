import React from 'react';
import Tooltip, { TooltipProps } from './Tooltip';

export interface InfoTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipProps['position'];
  className?: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  return (
    <Tooltip
      content={content}
      position={position}
      className={`
        bg-blue-600 text-white border border-blue-700
        ${className}
      `}
      arrowClassName="border-t-blue-600"
    >
      {children}
    </Tooltip>
  );
};

export interface SuccessTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipProps['position'];
  className?: string;
}

export const SuccessTooltip: React.FC<SuccessTooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  return (
    <Tooltip
      content={content}
      position={position}
      className={`
        bg-green-600 text-white border border-green-700
        ${className}
      `}
      arrowClassName="border-t-green-600"
    >
      {children}
    </Tooltip>
  );
};

export interface WarningTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipProps['position'];
  className?: string;
}

export const WarningTooltip: React.FC<WarningTooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  return (
    <Tooltip
      content={content}
      position={position}
      className={`
        bg-yellow-600 text-white border border-yellow-700
        ${className}
      `}
      arrowClassName="border-t-yellow-600"
    >
      {children}
    </Tooltip>
  );
};

export interface ErrorTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipProps['position'];
  className?: string;
}

export const ErrorTooltip: React.FC<ErrorTooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  return (
    <Tooltip
      content={content}
      position={position}
      className={`
        bg-red-600 text-white border border-red-700
        ${className}
      `}
      arrowClassName="border-t-red-600"
    >
      {children}
    </Tooltip>
  );
};

export interface HelpTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipProps['position'];
  className?: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  return (
    <Tooltip
      content={content}
      position={position}
      delay={500}
      className={`
        bg-purple-600 text-white border border-purple-700
        ${className}
      `}
      arrowClassName="border-t-purple-600"
      ariaLabel="Help information"
    >
      {children}
    </Tooltip>
  );
};

export interface RichTooltipProps {
  title?: React.ReactNode;
  content: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipProps['position'];
  maxWidth?: number;
  className?: string;
}

export const RichTooltip: React.FC<RichTooltipProps> = ({
  title,
  content,
  footer,
  children,
  position = 'top',
  maxWidth = 400,
  className = '',
}) => {
  const tooltipContent = (
    <div className="space-y-2">
      {title && (
        <div className="font-semibold text-sm border-b border-gray-700 pb-1 mb-2">
          {title}
        </div>
      )}
      <div className="text-sm">
        {content}
      </div>
      {footer && (
        <div className="text-xs text-gray-300 border-t border-gray-700 pt-1 mt-2">
          {footer}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip
      content={tooltipContent}
      position={position}
      maxWidth={maxWidth}
      className={`
        bg-gray-800 text-white border border-gray-700 rounded-lg shadow-xl
        ${className}
      `}
      arrowClassName="border-t-gray-800"
    >
      {children}
    </Tooltip>
  );
};

export interface IconTooltipProps {
  content: React.ReactNode;
  icon?: React.ReactNode;
  position?: TooltipProps['position'];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const IconTooltip: React.FC<IconTooltipProps> = ({
  content,
  icon = (
    <svg
      className="w-4 h-4"
      fill="currentColor"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  ),
  position = 'top',
  size = 'sm',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <Tooltip
      content={content}
      position={position}
      className="bg-gray-900 text-white"
      arrowClassName="border-t-gray-900"
    >
      <span className={`inline-flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-help ${sizeClasses[size]} ${className}`}>
        {icon}
      </span>
    </Tooltip>
  );
};

export default {
  InfoTooltip,
  SuccessTooltip,
  WarningTooltip,
  ErrorTooltip,
  HelpTooltip,
  RichTooltip,
  IconTooltip,
};
