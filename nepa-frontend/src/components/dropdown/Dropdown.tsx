import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { ariaLabels, keyboardKeys, announceToScreenReader } from '../utils/accessibility';

export interface DropdownItem {
  id: string;
  label: string;
  value?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  separator?: boolean;
  href?: string;
  onClick?: () => void;
  dangerouslySetInnerHTML?: { __html: string };
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  className?: string;
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'auto';
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  closeOnSelect?: boolean;
  maxHeight?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  role?: 'menu' | 'listbox';
}

interface DropdownPosition {
  top: number;
  left: number;
  right?: number;
  bottom?: number;
  width?: number;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  className = '',
  position = 'bottom-left',
  size = 'md',
  variant = 'default',
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  closeOnSelect = true,
  maxHeight = 300,
  searchable = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items found',
  ariaLabel,
  role = 'menu',
}) => {
  const { resolvedTheme } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;
  
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter items based on search
  const filteredItems = React.useMemo(() => {
    if (!searchQuery) return items;
    
    return items.filter(item => 
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.value?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [items, searchQuery]);

  // Calculate dropdown position
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !dropdownRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    let newPosition: DropdownPosition = {
      top: triggerRect.bottom + scrollY,
      left: triggerRect.left + scrollX,
      width: triggerRect.width,
    };

    // Adjust vertical position if needed
    if (position === 'top-left' || position === 'top-right') {
      newPosition.top = triggerRect.top + scrollY - dropdownRect.height;
      newPosition.bottom = viewportHeight - triggerRect.top + scrollY;
    } else if (position === 'auto') {
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      
      if (spaceBelow < dropdownRect.height && spaceAbove > dropdownRect.height) {
        // Position above
        newPosition.top = triggerRect.top + scrollY - dropdownRect.height;
        newPosition.bottom = viewportHeight - triggerRect.top + scrollY;
      }
    }

    // Adjust horizontal position
    if (position === 'bottom-right' || position === 'top-right') {
      newPosition.left = triggerRect.right + scrollX - dropdownRect.width;
    } else if (position === 'auto') {
      // Ensure dropdown stays within viewport
      if (newPosition.left + dropdownRect.width > viewportWidth) {
        newPosition.left = triggerRect.right + scrollX - dropdownRect.width;
      }
      if (newPosition.left < 0) {
        newPosition.left = 0;
      }
    }

    setDropdownPosition(newPosition);
  }, [position]);

  // Handle position updates
  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      
      // Recalculate on scroll/resize
      const handleScroll = () => calculatePosition();
      const handleResize = () => calculatePosition();
      
      window.addEventListener('scroll', handleScroll);
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isOpen, calculatePosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, setIsOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, searchable]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case keyboardKeys.ARROW_DOWN:
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev => {
            const nextIndex = prev + 1;
            return nextIndex < filteredItems.length ? nextIndex : 0;
          });
        }
        break;

      case keyboardKeys.ARROW_UP:
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex(prev => {
            const nextIndex = prev - 1;
            return nextIndex >= 0 ? nextIndex : filteredItems.length - 1;
          });
        }
        break;

      case keyboardKeys.ENTER:
      case keyboardKeys.SPACE:
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0 && filteredItems[highlightedIndex]) {
          handleItemClick(filteredItems[highlightedIndex]);
        } else if (!isOpen) {
          setIsOpen(true);
        }
        break;

      case keyboardKeys.ESCAPE:
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
        triggerRef.current?.focus();
        break;

      case keyboardKeys.TAB:
        if (isOpen) {
          setIsOpen(false);
          setSearchQuery('');
          setHighlightedIndex(-1);
        }
        break;
    }
  }, [disabled, isOpen, highlightedIndex, filteredItems, setIsOpen]);

  // Handle item click
  const handleItemClick = useCallback((item: DropdownItem) => {
    if (item.disabled || item.separator) return;

    if (item.onClick) {
      item.onClick();
    }

    if (item.href) {
      window.location.href = item.href;
    }

    announceToScreenReader(`Selected: ${item.label}`);

    if (closeOnSelect) {
      setIsOpen(false);
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [closeOnSelect, setIsOpen]);

  // Handle trigger click
  const handleTriggerClick = useCallback(() => {
    if (disabled) return;
    setIsOpen(!isOpen);
    setSearchQuery('');
    setHighlightedIndex(-1);
  }, [disabled, isOpen, setIsOpen]);

  // Get size classes
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'text-xs py-1 px-2';
      case 'lg':
        return 'text-base py-3 px-4';
      default:
        return 'text-sm py-2 px-3';
    }
  };

  // Get variant classes
  const getVariantClasses = () => {
    switch (variant) {
      case 'outline':
        return 'border border-input bg-background hover:bg-accent hover:text-accent-foreground';
      case 'ghost':
        return 'hover:bg-accent hover:text-accent-foreground';
      default:
        return 'bg-primary text-primary-foreground hover:bg-primary/90';
    }
  };

  const dropdownId = `dropdown-${React.useId()}`;
  const listId = `${dropdownId}-list`;

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Trigger */}
      <div
        ref={triggerRef}
        className="inline-block"
        onKeyDown={handleKeyDown}
      >
        <div
          onClick={handleTriggerClick}
          className={`
            inline-flex items-center justify-center rounded-md font-medium
            ring-offset-background transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
            disabled:pointer-events-none disabled:opacity-50
            ${getVariantClasses()}
            ${getSizeClasses()}
            ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
          `}
          aria-label={ariaLabel}
          aria-expanded={isOpen.toString()}
          aria-haspopup={role}
          aria-controls={dropdownId}
          role="button"
          tabIndex={disabled ? -1 : 0}
        >
          {trigger}
          <svg
            className={`w-4 h-4 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          id={dropdownId}
          className={`
            absolute z-50 rounded-md border bg-popover text-popover-foreground shadow-md
            transition-all duration-200 ease-in-out
            ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
          `}
          style={{
            ...(dropdownPosition || {}),
            maxHeight: maxHeight + 'px',
            overflowY: 'auto',
          }}
          role={role}
          aria-label={ariaLabel}
          aria-orientation="vertical"
        >
          {/* Search */}
          {searchable && (
            <div className="p-2 border-b border-border">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Search dropdown items"
              />
            </div>
          )}

          {/* Items */}
          <div
            id={listId}
            role={role === 'menu' ? 'menu' : 'listbox'}
            aria-label={ariaLabel}
            aria-activedescendant={highlightedIndex >= 0 ? `${listId}-item-${highlightedIndex}` : undefined}
          >
            {filteredItems.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                {emptyMessage}
              </div>
            ) : (
              filteredItems.map((item, index) => {
                if (item.separator) {
                  return (
                    <div
                      key={item.id}
                      className="my-1 border-t border-border"
                      role="separator"
                    />
                  );
                }

                const itemId = `${listId}-item-${index}`;
                const isHighlighted = index === highlightedIndex;

                return (
                  <div
                    key={item.id}
                    id={itemId}
                    role={role === 'menu' ? 'menuitem' : 'option'}
                    aria-selected={isHighlighted}
                    aria-disabled={item.disabled}
                    className={`
                      flex items-center gap-2 px-3 py-2 text-sm cursor-pointer
                      transition-colors duration-150
                      ${item.disabled 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground'
                      }
                      ${isHighlighted ? 'bg-accent text-accent-foreground' : ''}
                    `}
                    onClick={() => handleItemClick(item)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseLeave={() => setHighlightedIndex(-1)}
                    tabIndex={-1}
                  >
                    {item.icon && (
                      <span className="flex-shrink-0 w-4 h-4">
                        {item.icon}
                      </span>
                    )}
                    <span className="flex-1 truncate">
                      {item.dangerouslySetInnerHTML ? (
                        <span dangerouslySetInnerHTML={item.dangerouslySetInnerHTML} />
                      ) : (
                        item.label
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
