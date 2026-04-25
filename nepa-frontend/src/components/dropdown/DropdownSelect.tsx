import React, { useState } from 'react';
import { Dropdown, DropdownItem } from './Dropdown';

export interface DropdownSelectProps {
  options: DropdownItem[];
  value?: string;
  onChange?: (value: string, item: DropdownItem) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'auto';
  searchable?: boolean;
  clearable?: boolean;
  ariaLabel?: string;
}

export const DropdownSelect: React.FC<DropdownSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  className = '',
  disabled = false,
  size = 'md',
  position = 'bottom-left',
  searchable = true,
  clearable = false,
  ariaLabel = 'Select',
}) => {
  const [selectedValue, setSelectedValue] = useState(value);

  const selectedOption = options.find(option => option.value === selectedValue);

  const handleSelect = (item: DropdownItem) => {
    if (item.value) {
      setSelectedValue(item.value);
      onChange?.(item.value, item);
    }
  };

  const trigger = (
    <div className="flex items-center justify-between w-full">
      <span className={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
        {selectedOption ? selectedOption.label : placeholder}
      </span>
      {clearable && selectedValue && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedValue('');
            onChange?.('', {} as DropdownItem);
          }}
          className="p-1 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground"
          aria-label="Clear selection"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <Dropdown
      trigger={trigger}
      items={options}
      className={className}
      disabled={disabled}
      size={size}
      position={position}
      searchable={searchable}
      closeOnSelect={true}
      ariaLabel={ariaLabel}
      role="listbox"
    />
  );
};
