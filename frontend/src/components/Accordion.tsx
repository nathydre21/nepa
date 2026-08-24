import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { ChevronDown } from 'lucide-react';

// Context for managing accordion state
interface AccordionContextValue {
  openItems: Set<string>;
  toggleItem: (id: string) => void;
  allowMultiple: boolean;
  disabled: boolean;
  variant: AccordionVariant;
  size: AccordionSize;
}

// Context for individual accordion items
interface AccordionItemContextValue {
  itemId: string;
  isOpen: boolean;
  isDisabled: boolean;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);
const AccordionItemContext = createContext<AccordionItemContextValue | null>(null);

const useAccordionContext = () => {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error('Accordion components must be used within an Accordion');
  }
  return context;
};

const useAccordionItemContext = () => {
  const context = useContext(AccordionItemContext);
  if (!context) {
    throw new Error('AccordionTrigger and AccordionContent must be used within an AccordionItem');
  }
  return context;
};

// Types
export type AccordionVariant = 'default' | 'bordered' | 'separated' | 'ghost';
export type AccordionSize = 'sm' | 'md' | 'lg';

export interface AccordionProps {
  children: React.ReactNode;
  /** Allow multiple items to be open at once */
  allowMultiple?: boolean;
  /** Default open items (controlled) */
  defaultOpenItems?: string[];
  /** Controlled open items */
  openItems?: string[];
  /** Callback when items change */
  onOpenChange?: (openItems: string[]) => void;
  /** Visual variant */
  variant?: AccordionVariant;
  /** Size variant */
  size?: AccordionSize;
  /** Disable all items */
  disabled?: boolean;
  /** Custom className */
  className?: string;
  /** Collapsible - allow all items to be closed */
  collapsible?: boolean;
}

export interface AccordionItemProps {
  /** Unique identifier for the item */
  id: string;
  /** Item content */
  children: React.ReactNode;
  /** Disable this specific item */
  disabled?: boolean;
  /** Custom className */
  className?: string;
}

export interface AccordionTriggerProps {
  children: React.ReactNode;
  /** Custom icon to replace default chevron */
  icon?: React.ReactNode;
  /** Hide the icon */
  hideIcon?: boolean;
  /** Custom className */
  className?: string;
}

export interface AccordionContentProps {
  children: React.ReactNode;
  /** Custom className */
  className?: string;
}

// Variant classes
const variantClasses: Record<AccordionVariant, string> = {
  default: 'border-b border-gray-200 last:border-b-0',
  bordered: 'border border-gray-200 rounded-lg mb-2',
  separated: 'mb-4 border border-gray-200 rounded-lg shadow-sm',
  ghost: 'mb-2',
};

// Size classes
const sizeClasses: Record<AccordionSize, { trigger: string; content: string }> = {
  sm: {
    trigger: 'py-2 px-3 text-sm',
    content: 'px-3 pb-2 text-sm',
  },
  md: {
    trigger: 'py-3 px-4 text-base',
    content: 'px-4 pb-3 text-base',
  },
  lg: {
    trigger: 'py-4 px-5 text-lg',
    content: 'px-5 pb-4 text-base',
  },
};

