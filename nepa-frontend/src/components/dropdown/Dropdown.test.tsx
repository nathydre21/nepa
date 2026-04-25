import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropdown, DropdownItem } from './Dropdown';
import { DropdownButton } from './DropdownButton';
import { DropdownMenu } from './DropdownMenu';
import { DropdownSelect } from './DropdownSelect';

// Mock accessibility utilities
jest.mock('../utils/accessibility', () => ({
  ariaLabels: {
    dropdown: 'Dropdown',
    searchInput: 'Search input',
  },
  keyboardKeys: {
    ENTER: 'Enter',
    SPACE: ' ',
    ESCAPE: 'Escape',
    ARROW_DOWN: 'ArrowDown',
    ARROW_UP: 'ArrowUp',
    TAB: 'Tab',
  },
  announceToScreenReader: jest.fn(),
}));

// Mock theme context
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
  }),
}));

const mockItems: DropdownItem[] = [
  { id: '1', label: 'Item 1', value: 'item1' },
  { id: '2', label: 'Item 2', value: 'item2' },
  { id: '3', label: 'Item 3', value: 'item3', disabled: true },
  { id: '4', label: 'Item 4', value: 'item4' },
];

describe('Dropdown', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders trigger button', () => {
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
      />
    );

    expect(screen.getByRole('button', { name: 'Open Dropdown' })).toBeInTheDocument();
  });

  test('opens dropdown when trigger is clicked', async () => {
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    await user.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  test('closes dropdown when clicking outside', async () => {
    render(
      <div>
        <Dropdown
          trigger={<button>Open Dropdown</button>}
          items={mockItems}
          ariaLabel="Test dropdown"
        />
        <button data-testid="outside">Outside</button>
      </div>
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    await user.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();

    const outside = screen.getByTestId('outside');
    await user.click(outside);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('handles item selection', async () => {
    const onItemClick = jest.fn();
    const itemsWithClick = mockItems.map(item => ({
      ...item,
      onClick: onItemClick,
    }));

    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={itemsWithClick}
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    await user.click(trigger);

    const item1 = screen.getByText('Item 1');
    await user.click(item1);

    expect(onItemClick).toHaveBeenCalledWith();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('supports keyboard navigation', async () => {
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    trigger.focus();

    // Open with arrow down
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Navigate items
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Item 1' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Item 2' })).toHaveAttribute('aria-selected', 'true');

    // Select with Enter
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('closes with Escape key', async () => {
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    await user.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('disables dropdown when disabled prop is true', () => {
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
        disabled
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
  });

  test('supports search functionality', async () => {
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
        searchable
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    await user.click(trigger);

    const searchInput = screen.getByLabelText('Search dropdown items');
    expect(searchInput).toBeInTheDocument();

    await user.type(searchInput, 'Item 2');
    
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });

  test('shows empty message when no items match search', async () => {
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
        searchable
        emptyMessage="No items found"
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    await user.click(trigger);

    const searchInput = screen.getByLabelText('Search dropdown items');
    await user.type(searchInput, 'nonexistent');

    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  test('handles separators', async () => {
    const itemsWithSeparator = [
      { id: '1', label: 'Item 1', value: 'item1' },
      { id: 'sep1', label: '', separator: true },
      { id: '2', label: 'Item 2', value: 'item2' },
    ];

    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={itemsWithSeparator}
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    await user.click(trigger);

    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});

describe('DropdownButton', () => {
  const user = userEvent.setup();

  test('renders as button variant', () => {
    render(
      <DropdownButton
        items={mockItems}
        variant="outline"
        size="lg"
      >
        Button Dropdown
      </DropdownButton>
    );

    const button = screen.getByRole('button', { name: /Button Dropdown/ });
    expect(button).toHaveClass('border', 'border-input');
  });
});

describe('DropdownMenu', () => {
  const user = userEvent.setup();

  test('renders with menu role', async () => {
    render(
      <DropdownMenu
        trigger={<button>Menu</button>}
        items={mockItems}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Menu' });
    await user.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});

describe('DropdownSelect', () => {
  const user = userEvent.setup();

  test('renders with placeholder', () => {
    render(
      <DropdownSelect
        options={mockItems}
        placeholder="Select an option"
      />
    );

    expect(screen.getByText('Select an option')).toBeInTheDocument();
  });

  test('shows selected value', () => {
    render(
      <DropdownSelect
        options={mockItems}
        value="item2"
      />
    );

    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  test('handles selection change', async () => {
    const onChange = jest.fn();
    render(
      <DropdownSelect
        options={mockItems}
        onChange={onChange}
      />
    );

    const trigger = screen.getByRole('button');
    await user.click(trigger);

    const item1 = screen.getByText('Item 1');
    await user.click(item1);

    expect(onChange).toHaveBeenCalledWith('item1', mockItems[0]);
  });

  test('supports clearable functionality', async () => {
    const onChange = jest.fn();
    render(
      <DropdownSelect
        options={mockItems}
        value="item1"
        onChange={onChange}
        clearable
      />
    );

    const clearButton = screen.getByLabelText('Clear selection');
    await user.click(clearButton);

    expect(onChange).toHaveBeenCalledWith('', expect.any(Object));
  });
});

describe('Accessibility', () => {
  const user = userEvent.setup();

  test('has proper ARIA attributes', () => {
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  test('announces to screen reader', async () => {
    const { announceToScreenReader } = require('../utils/accessibility');
    
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    await user.click(trigger);

    const item1 = screen.getByText('Item 1');
    await user.click(item1);

    expect(announceToScreenReader).toHaveBeenCalledWith('Selected: Item 1');
  });

  test('supports keyboard focus management', async () => {
    render(
      <Dropdown
        trigger={<button>Open Dropdown</button>}
        items={mockItems}
        ariaLabel="Test dropdown"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Dropdown' });
    trigger.focus();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');

    expect(trigger).toHaveFocus();
  });
});
