import type { Meta, StoryObj } from '@storybook/react';
import { Dropdown, DropdownButton, DropdownMenu, DropdownSelect } from './index';
import { DropdownItem } from './Dropdown';

const meta: Meta<typeof Dropdown> = {
  title: 'Components/Dropdown',
  component: Dropdown,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Dropdown>;

const sampleItems: DropdownItem[] = [
  { id: '1', label: 'Profile', value: 'profile', icon: '👤' },
  { id: '2', label: 'Settings', value: 'settings', icon: '⚙️' },
  { id: 'sep1', label: '', separator: true },
  { id: '3', label: 'Help', value: 'help', icon: '❓' },
  { id: '4', label: 'Logout', value: 'logout', icon: '🚪' },
];

export const Default: Story = {
  args: {
    trigger: <button>Open Dropdown</button>,
    items: sampleItems,
    ariaLabel: 'Example dropdown',
  },
};

export const WithSearch: Story = {
  args: {
    trigger: <button>Searchable Dropdown</button>,
    items: [
      { id: '1', label: 'Apple', value: 'apple' },
      { id: '2', label: 'Banana', value: 'banana' },
      { id: '3', label: 'Cherry', value: 'cherry' },
      { id: '4', label: 'Date', value: 'date' },
      { id: '5', label: 'Elderberry', value: 'elderberry' },
    ],
    searchable: true,
    searchPlaceholder: 'Search fruits...',
    ariaLabel: 'Searchable dropdown',
  },
};

export const Disabled: Story = {
  args: {
    trigger: <button>Disabled Dropdown</button>,
    items: sampleItems,
    disabled: true,
    ariaLabel: 'Disabled dropdown',
  },
};

export const DifferentPositions: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <Dropdown
        trigger={<button>Bottom Left</button>}
        items={sampleItems}
        position="bottom-left"
        ariaLabel="Bottom left dropdown"
      />
      <Dropdown
        trigger={<button>Bottom Right</button>}
        items={sampleItems}
        position="bottom-right"
        ariaLabel="Bottom right dropdown"
      />
      <Dropdown
        trigger={<button>Top Left</button>}
        items={sampleItems}
        position="top-left"
        ariaLabel="Top left dropdown"
      />
      <Dropdown
        trigger={<button>Auto Position</button>}
        items={sampleItems}
        position="auto"
        ariaLabel="Auto position dropdown"
      />
    </div>
  ),
};

export const DifferentSizes: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <Dropdown
        trigger={<button className="text-xs">Small</button>}
        items={sampleItems}
        size="sm"
        ariaLabel="Small dropdown"
      />
      <Dropdown
        trigger={<button className="text-sm">Medium</button>}
        items={sampleItems}
        size="md"
        ariaLabel="Medium dropdown"
      />
      <Dropdown
        trigger={<button className="text-base">Large</button>}
        items={sampleItems}
        size="lg"
        ariaLabel="Large dropdown"
      />
    </div>
  ),
};

export const DifferentVariants: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <DropdownButton
        items={sampleItems}
        variant="default"
      >
        Default
      </DropdownButton>
      <DropdownButton
        items={sampleItems}
        variant="outline"
      >
        Outline
      </DropdownButton>
      <DropdownButton
        items={sampleItems}
        variant="ghost"
      >
        Ghost
      </DropdownButton>
    </div>
  ),
};

export const WithDisabledItems: Story = {
  args: {
    trigger: <button>Dropdown with Disabled Items</button>,
    items: [
      { id: '1', label: 'Active Item 1', value: 'active1' },
      { id: '2', label: 'Disabled Item', value: 'disabled', disabled: true },
      { id: '3', label: 'Active Item 2', value: 'active2' },
    ],
    ariaLabel: 'Dropdown with disabled items',
  },
};

export const MenuExample: Story = {
  render: () => (
    <DropdownMenu
      trigger={
        <button className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Menu
        </button>
      }
      items={[
        { id: '1', label: 'New File', value: 'new', icon: '📄' },
        { id: '2', label: 'Open File', value: 'open', icon: '📂' },
        { id: 'sep1', label: '', separator: true },
        { id: '3', label: 'Save', value: 'save', icon: '💾' },
        { id: '4', label: 'Save As', value: 'saveas', icon: '💾' },
        { id: 'sep2', label: '', separator: true },
        { id: '5', label: 'Exit', value: 'exit', icon: '🚪' },
      ]}
    />
  ),
};

