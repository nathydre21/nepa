import React from 'react';
import { Dropdown, DropdownItem } from './Dropdown';

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  className?: string;
  disabled?: boolean;
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'auto';
  maxHeight?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  ariaLabel?: string;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  className = '',
  disabled = false,
  position = 'bottom-left',
  maxHeight = 300,
  searchable = false,
  searchPlaceholder = 'Search menu items...',
  emptyMessage = 'No menu items found',
  ariaLabel = 'Menu',
}) => {
  return (
    <Dropdown
      trigger={trigger}
      items={items}
      className={className}
      disabled={disabled}
      position={position}
      maxHeight={maxHeight}
      searchable={searchable}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
      ariaLabel={ariaLabel}
      role="menu"
    />
  );
};
