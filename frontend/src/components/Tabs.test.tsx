import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import Tabs, { TabItem, TabsProps } from './Tabs';

expect.extend(toHaveNoViolations);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const basicTabs: TabItem[] = [
  { id: 'tab1', label: 'Tab One', content: <p>Content One</p> },
  { id: 'tab2', label: 'Tab Two', content: <p>Content Two</p> },
  { id: 'tab3', label: 'Tab Three', content: <p>Content Three</p> },
];

const tabsWithDisabled: TabItem[] = [
  { id: 'tab1', label: 'Tab One', content: <p>Content One</p> },
  { id: 'tab2', label: 'Tab Two', content: <p>Content Two</p>, disabled: true },
  { id: 'tab3', label: 'Tab Three', content: <p>Content Three</p> },
];

const renderTabs = (props: Partial<TabsProps> = {}) =>
  render(<Tabs tabs={basicTabs} ariaLabel="Test tabs" {...props} />);

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('Tabs – Rendering', () => {
  test('renders all tab triggers', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Tab One' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab Three' })).toBeInTheDocument();
  });

  test('renders tablist with correct aria-label', () => {
    renderTabs({ ariaLabel: 'My tabs' });
    expect(screen.getByRole('tablist', { name: 'My tabs' })).toBeInTheDocument();
  });

  test('first enabled tab is active by default', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('defaultActiveTab sets initial active tab', () => {
    renderTabs({ defaultActiveTab: 'tab2' });
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('active panel content is visible', () => {
    renderTabs();
    expect(screen.getByText('Content One')).toBeVisible();
  });

  test('inactive panel content is hidden', () => {
    renderTabs();
    const tab2 = screen.getByRole('tab', { name: 'Tab Two' });
    const panelId = tab2.getAttribute('aria-controls')!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const panel2 = document.getElementById(panelId)!;
    expect(panel2).toHaveAttribute('hidden');
  });

  test('applies data-variant attribute', () => {
    const { container } = renderTabs({ variant: 'pills' });
    expect(container.querySelector('.tabs')).toHaveAttribute('data-variant', 'pills');
  });

  test('applies data-size attribute', () => {
    const { container } = renderTabs({ size: 'lg' });
    expect(container.querySelector('.tabs')).toHaveAttribute('data-size', 'lg');
  });

  test('applies data-orientation attribute', () => {
    const { container } = renderTabs({ orientation: 'vertical' });
    expect(container.querySelector('.tabs')).toHaveAttribute(
      'data-orientation',
      'vertical',
    );
  });

  test('applies custom className', () => {
    const { container } = renderTabs({ className: 'my-custom-class' });
    expect(container.querySelector('.tabs')).toHaveClass('my-custom-class');
  });
});

// ─── Interaction ──────────────────────────────────────────────────────────────

describe('Tabs – Interaction', () => {
  test('clicking a tab makes it active', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole('tab', { name: 'Tab Two' }));
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('clicking a tab shows its panel content', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole('tab', { name: 'Tab Two' }));
    expect(screen.getByText('Content Two')).toBeVisible();
  });

  test('clicking a tab hides the previously active panel', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole('tab', { name: 'Tab Two' }));
    const tab1 = screen.getByRole('tab', { name: 'Tab One' });
    const panelId = tab1.getAttribute('aria-controls')!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const panel1 = document.getElementById(panelId)!;
    expect(panel1).toHaveAttribute('hidden');
  });

  test('calls onTabChange with the correct id', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    renderTabs({ onTabChange });
    await user.click(screen.getByRole('tab', { name: 'Tab Three' }));
    expect(onTabChange).toHaveBeenCalledWith('tab3');
  });

  test('disabled tab cannot be clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    render(
      <Tabs tabs={tabsWithDisabled} ariaLabel="Test tabs" onTabChange={onTabChange} />,
    );
    await user.click(screen.getByRole('tab', { name: 'Tab Two' }));
    expect(onTabChange).not.toHaveBeenCalled();
  });

  test('disabled tab has aria-disabled', () => {
    render(<Tabs tabs={tabsWithDisabled} ariaLabel="Test tabs" />);
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

// ─── Controlled mode ──────────────────────────────────────────────────────────

describe('Tabs – Controlled mode', () => {
  test('renders with controlled activeTab', () => {
    renderTabs({ activeTab: 'tab3' });
    expect(screen.getByRole('tab', { name: 'Tab Three' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('does not change active tab without external state update', async () => {
    const user = userEvent.setup();
    renderTabs({ activeTab: 'tab1' });
    await user.click(screen.getByRole('tab', { name: 'Tab Two' }));
    // Still tab1 because no state update
    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

// ─── Keyboard Navigation ──────────────────────────────────────────────────────

describe('Tabs – Keyboard navigation', () => {
  test('ArrowRight moves focus to next tab', () => {
    renderTabs();
    const tab1 = screen.getByRole('tab', { name: 'Tab One' });
    tab1.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveFocus();
  });

  test('ArrowLeft moves focus to previous tab', () => {
    renderTabs({ defaultActiveTab: 'tab2' });
    const tab2 = screen.getByRole('tab', { name: 'Tab Two' });
    tab2.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveFocus();
  });

  test('ArrowRight wraps from last to first tab', () => {
    renderTabs({ defaultActiveTab: 'tab3' });
    const tab3 = screen.getByRole('tab', { name: 'Tab Three' });
    tab3.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveFocus();
  });

  test('Home key moves focus to first tab', () => {
    renderTabs({ defaultActiveTab: 'tab3' });
    const tab3 = screen.getByRole('tab', { name: 'Tab Three' });
    tab3.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveFocus();
  });

  test('End key moves focus to last tab', () => {
    renderTabs();
    const tab1 = screen.getByRole('tab', { name: 'Tab One' });
    tab1.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Tab Three' })).toHaveFocus();
  });

  test('ArrowDown moves focus in vertical orientation', () => {
    renderTabs({ orientation: 'vertical' });
    const tab1 = screen.getByRole('tab', { name: 'Tab One' });
    tab1.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveFocus();
  });

  test('ArrowUp moves focus in vertical orientation', () => {
    renderTabs({ orientation: 'vertical', defaultActiveTab: 'tab2' });
    const tab2 = screen.getByRole('tab', { name: 'Tab Two' });
    tab2.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowUp' });
    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveFocus();
  });

  test('skips disabled tabs during keyboard navigation', () => {
    render(<Tabs tabs={tabsWithDisabled} ariaLabel="Test tabs" />);
    const tab1 = screen.getByRole('tab', { name: 'Tab One' });
    tab1.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    // tab2 is disabled, so focus should go to tab3
    expect(screen.getByRole('tab', { name: 'Tab Three' })).toHaveFocus();
  });
});

// ─── Lazy rendering ───────────────────────────────────────────────────────────

describe('Tabs – Lazy rendering', () => {
  test('does not render inactive panel content when lazy=true', () => {
    renderTabs({ lazy: true });
    expect(screen.queryByText('Content Two')).not.toBeInTheDocument();
    expect(screen.queryByText('Content Three')).not.toBeInTheDocument();
  });

  test('renders panel content after it has been activated', async () => {
    const user = userEvent.setup();
    renderTabs({ lazy: true });
    await user.click(screen.getByRole('tab', { name: 'Tab Two' }));
    expect(screen.getByText('Content Two')).toBeInTheDocument();
  });

  test('keeps previously activated panel in DOM', async () => {
    const user = userEvent.setup();
    renderTabs({ lazy: true });
    await user.click(screen.getByRole('tab', { name: 'Tab Two' }));
    await user.click(screen.getByRole('tab', { name: 'Tab One' }));
    // Tab Two was activated, so its content should still be in DOM (just hidden)
    expect(screen.getByText('Content Two')).toBeInTheDocument();
  });
});

// ─── Variants ─────────────────────────────────────────────────────────────────

describe('Tabs – Variants', () => {
  const variants: TabsProps['variant'][] = ['default', 'bordered', 'pills', 'underline'];

  variants.forEach((variant) => {
    test(`renders ${variant} variant without errors`, () => {
      const { container } = renderTabs({ variant });
      expect(container.querySelector('.tabs')).toBeInTheDocument();
    });
  });
});

// ─── Icon & Badge ─────────────────────────────────────────────────────────────

describe('Tabs – Icon and Badge', () => {
  const tabsWithExtras: TabItem[] = [
    {
      id: 'tab1',
      label: 'Notifications',
      content: <p>Notifications content</p>,
      icon: <span data-testid="icon-bell">🔔</span>,
      badge: 5,
    },
    { id: 'tab2', label: 'Settings', content: <p>Settings content</p> },
  ];

  test('renders icon inside trigger', () => {
    render(<Tabs tabs={tabsWithExtras} ariaLabel="Test tabs" />);
    expect(screen.getByTestId('icon-bell')).toBeInTheDocument();
  });

  test('renders badge inside trigger', () => {
    render(<Tabs tabs={tabsWithExtras} ariaLabel="Test tabs" />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('Tabs – Accessibility', () => {
  test('active tab has tabIndex 0, inactive tabs have tabIndex -1', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveAttribute('tabindex', '-1');
  });

  test('each panel is labelled by its trigger', () => {
    renderTabs();
    const tab1 = screen.getByRole('tab', { name: 'Tab One' });
    const panel1 = screen.getByRole('tabpanel', { name: 'Tab One' });
    expect(panel1).toHaveAttribute('aria-labelledby', tab1.id);
  });

  test('tablist has aria-orientation for horizontal', () => {
    renderTabs({ orientation: 'horizontal' });
    expect(screen.getByRole('tablist')).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
  });

  test('tablist has aria-orientation for vertical', () => {
    renderTabs({ orientation: 'vertical' });
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
  });

  test('passes axe accessibility audit', async () => {
    const { container } = renderTabs();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('passes axe audit for vertical orientation', async () => {
    const { container } = renderTabs({ orientation: 'vertical' });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('passes axe audit for pills variant', async () => {
    const { container } = renderTabs({ variant: 'pills' });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
