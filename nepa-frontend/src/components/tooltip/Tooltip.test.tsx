import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Tooltip from './Tooltip';
import { InfoTooltip, SuccessTooltip, WarningTooltip, ErrorTooltip, HelpTooltip, RichTooltip, IconTooltip } from './TooltipVariants';

// Mock createPortal for testing
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (element: React.ReactElement) => element,
}));

// Mock window methods
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  configurable: true,
  value: 1024,
});

Object.defineProperty(window, 'innerHeight', {
  writable: true,
  configurable: true,
  value: 768,
});

Object.defineProperty(window, 'pageXOffset', {
  writable: true,
  configurable: true,
  value: 0,
});

Object.defineProperty(window, 'pageYOffset', {
  writable: true,
  configurable: true,
  value: 0,
});

describe('Tooltip', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    test('renders trigger element correctly', () => {
      render(
        <Tooltip content="Test tooltip">
          <button>Trigger</button>
        </Tooltip>
      );

      expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument();
    });

    test('shows tooltip on hover by default', async () => {
      render(
        <Tooltip content="Test tooltip">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
      });
    });

    test('hides tooltip on mouse leave', async () => {
      render(
        <Tooltip content="Test tooltip">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
      });

      await user.unhover(trigger);
      
      await waitFor(() => {
        expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
      });
    });

    test('shows tooltip on click when trigger is click', async () => {
      render(
        <Tooltip content="Test tooltip" trigger="click">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.click(trigger);
      
      await waitFor(() => {
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
      });
    });

    test('shows tooltip on focus when trigger is focus', async () => {
      render(
        <Tooltip content="Test tooltip" trigger="focus">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.tab();
      
      await waitFor(() => {
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
      });
    });
  });

  describe('Positioning', () => {
    test('positions tooltip at top by default', async () => {
      render(
        <Tooltip content="Test tooltip" position="top">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toBeInTheDocument();
      });
    });

    test('supports different positions', async () => {
      const positions = [
        'top', 'bottom', 'left', 'right',
        'top-start', 'top-end', 'bottom-start', 'bottom-end',
        'left-start', 'left-end', 'right-start', 'right-end'
      ] as const;

      for (const position of positions) {
        const { unmount } = render(
          <Tooltip content={`Tooltip at ${position}`} position={position}>
            <button>Trigger</button>
          </Tooltip>
        );

        const trigger = screen.getByRole('button');
        
        await user.hover(trigger);
        
        await waitFor(() => {
          expect(screen.getByText(`Tooltip at ${position}`)).toBeInTheDocument();
        });

        unmount();
      }
    });
  });

  describe('Accessibility', () => {
    test('has correct ARIA attributes', () => {
      render(
        <Tooltip content="Test tooltip">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      expect(trigger).toHaveAttribute('aria-describedby', 'tooltip-content');
    });

    test('supports custom aria-label', () => {
      render(
        <Tooltip content="Test tooltip" ariaLabel="Custom label">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      expect(trigger).toHaveAttribute('aria-label', 'Custom label');
    });

    test('tooltip has correct role', async () => {
      render(
        <Tooltip content="Test tooltip">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toBeInTheDocument();
        expect(tooltip).toHaveAttribute('aria-live', 'assertive');
      });
    });

    test('supports keyboard navigation', async () => {
      render(
        <Tooltip content="Test tooltip" trigger="focus">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.tab();
      
      expect(trigger).toHaveFocus();
      
      await waitFor(() => {
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
      });

      await user.tab();
      
      await waitFor(() => {
        expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
      });
    });
  });

  describe('Timing and delays', () => {
    test('respects show delay', async () => {
      const delay = 500;
      render(
        <Tooltip content="Test tooltip" delay={delay}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      const startTime = Date.now();
      
      await user.hover(trigger);
      
      expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
      }, { timeout: delay + 100 });
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeGreaterThanOrEqual(delay - 50);
    });

    test('respects hide delay', async () => {
      const hideDelay = 300;
      render(
        <Tooltip content="Test tooltip" hideDelay={hideDelay}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
      });

      await user.unhover(trigger);
      
      await waitFor(() => {
        expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
      }, { timeout: hideDelay + 100 });
    });
  });

  describe('Controlled mode', () => {
    test('supports controlled open state', () => {
      const { rerender } = render(
        <Tooltip content="Test tooltip" open={true}>
          <button>Trigger</button>
        </Tooltip>
      );

      expect(screen.getByText('Test tooltip')).toBeInTheDocument();

      rerender(
        <Tooltip content="Test tooltip" open={false}>
          <button>Trigger</button>
        </Tooltip>
      );

      expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
    });

    test('calls onOpenChange when open state changes', async () => {
      const onOpenChange = jest.fn();
      
      render(
        <Tooltip content="Test tooltip" onOpenChange={onOpenChange}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      await user.unhover(trigger);
      
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Disabled state', () => {
    test('does not show tooltip when disabled', async () => {
      render(
        <Tooltip content="Test tooltip" disabled>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
      }, { timeout: 500 });
    });
  });

  describe('Arrow and styling', () => {
    test('shows arrow by default', async () => {
      render(
        <Tooltip content="Test tooltip">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        const arrow = document.querySelector('[style*="border"]');
        expect(arrow).toBeInTheDocument();
      });
    });

    test('hides arrow when showArrow is false', async () => {
      render(
        <Tooltip content="Test tooltip" showArrow={false}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        const arrow = document.querySelector('[style*="border"]');
        expect(arrow).not.toBeInTheDocument();
      });
    });

    test('applies custom className', async () => {
      render(
        <Tooltip content="Test tooltip" className="custom-tooltip">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByRole('button');
      
      await user.hover(trigger);
      
      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveClass('custom-tooltip');
      });
    });
  });

  describe('Click outside to close', () => {
    test('closes on outside click when trigger is click', async () => {
      render(
        <div>
          <Tooltip content="Test tooltip" trigger="click">
            <button>Trigger</button>
          </Tooltip>
          <button>Outside</button>
        </div>
      );

      const trigger = screen.getByRole('button', { name: 'Trigger' });
      const outside = screen.getByRole('button', { name: 'Outside' });
      
      await user.click(trigger);
      
      await waitFor(() => {
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
      });

      await user.click(outside);
      
      await waitFor(() => {
        expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
      });
    });
  });
});

