# Tooltip Component System

A comprehensive, accessible, and flexible tooltip system for React applications built with TypeScript and Tailwind CSS.

## Features

- ✅ **Multiple trigger types**: Hover, click, focus, and manual control
- ✅ **12 positioning options**: Top, bottom, left, right with start/end alignments
- ✅ **Accessibility first**: ARIA attributes, keyboard navigation, screen reader support
- ✅ **Rich content support**: HTML content, custom styling, and complex layouts
- ✅ **Variant system**: Pre-styled tooltips for different use cases (info, success, warning, error, help)
- ✅ **Smart positioning**: Automatic viewport overflow detection and adjustment
- ✅ **Performance optimized**: Portal rendering, debounced events, and cleanup management
- ✅ **Customizable**: Delays, styling, animations, and behavior controls
- ✅ **TypeScript support**: Full type safety and IntelliSense support
- ✅ **Testing ready**: Comprehensive test suite with Jest and React Testing Library

## Installation

The tooltip system is already included in the frontend components. Simply import from the tooltip module:

```typescript
import {
  Tooltip,
  InfoTooltip,
  SuccessTooltip,
  WarningTooltip,
  ErrorTooltip,
  HelpTooltip,
  RichTooltip,
  IconTooltip,
  TooltipProvider,
  useTooltipContext
} from '../components/tooltip';
```

## Basic Usage

### Simple Tooltip

```tsx
import { Tooltip } from '../components/tooltip';

function MyComponent() {
  return (
    <Tooltip content="This is a tooltip">
      <button>Hover me</button>
    </Tooltip>
  );
}
```

### Different Positions

```tsx
<Tooltip content="Top tooltip" position="top">
  <button>Top</button>
</Tooltip>

<Tooltip content="Right tooltip" position="right">
  <button>Right</button>
</Tooltip>

<Tooltip content="Bottom-start tooltip" position="bottom-start">
  <button>Bottom Start</button>
</Tooltip>
```

### Different Triggers

```tsx
<Tooltip content="Hover trigger" trigger="hover">
  <button>Hover</button>
</Tooltip>

<Tooltip content="Click trigger" trigger="click">
  <button>Click</button>
</Tooltip>

<Tooltip content="Focus trigger" trigger="focus">
  <input type="text" placeholder="Focus me" />
</Tooltip>
```

## Advanced Usage

### Colored Variants

```tsx
import { InfoTooltip, SuccessTooltip, WarningTooltip, ErrorTooltip, HelpTooltip } from '../components/tooltip';

<InfoTooltip content="This provides additional information">
  <button>Info</button>
</InfoTooltip>

<SuccessTooltip content="Operation completed successfully!">
  <button>Success</button>
</SuccessTooltip>

<WarningTooltip content="Please review this carefully">
  <button>Warning</button>
</WarningTooltip>

<ErrorTooltip content="An error occurred">
  <button>Error</button>
</ErrorTooltip>

<HelpTooltip content="This provides help information">
  <button>Help</button>
</HelpTooltip>
```

### Rich Content

```tsx
import { RichTooltip } from '../components/tooltip';

<RichTooltip
  title="Transaction Details"
  content="This transaction was processed on the Stellar network and has been confirmed."
  footer="Transaction ID: TX123456789"
>
  <button>View Details</button>
</RichTooltip>
```

### Icon Tooltips

```tsx
import { IconTooltip } from '../components/tooltip';

<div className="flex items-center gap-2">
  <span>Balance:</span>
  <span>$1,234.56</span>
  <IconTooltip content="Your current account balance including pending transactions" />
</div>
```

### Controlled Tooltips

```tsx
import { useState } from 'react';
import { Tooltip } from '../components/tooltip';

function ControlledExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <Tooltip
        content="This tooltip is controlled programmatically"
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <button>Controlled Tooltip</button>
      </Tooltip>
      <button onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? 'Hide' : 'Show'} Tooltip
      </button>
    </div>
  );
}
```

## API Reference

### Tooltip Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `ReactNode` | **Required** | Content to display in the tooltip |
| `children` | `ReactNode` | **Required** | Trigger element that activates the tooltip |
| `position` | `'top' \| 'bottom' \| 'left' \| 'right' \| 'top-start' \| 'top-end' \| 'bottom-start' \| 'bottom-end' \| 'left-start' \| 'left-end' \| 'right-start' \| 'right-end'` | `'top'` | Position of the tooltip relative to the trigger |
| `trigger` | `'hover' \| 'click' \| 'focus' \| 'manual'` | `'hover'` | How the tooltip is triggered |
| `disabled` | `boolean` | `false` | Whether the tooltip is disabled |
| `delay` | `number` | `300` | Delay before showing the tooltip (ms) |
| `hideDelay` | `number` | `150` | Delay before hiding the tooltip (ms) |
| `maxWidth` | `number` | `300` | Maximum width of the tooltip |
| `showArrow` | `boolean` | `true` | Whether to show an arrow |
| `className` | `string` | `''` | Custom className for the tooltip |
| `arrowClassName` | `string` | `''` | Custom className for the arrow |
| `closeOnClickOutside` | `boolean` | `true` | Whether to close on outside click |
| `zIndex` | `number` | `50` | Z-index for the tooltip |
| `offset` | `number` | `8` | Offset from the trigger element |
| `allowHTML` | `boolean` | `false` | Whether to allow HTML content |
| `ariaLabel` | `string` | `undefined` | ARIA label for accessibility |
| `preventOverflow` | `boolean` | `true` | Prevent tooltip from being cut off by viewport |
| `open` | `boolean` | `undefined` | Manual control of tooltip visibility |
| `onOpenChange` | `(open: boolean) => void` | `undefined` | Callback when tooltip visibility changes |

