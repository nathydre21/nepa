# Dropdown Components

A comprehensive, accessible, and responsive dropdown component system for the NEPA frontend.

## Features

- ✅ **Full Accessibility**: WCAG compliant with proper ARIA attributes, keyboard navigation, and screen reader support
- ✅ **Smart Positioning**: Automatic viewport detection with multiple positioning options
- ✅ **Responsive Design**: Adapts to different screen sizes and orientations
- ✅ **Search Functionality**: Built-in search/filter capabilities
- ✅ **Multiple Variants**: Button, Menu, and Select components
- ✅ **Keyboard Navigation**: Full keyboard support (Arrow keys, Enter, Escape, Tab)
- ✅ **Customizable**: Extensive styling and behavior options
- ✅ **TypeScript**: Full type safety and IntelliSense support

## Components

### Dropdown (Base Component)

The core dropdown component that provides all functionality.

```tsx
import { Dropdown, DropdownItem } from '@/components/dropdown';

const items: DropdownItem[] = [
  { id: '1', label: 'Profile', value: 'profile', icon: <UserIcon /> },
  { id: '2', label: 'Settings', value: 'settings', icon: <SettingsIcon /> },
  { id: 'sep1', label: '', separator: true },
  { id: '3', label: 'Logout', value: 'logout', icon: <LogoutIcon /> },
];

<Dropdown
  trigger={<button>Open Menu</button>}
  items={items}
  ariaLabel="User menu"
  searchable
  position="bottom-right"
/>
```

### DropdownButton

A button-style dropdown with predefined styling.

```tsx
<DropdownButton items={items} variant="outline" size="lg">
  Actions
</DropdownButton>
```

### DropdownMenu

A menu-style dropdown optimized for navigation menus.

```tsx
<DropdownMenu
  trigger={<MenuButton />}
  items={menuItems}
  searchable
  position="auto"
/>
```

### DropdownSelect

A select-style dropdown for form inputs.

```tsx
<DropdownSelect
  options={selectOptions}
  value={selectedValue}
  onChange={handleChange}
  placeholder="Choose an option"
  clearable
  searchable
/>
```

## Props Reference

### DropdownProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `trigger` | `React.ReactNode` | - | The trigger element that opens the dropdown |
| `items` | `DropdownItem[]` | - | Array of dropdown items |
| `className` | `string` | `''` | Additional CSS classes |
| `position` | `'bottom-left' \| 'bottom-right' \| 'top-left' \| 'top-right' \| 'auto'` | `'bottom-left'` | Dropdown position relative to trigger |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Dropdown size |
| `variant` | `'default' \| 'outline' \| 'ghost'` | `'default'` | Visual style variant |
| `disabled` | `boolean` | `false` | Whether the dropdown is disabled |
| `open` | `boolean` | - | Controlled open state |
| `onOpenChange` | `(open: boolean) => void` | - | Callback when open state changes |
| `closeOnSelect` | `boolean` | `true` | Whether to close dropdown on item selection |
| `maxHeight` | `number` | `300` | Maximum height of dropdown in pixels |
| `searchable` | `boolean` | `false` | Enable search functionality |
| `searchPlaceholder` | `string` | `'Search...'` | Placeholder text for search input |
| `emptyMessage` | `string` | `'No items found'` | Message shown when no items match search |
| `ariaLabel` | `string` | - | ARIA label for accessibility |
| `role` | `'menu' \| 'listbox'` | `'menu'` | ARIA role for the dropdown |

### DropdownItem

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | - | Unique identifier for the item |
| `label` | `string` | - | Display text for the item |
| `value` | `string` | - | Value associated with the item |
| `icon` | `React.ReactNode` | - | Icon to display alongside the label |
| `disabled` | `boolean` | `false` | Whether the item is disabled |
| `separator` | `boolean` | `false` | Whether the item is a separator |
| `href` | `string` | - | If provided, makes the item a link |
| `onClick` | `() => void` | - | Click handler for the item |
| `dangerouslySetInnerHTML` | `{ __html: string }` | - | For HTML content (use with caution) |

## Accessibility

