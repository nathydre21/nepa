import React, { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
  /** The content to display in the tooltip */
  content: ReactNode;
  /** The trigger element that activates the tooltip */
  children: ReactNode;
  /** Position of the tooltip relative to the trigger */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'left-start' | 'left-end' | 'right-start' | 'right-end';
  /** How the tooltip is triggered */
  trigger?: 'hover' | 'click' | 'focus' | 'manual';
  /** Whether the tooltip is disabled */
  disabled?: boolean;
  /** Delay before showing the tooltip (ms) */
  delay?: number;
  /** Delay before hiding the tooltip (ms) */
  hideDelay?: number;
  /** Maximum width of the tooltip */
  maxWidth?: number;
  /** Whether to show an arrow */
  showArrow?: boolean;
  /** Custom className for the tooltip */
  className?: string;
  /** Custom className for the arrow */
  arrowClassName?: string;
  /** Whether the tooltip should stay open when clicking inside */
  closeOnClickOutside?: boolean;
  /** Z-index for the tooltip */
  zIndex?: number;
  /** Offset from the trigger element */
  offset?: number;
  /** Whether to allow HTML content in tooltip */
  allowHTML?: boolean;
  /** ARIA label for accessibility */
  ariaLabel?: string;
  /** Whether to prevent the tooltip from being cut off by viewport */
  preventOverflow?: boolean;
  /** Manual control of tooltip visibility */
  open?: boolean;
  /** Callback when tooltip visibility changes */
  onOpenChange?: (open: boolean) => void;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition?: {
    top: number;
    left: number;
    transform: string;
  };
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  trigger = 'hover',
  disabled = false,
  delay = 300,
  hideDelay = 150,
  maxWidth = 300,
  showArrow = true,
  className = '',
  arrowClassName = '',
  closeOnClickOutside = true,
  zIndex = 50,
  offset = 8,
  allowHTML = false,
  ariaLabel,
  preventOverflow = true,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [calculatedPosition, setCalculatedPosition] = useState<TooltipPosition | null>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const hideTimeoutRef = useRef<NodeJS.Timeout>();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback((newOpen: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(newOpen);
    } else if (!isControlled) {
      setInternalOpen(newOpen);
    }
  }, [isControlled, onOpenChange]);

  const calculatePosition = useCallback((): TooltipPosition | null => {
    if (!triggerRef.current || !tooltipRef.current) return null;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    let top = 0;
    let left = 0;
    let arrowTop = 0;
    let arrowLeft = 0;
    let arrowTransform = '';

    const positions = position.split('-') as ['top' | 'bottom' | 'left' | 'right', 'start' | 'end' | undefined];
    const [mainPosition, alignment] = positions;

    switch (mainPosition) {
      case 'top':
        top = triggerRect.top + scrollY - tooltipRect.height - offset;
        left = triggerRect.left + scrollX + (triggerRect.width - tooltipRect.width) / 2;
        arrowTop = tooltipRect.height;
        arrowLeft = tooltipRect.width / 2;
        arrowTransform = 'translate(-50%, -50%) rotate(180deg)';
        break;
      case 'bottom':
        top = triggerRect.bottom + scrollY + offset;
        left = triggerRect.left + scrollX + (triggerRect.width - tooltipRect.width) / 2;
        arrowTop = -8;
        arrowLeft = tooltipRect.width / 2;
        arrowTransform = 'translate(-50%, -50%)';
        break;
      case 'left':
        top = triggerRect.top + scrollY + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left + scrollX - tooltipRect.width - offset;
        arrowTop = tooltipRect.height / 2;
        arrowLeft = tooltipRect.width;
        arrowTransform = 'translate(-50%, -50%) rotate(90deg)';
        break;
      case 'right':
        top = triggerRect.top + scrollY + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + scrollX + offset;
        arrowTop = tooltipRect.height / 2;
        arrowLeft = -8;
        arrowTransform = 'translate(-50%, -50%) rotate(-90deg)';
        break;
    }

    // Handle alignment
    if (alignment === 'start') {
      if (mainPosition === 'top' || mainPosition === 'bottom') {
        left = triggerRect.left + scrollX;
      } else {
        top = triggerRect.top + scrollY;
      }
    } else if (alignment === 'end') {
      if (mainPosition === 'top' || mainPosition === 'bottom') {
        left = triggerRect.right + scrollX - tooltipRect.width;
      } else {
        top = triggerRect.bottom + scrollY - tooltipRect.height;
      }
    }

    // Prevent overflow if enabled
    if (preventOverflow) {
      const rightEdge = left + tooltipRect.width;
      const bottomEdge = top + tooltipRect.height;

      if (left < 0) {
        left = 8;
        arrowLeft = triggerRect.left + triggerRect.width / 2 - left;
      }
      if (rightEdge > viewport.width) {
        left = viewport.width - tooltipRect.width - 8;
        arrowLeft = triggerRect.left + triggerRect.width / 2 - left;
      }
      if (top < 0) {
        top = 8;
        arrowTop = triggerRect.top + triggerRect.height / 2 - top;
      }
      if (bottomEdge > viewport.height) {
        top = viewport.height - tooltipRect.height - 8;
        arrowTop = triggerRect.top + triggerRect.height / 2 - top;
      }
    }

    const arrowPosition = showArrow ? {
      top: arrowTop,
      left: arrowLeft,
      transform: arrowTransform,
    } : undefined;

    return { top, left, arrowPosition };
  }, [position, offset, showArrow, preventOverflow]);

  const showTooltip = useCallback(() => {
    if (disabled) return;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setOpen(true);
    }, delay);
  }, [disabled, delay, setOpen]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    
    hideTimeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, hideDelay);
  }, [hideDelay, setOpen]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (trigger === 'click') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!open);
    }
  }, [trigger, open, setOpen]);

  const handleMouseEnter = useCallback(() => {
    if (trigger === 'hover') {
      showTooltip();
    }
  }, [trigger, showTooltip]);

  const handleMouseLeave = useCallback(() => {
    if (trigger === 'hover') {
      hideTooltip();
    }
  }, [trigger, hideTooltip]);

  const handleFocus = useCallback(() => {
    if (trigger === 'focus' || trigger === 'hover') {
      showTooltip();
    }
  }, [trigger, showTooltip]);

  const handleBlur = useCallback(() => {
    if (trigger === 'focus' || trigger === 'hover') {
      hideTooltip();
    }
  }, [trigger, hideTooltip]);

  // Close on outside click
  useEffect(() => {
    if (open && closeOnClickOutside && trigger === 'click') {
      const handleClickOutside = (e: MouseEvent) => {
        if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node) &&
            triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, closeOnClickOutside, trigger, setOpen]);

  // Calculate position when tooltip opens
  useEffect(() => {
    if (open) {
      const position = calculatePosition();
      setCalculatedPosition(position);
    } else {
      setCalculatedPosition(null);
    }
  }, [open, calculatePosition]);

  // Recalculate position on scroll/resize
  useEffect(() => {
    if (open) {
      const handleUpdate = () => {
        const position = calculatePosition();
        setCalculatedPosition(position);
      };

      window.addEventListener('scroll', handleUpdate, true);
      window.addEventListener('resize', handleUpdate);
      
      return () => {
        window.removeEventListener('scroll', handleUpdate, true);
        window.removeEventListener('resize', handleUpdate);
      };
    }
  }, [open, calculatePosition]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const triggerProps = {
    ref: triggerRef,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onClick: handleClick,
    'aria-describedby': open ? 'tooltip-content' : undefined,
    'aria-label': ariaLabel,
  };

  const tooltipContent = (
    <div
      ref={tooltipRef}
      id="tooltip-content"
      role="tooltip"
      aria-live="polite"
      className={`
        absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg
        transition-opacity duration-200 ease-in-out
        ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        ${className}
      `}
      style={{
        maxWidth: `${maxWidth}px`,
        zIndex,
        ...calculatedPosition,
      }}
    >
      {allowHTML ? (
        <div dangerouslySetInnerHTML={{ __html: content as string }} />
      ) : (
        content
      )}
      
      {showArrow && calculatedPosition?.arrowPosition && (
        <div
          className={`
            absolute w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-gray-900
            ${arrowClassName}
          `}
          style={{
            top: calculatedPosition.arrowPosition.top,
            left: calculatedPosition.arrowPosition.left,
            transform: calculatedPosition.arrowPosition.transform,
          }}
        />
      )}
    </div>
  );

  return (
    <>
      {React.cloneElement(children as React.ReactElement, triggerProps)}
      {open && calculatedPosition && createPortal(tooltipContent, document.body)}
    </>
  );
};

export default Tooltip;
