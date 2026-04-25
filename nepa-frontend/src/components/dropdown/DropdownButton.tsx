import React from 'react';
import { Dropdown, DropdownItem } from './Dropdown';

export interface DropdownButtonProps {
  children: React.ReactNode;
  items: DropdownItem[];
  className?: string;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'auto';
  closeOnSelect?: boolean;
  searchable?: boolean;
  ariaLabel?: string;
}

export const DropdownButton: React.FC<DropdownButtonProps> = ({
  children,
  items,
  className = '',
  disabled = false,
  variant = 'default',
  size = 'md',
  position = 'bottom-left',
  closeOnSelect = true,
  searchable = false,
  ariaLabel,
}) => {
  return (
    <Dropdown
      trigger={children}
      items={items}
      className={className}
      disabled={disabled}
      variant={variant}
      size={size}
      position={position}
      closeOnSelect={closeOnSelect}
      searchable={searchable}
      ariaLabel={ariaLabel}
    />
  );
};