### Keyboard Navigation

- **Enter/Space**: Opens dropdown or selects highlighted item
- **Arrow Up/Down**: Navigate between items
- **Escape**: Closes dropdown and returns focus to trigger
- **Tab**: Closes dropdown and moves to next focusable element

### ARIA Attributes

- `aria-expanded`: Indicates whether dropdown is open
- `aria-haspopup`: Indicates dropdown has popup content
- `aria-controls`: Links trigger to dropdown content
- `aria-activedescendant`: Indicates currently highlighted item
- `aria-selected`: Indicates selected state of items
- `aria-disabled`: Indicates disabled state of items

### Screen Reader Support

- Dropdown state changes are announced to screen readers
- Item selections are announced
- Search results are announced
- Proper roles and labels are provided

## Positioning

The dropdown automatically adjusts its position to stay within the viewport:

- **Auto Positioning**: When `position="auto"`, the dropdown will appear above the trigger if there's not enough space below
- **Viewport Detection**: Ensures dropdown doesn't go off-screen
- **Scroll Support**: Dropdown position updates on scroll and resize

## Styling

The dropdown components use Tailwind CSS classes and can be customized through:

1. **Variant Props**: Choose between `default`, `outline`, and `ghost` variants
2. **Size Props**: Choose between `sm`, `md`, and `lg` sizes
3. **Custom Classes**: Add custom CSS classes via the `className` prop
4. **Theme Integration**: Automatically adapts to the current theme

## Examples

### Basic Usage

```tsx
const items = [
  { id: '1', label: 'Edit', value: 'edit' },
  { id: '2', label: 'Delete', value: 'delete' },
];

<Dropdown trigger={<button>Actions</button>} items={items} />
```

### With Icons and Separators

```tsx
const items = [
  { id: '1', label: 'Profile', value: 'profile', icon: <UserIcon /> },
  { id: '2', label: 'Settings', value: 'settings', icon: <SettingsIcon /> },
  { id: 'sep1', label: '', separator: true },
  { id: '3', label: 'Logout', value: 'logout', icon: <LogoutIcon /> },
];

<Dropdown trigger={<button>Menu</button>} items={items} />
```

### Searchable Dropdown

```tsx
const items = [
  { id: '1', label: 'Apple', value: 'apple' },
  { id: '2', label: 'Banana', value: 'banana' },
  { id: '3', label: 'Cherry', value: 'cherry' },
  // ... more items
];

<Dropdown
  trigger={<button>Choose Fruit</button>}
  items={items}
  searchable
  searchPlaceholder="Search fruits..."
  emptyMessage="No fruits found"
/>
```

### Controlled Dropdown

```tsx
const [isOpen, setIsOpen] = useState(false);

<Dropdown
  trigger={<button>Controlled</button>}
  items={items}
  open={isOpen}
  onOpenChange={setIsOpen}
/>
```

### Form Select

```tsx
const [country, setCountry] = useState('');

const countries = [
  { id: '1', label: 'United States', value: 'us' },
  { id: '2', label: 'Canada', value: 'ca' },
  { id: '3', label: 'Mexico', value: 'mx' },
];

<DropdownSelect
  options={countries}
  value={country}
  onChange={setCountry}
  placeholder="Select a country"
  searchable
  clearable
/>
```

## Testing

The dropdown components are fully tested with:

- **Unit Tests**: Component behavior and props
- **Accessibility Tests**: ARIA attributes and keyboard navigation
- **Integration Tests**: User interactions and state management
- **Visual Tests**: Storybook stories for visual testing

Run tests with:
```bash
npm test -- dropdown
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance

- **Optimized Rendering**: Only re-renders when necessary
- **Efficient Search**: Debounced search with minimal impact
- **Memory Management**: Proper cleanup of event listeners
- **Bundle Size**: Tree-shakable components with minimal footprint

## Contributing

When contributing to the dropdown components:

1. Ensure all accessibility features are maintained
2. Add tests for new features
3. Update documentation
4. Follow the existing code style
5. Test keyboard navigation thoroughly

## License

MIT License - see LICENSE file for details.