// Main Accordion Component
export const Accordion: React.FC<AccordionProps> = ({
  children,
  allowMultiple = false,
  defaultOpenItems = [],
  openItems: controlledOpenItems,
  onOpenChange,
  variant = 'default',
  size = 'md',
  disabled = false,
  collapsible = true,
  className = '',
}) => {
  const [uncontrolledOpenItems, setUncontrolledOpenItems] = useState<Set<string>>(
    new Set(defaultOpenItems)
  );

  const isControlled = controlledOpenItems !== undefined;
  const openItems = isControlled
    ? new Set(controlledOpenItems)
    : uncontrolledOpenItems;

  const toggleItem = (id: string) => {
    if (disabled) return;

    const newOpenItems = new Set(openItems);

    if (newOpenItems.has(id)) {
      // Close the item if collapsible is true
      if (collapsible) {
        newOpenItems.delete(id);
      }
    } else {
      // Open the item
      if (!allowMultiple) {
        newOpenItems.clear();
      }
      newOpenItems.add(id);
    }

    if (isControlled) {
      onOpenChange?.(Array.from(newOpenItems));
    } else {
      setUncontrolledOpenItems(newOpenItems);
      onOpenChange?.(Array.from(newOpenItems));
    }
  };

  const contextValue: AccordionContextValue = {
    openItems,
    toggleItem,
    allowMultiple,
    disabled,
    variant,
    size,
  };

  return (
    <AccordionContext.Provider value={contextValue}>
      <div
        className={`accordion accordion-${variant} accordion-${size} ${className}`}
        data-variant={variant}
        data-size={size}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
};

// Accordion Item Component
export const AccordionItem: React.FC<AccordionItemProps> = ({
  id,
  children,
  disabled = false,
  className = '',
}) => {
  const { openItems, disabled: accordionDisabled, variant } = useAccordionContext();
  const isOpen = openItems.has(id);
  const isDisabled = disabled || accordionDisabled;

  const itemContextValue: AccordionItemContextValue = {
    itemId: id,
    isOpen,
    isDisabled,
  };

  return (
    <AccordionItemContext.Provider value={itemContextValue}>
      <div
        className={`accordion-item ${variantClasses[variant]} ${isOpen ? 'accordion-item-open' : ''} ${
          isDisabled ? 'accordion-item-disabled' : ''
        } ${className}`}
        data-state={isOpen ? 'open' : 'closed'}
        data-disabled={isDisabled}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
};

// Accordion Trigger Component
export const AccordionTrigger: React.FC<AccordionTriggerProps> = ({
  children,
  icon,
  hideIcon = false,
  className = '',
}) => {
  const { toggleItem, disabled: accordionDisabled, size } = useAccordionContext();
  const { itemId, isOpen, isDisabled } = useAccordionItemContext();

  const handleClick = () => {
    if (!isDisabled) {
      toggleItem(itemId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <button
      type="button"
      id={`accordion-trigger-${itemId}`}
      className={`accordion-trigger ${sizeClasses[size].trigger} ${isOpen ? 'accordion-trigger-open' : ''} ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={isDisabled}
      aria-expanded={isOpen}
      aria-controls={`accordion-content-${itemId}`}
      data-state={isOpen ? 'open' : 'closed'}
    >
      <span className="accordion-trigger-text">{children}</span>
      {!hideIcon && (
        <span className="accordion-trigger-icon" aria-hidden="true">
          {icon || <ChevronDown className="w-5 h-5" />}
        </span>
      )}
    </button>
  );
};

// Accordion Content Component
export const AccordionContent: React.FC<AccordionContentProps> = ({
  children,
  className = '',
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const { size } = useAccordionContext();
  const { itemId, isOpen } = useAccordionItemContext();

  // Animate height
  useEffect(() => {
    const content = contentRef.current;
    const inner = innerRef.current;
    if (!content || !inner) return;

    if (isOpen) {
      const height = inner.scrollHeight;
      content.style.height = `${height}px`;
      
      // After animation completes, set to auto for dynamic content
      const timer = setTimeout(() => {
        if (content && isOpen) {
          content.style.height = 'auto';
        }
      }, 300);
      
      return () => clearTimeout(timer);
    } else {
      // Set explicit height before collapsing
      const height = inner.scrollHeight;
      content.style.height = `${height}px`;
      
      // Force reflow
      content.offsetHeight;
      
      // Collapse
      requestAnimationFrame(() => {
        content.style.height = '0px';
      });
    }
  }, [isOpen]);

  return (
    <div
      ref={contentRef}
      id={`accordion-content-${itemId}`}
      className={`accordion-content ${sizeClasses[size].content} ${isOpen ? 'accordion-content-open' : ''} ${className}`}
      role="region"
      aria-labelledby={`accordion-trigger-${itemId}`}
      data-state={isOpen ? 'open' : 'closed'}
      style={{
        height: isOpen ? 'auto' : '0px',
        overflow: 'hidden',
        transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div ref={innerRef} className="accordion-content-inner">
        {children}
      </div>
    </div>
  );
};

// Helper component to properly connect trigger and content
interface AccordionItemWrapperProps {
  id: string;
  trigger: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const AccordionItemWrapper: React.FC<AccordionItemWrapperProps> = ({
  id,
  trigger,
  content,
  disabled = false,
  className = '',
}) => {
  return (
    <AccordionItem id={id} disabled={disabled} className={className}>
      {trigger}
      {content}
    </AccordionItem>
  );
};

// Export all components
export default Accordion;