describe('Tooltip Variants', () => {
  const user = userEvent.setup();

  test('InfoTooltip renders correctly', async () => {
    render(
      <InfoTooltip content="Info tooltip">
        <button>Trigger</button>
      </InfoTooltip>
    );

    const trigger = screen.getByRole('button');
    
    await user.hover(trigger);
    
    await waitFor(() => {
      expect(screen.getByText('Info tooltip')).toBeInTheDocument();
    });
  });

  test('SuccessTooltip renders correctly', async () => {
    render(
      <SuccessTooltip content="Success tooltip">
        <button>Trigger</button>
      </SuccessTooltip>
    );

    const trigger = screen.getByRole('button');
    
    await user.hover(trigger);
    
    await waitFor(() => {
      expect(screen.getByText('Success tooltip')).toBeInTheDocument();
    });
  });

  test('WarningTooltip renders correctly', async () => {
    render(
      <WarningTooltip content="Warning tooltip">
        <button>Trigger</button>
      </WarningTooltip>
    );

    const trigger = screen.getByRole('button');
    
    await user.hover(trigger);
    
    await waitFor(() => {
      expect(screen.getByText('Warning tooltip')).toBeInTheDocument();
    });
  });

  test('ErrorTooltip renders correctly', async () => {
    render(
      <ErrorTooltip content="Error tooltip">
        <button>Trigger</button>
      </ErrorTooltip>
    );

    const trigger = screen.getByRole('button');
    
    await user.hover(trigger);
    
    await waitFor(() => {
      expect(screen.getByText('Error tooltip')).toBeInTheDocument();
    });
  });

  test('HelpTooltip renders correctly', async () => {
    render(
      <HelpTooltip content="Help tooltip">
        <button>Trigger</button>
      </HelpTooltip>
    );

    const trigger = screen.getByRole('button');
    
    await user.hover(trigger);
    
    await waitFor(() => {
      expect(screen.getByText('Help tooltip')).toBeInTheDocument();
    });
  });

  test('RichTooltip renders with title and footer', async () => {
    render(
      <RichTooltip 
        title="Tooltip Title"
        content="Main content"
        footer="Footer information"
      >
        <button>Trigger</button>
      </RichTooltip>
    );

    const trigger = screen.getByRole('button');
    
    await user.hover(trigger);
    
    await waitFor(() => {
      expect(screen.getByText('Tooltip Title')).toBeInTheDocument();
      expect(screen.getByText('Main content')).toBeInTheDocument();
      expect(screen.getByText('Footer information')).toBeInTheDocument();
    });
  });

  test('IconTooltip renders correctly', async () => {
    render(
      <IconTooltip content="Icon tooltip">
        <span>Icon</span>
      </IconTooltip>
    );

    const icon = screen.getByText('Icon');
    
    await user.hover(icon);
    
    await waitFor(() => {
      expect(screen.getByText('Icon tooltip')).toBeInTheDocument();
    });
  });
});

describe('Tooltip Edge Cases', () => {
  test('handles empty content gracefully', async () => {
    render(
      <Tooltip content="">
        <button>Trigger</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button');
    
    await user.hover(trigger);
    
    await waitFor(() => {
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent('');
    });
  });

  test('handles very long content', async () => {
    const longContent = 'A'.repeat(1000);
    
    render(
      <Tooltip content={longContent} maxWidth={200}>
        <button>Trigger</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button');
    
    await user.hover(trigger);
    
    await waitFor(() => {
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent(longContent);
    });
  });

  test('handles rapid hover/unhover', async () => {
    render(
      <Tooltip content="Test tooltip">
        <button>Trigger</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button');
    
    await user.hover(trigger);
    await user.unhover(trigger);
    await user.hover(trigger);
    await user.unhover(trigger);
    
    await waitFor(() => {
      expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument();
    }, { timeout: 1000 });
  });
});
