import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  AccordionItemWrapper,
} from './Accordion';

describe('Accordion', () => {
  const renderAccordion = (props = {}) => {
    return render(
      <Accordion {...props}>
        <AccordionItemWrapper
          id="item-1"
          trigger={<AccordionTrigger>Item 1</AccordionTrigger>}
          content={<AccordionContent>Content 1</AccordionContent>}
        />
        <AccordionItemWrapper
          id="item-2"
          trigger={<AccordionTrigger>Item 2</AccordionTrigger>}
          content={<AccordionContent>Content 2</AccordionContent>}
        />
        <AccordionItemWrapper
          id="item-3"
          trigger={<AccordionTrigger>Item 3</AccordionTrigger>}
          content={<AccordionContent>Content 3</AccordionContent>}
        />
      </Accordion>
    );
  };

  describe('Rendering', () => {
    test('renders accordion with items', () => {
      renderAccordion();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Item 3')).toBeInTheDocument();
    });

    test('renders with default variant', () => {
      const { container } = renderAccordion();
      const accordion = container.querySelector('.accordion');
      expect(accordion).toHaveAttribute('data-variant', 'default');
    });

    test('renders with custom variant', () => {
      const { container } = renderAccordion({ variant: 'bordered' });
      const accordion = container.querySelector('.accordion');
      expect(accordion).toHaveAttribute('data-variant', 'bordered');
    });

    test('renders with custom size', () => {
      const { container } = renderAccordion({ size: 'lg' });
      const accordion = container.querySelector('.accordion');
      expect(accordion).toHaveAttribute('data-size', 'lg');
    });

    test('applies custom className', () => {
      const { container } = renderAccordion({ className: 'custom-class' });
      const accordion = container.querySelector('.accordion');
      expect(accordion).toHaveClass('custom-class');
    });
  });

  describe('Single Item Mode (default)', () => {
    test('opens item when trigger is clicked', async () => {
      renderAccordion();
      const trigger = screen.getByText('Item 1');
      
      fireEvent.click(trigger);
      
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
    });

    test('closes other items when opening a new one', async () => {
      renderAccordion();
      const trigger1 = screen.getByText('Item 1');
      const trigger2 = screen.getByText('Item 2');
      
      // Open first item
      fireEvent.click(trigger1);
      await waitFor(() => {
        expect(trigger1).toHaveAttribute('aria-expanded', 'true');
      });
      
      // Open second item
      fireEvent.click(trigger2);
      await waitFor(() => {
        expect(trigger2).toHaveAttribute('aria-expanded', 'true');
        expect(trigger1).toHaveAttribute('aria-expanded', 'false');
      });
    });

    test('closes item when trigger is clicked again (collapsible)', async () => {
      renderAccordion({ collapsible: true });
      const trigger = screen.getByText('Item 1');
      
      // Open
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
      
      // Close
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
      });
    });

    test('does not close item when collapsible is false', async () => {
      renderAccordion({ collapsible: false });
      const trigger = screen.getByText('Item 1');
      
      // Open
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
      
      // Try to close
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
    });
  });

  describe('Multiple Items Mode', () => {
    test('allows multiple items to be open', async () => {
      renderAccordion({ allowMultiple: true });
      const trigger1 = screen.getByText('Item 1');
      const trigger2 = screen.getByText('Item 2');
      
      fireEvent.click(trigger1);
      fireEvent.click(trigger2);
      
      await waitFor(() => {
        expect(trigger1).toHaveAttribute('aria-expanded', 'true');
        expect(trigger2).toHaveAttribute('aria-expanded', 'true');
      });
    });

    test('closes individual items independently', async () => {
      renderAccordion({ allowMultiple: true });
      const trigger1 = screen.getByText('Item 1');
      const trigger2 = screen.getByText('Item 2');
      
      // Open both
      fireEvent.click(trigger1);
      fireEvent.click(trigger2);
      
      await waitFor(() => {
        expect(trigger1).toHaveAttribute('aria-expanded', 'true');
        expect(trigger2).toHaveAttribute('aria-expanded', 'true');
      });
      
      // Close first
      fireEvent.click(trigger1);
      
      await waitFor(() => {
        expect(trigger1).toHaveAttribute('aria-expanded', 'false');
        expect(trigger2).toHaveAttribute('aria-expanded', 'true');
      });
    });
  });

  describe('Controlled Mode', () => {
    test('respects controlled openItems prop', () => {
      renderAccordion({ openItems: ['item-1', 'item-2'] });
      const trigger1 = screen.getByText('Item 1');
      const trigger2 = screen.getByText('Item 2');
      const trigger3 = screen.getByText('Item 3');
      
      expect(trigger1).toHaveAttribute('aria-expanded', 'true');
      expect(trigger2).toHaveAttribute('aria-expanded', 'true');
      expect(trigger3).toHaveAttribute('aria-expanded', 'false');
    });

    test('calls onOpenChange when items change', async () => {
      const onOpenChange = jest.fn();
      renderAccordion({ onOpenChange });
      const trigger = screen.getByText('Item 1');
      
      fireEvent.click(trigger);
      
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(['item-1']);
      });
    });

    test('calls onOpenChange with multiple items', async () => {
      const onOpenChange = jest.fn();
      renderAccordion({ allowMultiple: true, onOpenChange });
      const trigger1 = screen.getByText('Item 1');
      const trigger2 = screen.getByText('Item 2');
      
      fireEvent.click(trigger1);
      fireEvent.click(trigger2);
      
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenLastCalledWith(['item-1', 'item-2']);
      });
    });
  });

  describe('Default Open Items', () => {
    test('opens items specified in defaultOpenItems', () => {
      renderAccordion({ defaultOpenItems: ['item-2'] });
      const trigger1 = screen.getByText('Item 1');
      const trigger2 = screen.getByText('Item 2');
      
      expect(trigger1).toHaveAttribute('aria-expanded', 'false');
      expect(trigger2).toHaveAttribute('aria-expanded', 'true');
    });

    test('opens multiple default items when allowMultiple is true', () => {
      renderAccordion({ 
        allowMultiple: true, 
        defaultOpenItems: ['item-1', 'item-3'] 
      });
      const trigger1 = screen.getByText('Item 1');
      const trigger2 = screen.getByText('Item 2');
      const trigger3 = screen.getByText('Item 3');
      
      expect(trigger1).toHaveAttribute('aria-expanded', 'true');
      expect(trigger2).toHaveAttribute('aria-expanded', 'false');
      expect(trigger3).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('Disabled State', () => {
    test('disables all items when accordion is disabled', () => {
      renderAccordion({ disabled: true });
      const trigger = screen.getByText('Item 1');
      
      expect(trigger).toBeDisabled();
    });

    test('does not open items when disabled', async () => {
      renderAccordion({ disabled: true });
      const trigger = screen.getByText('Item 1');
      
      fireEvent.click(trigger);
      
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
      });
    });

    test('disables individual item', () => {
      render(
        <Accordion>
          <AccordionItemWrapper
            id="item-1"
            disabled
            trigger={<AccordionTrigger>Item 1</AccordionTrigger>}
            content={<AccordionContent>Content 1</AccordionContent>}
          />
        </Accordion>
      );
      
      const trigger = screen.getByText('Item 1');
      expect(trigger).toBeDisabled();
    });
  });

  describe('Keyboard Navigation', () => {
    test('opens item with Enter key', async () => {
      const user = userEvent.setup();
      renderAccordion();
      const trigger = screen.getByText('Item 1');
      
      trigger.focus();
      await user.keyboard('{Enter}');
      
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
    });

    test('opens item with Space key', async () => {
      const user = userEvent.setup();
      renderAccordion();
      const trigger = screen.getByText('Item 1');
      
      trigger.focus();
      await user.keyboard(' ');
      
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
    });

    test('closes item with Enter key when open', async () => {
      const user = userEvent.setup();
      renderAccordion();
      const trigger = screen.getByText('Item 1');
      
      // Open
      trigger.focus();
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
      
      // Close
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
      });
    });
  });

  describe('Accessibility', () => {
    test('trigger has correct aria-expanded attribute', () => {
      renderAccordion({ defaultOpenItems: ['item-1'] });
      const trigger1 = screen.getByText('Item 1');
      const trigger2 = screen.getByText('Item 2');
      
      expect(trigger1).toHaveAttribute('aria-expanded', 'true');
      expect(trigger2).toHaveAttribute('aria-expanded', 'false');
    });

    test('trigger has correct aria-controls attribute', () => {
      renderAccordion();
      const trigger = screen.getByText('Item 1');
      
      expect(trigger).toHaveAttribute('aria-controls', 'accordion-content-item-1');
    });

    test('content has role="region"', () => {
      const { container } = renderAccordion();
      const contents = container.querySelectorAll('[role="region"]');
      
      expect(contents.length).toBe(3);
    });

    test('content has correct data-state attribute', () => {
      const { container } = renderAccordion({ defaultOpenItems: ['item-1'] });
      const contents = container.querySelectorAll('.accordion-content');
      
      expect(contents[0]).toHaveAttribute('data-state', 'open');
      expect(contents[1]).toHaveAttribute('data-state', 'closed');
    });

    test('trigger icon has aria-hidden', () => {
      const { container } = renderAccordion();
      const icons = container.querySelectorAll('.accordion-trigger-icon');
      
      icons.forEach(icon => {
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
    });

    test('disabled items have correct data-disabled attribute', () => {
      render(
        <Accordion>
          <AccordionItemWrapper
            id="item-1"
            disabled
            trigger={<AccordionTrigger>Item 1</AccordionTrigger>}
            content={<AccordionContent>Content 1</AccordionContent>}
          />
        </Accordion>
      );
      
      const { container } = render(
        <Accordion>
          <AccordionItemWrapper
            id="item-1"
            disabled
            trigger={<AccordionTrigger>Item 1</AccordionTrigger>}
            content={<AccordionContent>Content 1</AccordionContent>}
          />
        </Accordion>
      );
      
      const item = container.querySelector('.accordion-item');
      expect(item).toHaveAttribute('data-disabled', 'true');
    });
  });

  describe('Custom Icons', () => {
    test('renders custom icon', () => {
      render(
        <Accordion>
          <AccordionItemWrapper
            id="item-1"
            trigger={
              <AccordionTrigger icon={<span data-testid="custom-icon">+</span>}>
                Item 1
              </AccordionTrigger>
            }
            content={<AccordionContent>Content 1</AccordionContent>}
          />
        </Accordion>
      );
      
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });

    test('hides icon when hideIcon is true', () => {
      const { container } = render(
        <Accordion>
          <AccordionItemWrapper
            id="item-1"
            trigger={<AccordionTrigger hideIcon>Item 1</AccordionTrigger>}
            content={<AccordionContent>Content 1</AccordionContent>}
          />
        </Accordion>
      );
      
      const icon = container.querySelector('.accordion-trigger-icon');
      expect(icon).not.toBeInTheDocument();
    });
  });

  describe('Content Animation', () => {
    test('content has transition styles', () => {
      const { container } = renderAccordion();
      const content = container.querySelector('.accordion-content');
      
      expect(content).toHaveStyle({
        transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      });
    });

    test('content height changes when opened', async () => {
      const { container } = renderAccordion();
      const trigger = screen.getByText('Item 1');
      const content = container.querySelector('.accordion-content');
      
      expect(content).toHaveStyle({ height: '0px' });
      
      fireEvent.click(trigger);
      
      await waitFor(() => {
        expect(content).not.toHaveStyle({ height: '0px' });
      });
    });
  });

  describe('Variants', () => {
    test('renders bordered variant', () => {
      const { container } = renderAccordion({ variant: 'bordered' });
      expect(container.querySelector('.accordion')).toHaveClass('accordion-bordered');
    });

    test('renders separated variant', () => {
      const { container } = renderAccordion({ variant: 'separated' });
      expect(container.querySelector('.accordion')).toHaveClass('accordion-separated');
    });

    test('renders ghost variant', () => {
      const { container } = renderAccordion({ variant: 'ghost' });
      expect(container.querySelector('.accordion')).toHaveClass('accordion-ghost');
    });
  });

  describe('Sizes', () => {
    test('renders small size', () => {
      const { container } = renderAccordion({ size: 'sm' });
      expect(container.querySelector('.accordion')).toHaveClass('accordion-sm');
    });

    test('renders large size', () => {
      const { container } = renderAccordion({ size: 'lg' });
      expect(container.querySelector('.accordion')).toHaveClass('accordion-lg');
    });
  });
});