export const SelectExample: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Basic Select</label>
        <DropdownSelect
          options={[
            { id: '1', label: 'Option 1', value: 'opt1' },
            { id: '2', label: 'Option 2', value: 'opt2' },
            { id: '3', label: 'Option 3', value: 'opt3' },
          ]}
          placeholder="Choose an option"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Clearable Select</label>
        <DropdownSelect
          options={[
            { id: '1', label: 'Red', value: 'red' },
            { id: '2', label: 'Green', value: 'green' },
            { id: '3', label: 'Blue', value: 'blue' },
          ]}
          placeholder="Select a color"
          clearable
          value="green"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Searchable Select</label>
        <DropdownSelect
          options={[
            { id: '1', label: 'United States', value: 'us' },
            { id: '2', label: 'United Kingdom', value: 'uk' },
            { id: '3', label: 'Canada', value: 'ca' },
            { id: '4', label: 'Australia', value: 'au' },
            { id: '5', label: 'Germany', value: 'de' },
            { id: '6', label: 'France', value: 'fr' },
            { id: '7', label: 'Japan', value: 'jp' },
            { id: '8', label: 'China', value: 'cn' },
          ]}
          placeholder="Select a country"
          searchable
        />
      </div>
    </div>
  ),
};

export const InteractiveExample: Story = {
  render: () => {
    const [selectedValue, setSelectedValue] = React.useState('');
    
    const handleItemClick = (value: string) => {
      alert(`Selected: ${value}`);
    };

    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 mb-2">
            Selected value: {selectedValue || 'None'}
          </p>
          <DropdownSelect
            options={[
              { id: '1', label: 'First Choice', value: 'first' },
              { id: '2', label: 'Second Choice', value: 'second' },
              { id: '3', label: 'Third Choice', value: 'third' },
            ]}
            value={selectedValue}
            onChange={(value) => setSelectedValue(value)}
            placeholder="Make a selection"
          />
        </div>
        
        <DropdownButton
          items={[
            { id: '1', label: 'Say Hello', value: 'hello', onClick: () => alert('Hello!') },
            { id: '2', label: 'Say Goodbye', value: 'goodbye', onClick: () => alert('Goodbye!') },
            { id: 'sep1', label: '', separator: true },
            { id: '3', label: 'Show Time', value: 'time', onClick: () => alert(new Date().toLocaleTimeString()) },
          ]}
        >
          Actions
        </DropdownButton>
      </div>
    );
  },
};

export const ResponsiveExample: Story = {
  render: () => (
    <div className="p-8 bg-gray-100 rounded-lg">
      <div className="max-w-md mx-auto space-y-4">
        <h3 className="text-lg font-semibold">Responsive Dropdowns</h3>
        <p className="text-sm text-gray-600">
          These dropdowns adapt to different screen sizes and positions.
        </p>
        
        <DropdownMenu
          trigger={<button className="w-full">Responsive Menu</button>}
          items={[
            { id: '1', label: 'Dashboard', value: 'dashboard' },
            { id: '2', label: 'Analytics', value: 'analytics' },
            { id: '3', label: 'Reports', value: 'reports' },
            { id: 'sep1', label: '', separator: true },
            { id: '4', label: 'Settings', value: 'settings' },
            { id: '5', label: 'Help', value: 'help' },
          ]}
          searchable
        />
        
        <div className="flex gap-2">
          <DropdownSelect
            options={[
              { id: '1', label: 'Today', value: 'today' },
              { id: '2', label: 'This Week', value: 'week' },
              { id: '3', label: 'This Month', value: 'month' },
              { id: '4', label: 'This Year', value: 'year' },
            ]}
            placeholder="Time range"
            className="flex-1"
          />
          
          <DropdownButton
            items={[
              { id: '1', label: 'Export PDF', value: 'pdf' },
              { id: '2', label: 'Export Excel', value: 'excel' },
              { id: '3', label: 'Export CSV', value: 'csv' },
            ]}
            className="flex-shrink-0"
          >
            Export
          </DropdownButton>
        </div>
      </div>
    </div>
  ),
};