### Variant Props

#### InfoTooltip, SuccessTooltip, WarningTooltip, ErrorTooltip, HelpTooltip

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `ReactNode` | **Required** | Content to display in the tooltip |
| `children` | `ReactNode` | **Required** | Trigger element |
| `position` | `TooltipProps['position']` | `'top'` | Tooltip position |
| `className` | `string` | `''` | Additional custom classes |

#### RichTooltip

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `ReactNode` | `undefined` | Title section |
| `content` | `ReactNode` | **Required** | Main content |
| `footer` | `ReactNode` | `undefined` | Footer section |
| `children` | `ReactNode` | **Required** | Trigger element |
| `position` | `TooltipProps['position']` | `'top'` | Tooltip position |
| `maxWidth` | `number` | `400` | Maximum width |
| `className` | `string` | `''` | Additional custom classes |

#### IconTooltip

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `ReactNode` | **Required** | Tooltip content |
| `icon` | `ReactNode` | Info icon | Custom icon |
| `position` | `TooltipProps['position']` | `'top'` | Tooltip position |
| `size` | `'sm' \| 'md' \| 'lg'` | `'sm'` | Icon size |
| `className` | `string` | `''` | Additional custom classes |

## Accessibility

### ARIA Attributes

The tooltip system automatically adds appropriate ARIA attributes:

- `aria-describedby`: Links trigger to tooltip content
- `role="tooltip"`: Identifies tooltip element
- `aria-live`: Announces content to screen readers
- `aria-label`: Custom labels for better context

### Keyboard Navigation

- **Tab**: Focus through focusable tooltips
- **Enter/Space**: Toggle click tooltips
- **Escape**: Close open tooltips

### Screen Reader Support

- Automatic announcements for dynamic content
- Live region for important changes
- Proper semantic markup

## Styling

### Default Styling

The tooltips use Tailwind CSS classes with a consistent design system:

```css
/* Default tooltip */
.bg-gray-900 text-white rounded-lg shadow-lg

/* Arrow */
.border-t-gray-900
```

### Custom Styling

You can override styles using the `className` prop:

```tsx
<Tooltip
  content="Custom styled tooltip"
  className="bg-purple-600 text-purple-100 border-2 border-purple-700"
  arrowClassName="border-t-purple-600"
>
  <button>Custom Style</button>
</Tooltip>
```

### CSS Variables

The tooltip system supports CSS variables for theming:

```css
.tooltip {
  --tooltip-bg: #1f2937;
  --tooltip-color: #ffffff;
  --tooltip-border: #374151;
}
```

## Performance

### Optimization Features

- **Portal Rendering**: Tooltips render outside the component tree
- **Debounced Events**: Prevents excessive re-renders
- **Smart Positioning**: Only recalculates when necessary
- **Cleanup Management**: Automatic timeout and event cleanup

### Best Practices

1. Use `delay` for hover tooltips to prevent accidental triggers
2. Prefer `focus` triggers for form inputs
3. Use `click` triggers for important information
4. Keep tooltip content concise
5. Test with screen readers

## Testing

The tooltip system includes comprehensive tests covering:

- Basic functionality
- Positioning variants
- Accessibility features
- Trigger types
- Edge cases
- Performance scenarios

### Running Tests

```bash
npm test Tooltip
```

### Test Coverage

- ✅ All props and variants
- ✅ Accessibility attributes
- ✅ Keyboard navigation
- ✅ Position calculations
- ✅ Event handling
- ✅ Cleanup and memory management

## Migration Guide

### From Existing Tooltips

If you have existing tooltip implementations:

```tsx
// Old implementation
<div className="relative group">
  <button>Hover me</button>
  <div className="absolute ...">Tooltip content</div>
</div>

// New implementation
<Tooltip content="Tooltip content">
  <button>Hover me</button>
</Tooltip>
```

### Benefits of Migration

- Better accessibility
- Consistent positioning
- Automatic overflow handling
- Reduced code complexity
- Type safety
- Built-in testing

## Troubleshooting

### Common Issues

#### Tooltip not showing

1. Check if `disabled` prop is set to `true`
2. Verify trigger type matches user interaction
3. Ensure content is not empty
4. Check z-index conflicts

#### Poor positioning

1. Enable `preventOverflow` prop
2. Check viewport constraints
3. Verify trigger element has valid dimensions
4. Consider using different position

#### Accessibility issues

1. Ensure proper ARIA labels
2. Test with screen readers
3. Verify keyboard navigation
4. Check color contrast

### Debug Mode

Enable debug logging:

```tsx
<Tooltip content="Debug tooltip" debug>
  <button>Debug</button>
</Tooltip>
```

## Examples

See `TooltipExamples.tsx` for comprehensive usage examples covering all features and variants.

## Contributing

When contributing to the tooltip system:

1. Follow existing code patterns
2. Add comprehensive tests
3. Update documentation
4. Consider accessibility implications
5. Test across different browsers

## License

This tooltip system is part of the NEPA frontend project.
