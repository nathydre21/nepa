import React from 'react';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export const Loading: React.FC<Props> = ({ size = 'md', label }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <div className={`${sizeClasses[size]} border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin`} />
      {label && <p className="text-sm text-gray-500 font-medium">{label}</p>}
    </div>
  );
};
