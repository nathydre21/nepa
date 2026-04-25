# Loading Components System

A comprehensive loading state system for the NEPA frontend that provides accessible, performant, and customizable loading indicators, skeleton screens, progress bars, and overlay components.

## Features

- **Loading Indicators**: Multiple spinner variants with customizable sizes and colors
- **Skeleton Screens**: Content placeholders for various UI patterns (cards, tables, lists)
- **Progress Bars**: Linear and circular progress indicators with step progress
- **Loading Overlays**: Full-screen and component-level loading states
- **Accessibility**: Full ARIA support, screen reader compatibility, reduced motion support
- **Context Management**: Global loading state management with React Context
- **Testing**: Comprehensive test coverage for all components

## Components

### LoadingSpinner

Basic loading spinner with customizable appearance.

```tsx
import { LoadingSpinner } from './loading';

<LoadingSpinner 
  size="md" 
  variant="primary" 
  label="Loading..." 
  showLabel={true}
/>
```

**Props:**
- `size`: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
- `variant`: 'primary' | 'secondary' | 'white' | 'success' | 'warning' | 'error'
- `label`: Optional text label
- `showLabel`: Whether to display the label
- `className`: Additional CSS classes

### Skeleton Components

Content placeholders that maintain layout during loading states.

#### Skeleton
Basic skeleton element for custom layouts.

```tsx
<Skeleton 
  variant="text" 
  width={100} 
  height={20} 
  lines={3} 
  animated={true}
/>
```

#### SkeletonCard
Pre-configured skeleton for card layouts.

```tsx
<SkeletonCard 
  showAvatar={true}
  showTitle={true}
  showSubtitle={true}
  showButton={true}
  textLines={3}
/>
```

#### SkeletonTable
Table skeleton with configurable rows and columns.

```tsx
<SkeletonTable 
  rows={5} 
  columns={4} 
  showHeader={true}
/>
```

#### SkeletonList
List skeleton with avatar support.

```tsx
<SkeletonList 
  items={5} 
  showAvatar={true}
  avatarSize={40}
/>
```

### Progress Components

Visual progress indicators for operations with measurable progress.

#### ProgressBar
Linear progress bar with optional percentage display.

```tsx
<ProgressBar 
  value={75} 
  max={100}
  size="md"
  variant="primary"
  showLabel={true}
  label="Upload Progress"
  showPercentage={true}
  animated={true}
  striped={false}
/>
```

#### CircularProgress
Circular progress indicator.

```tsx
<CircularProgress 
  value={60} 
  max={100}
  size={120}
  strokeWidth={8}
  variant="primary"
  showLabel={true}
  label="Complete"
  showPercentage={true}
/>
```

#### StepProgress
Multi-step progress indicator.

```tsx
<StepProgress 
  steps={[
    { label: 'Initialize', completed: true },
    { label: 'Load Data', completed: false, current: true },
    { label: 'Process', completed: false },
    { label: 'Complete', completed: false }
  ]}
/>
```

### Loading Overlay

Full-screen or component-level loading overlay with backdrop.

```tsx
<LoadingOverlay
  isLoading={true}
  message="Processing data..."
  progress={75}
  max={100}
  showProgress={true}
  variant="spinner"
  size="md"
  backdrop={true}
  backdropBlur={false}
>
  {/* Content to be covered */}
</LoadingOverlay>
```

### LoadingButton

Button with integrated loading state.

```tsx
<LoadingButton
  isLoading={loading}
  onClick={handleSubmit}
  loadingText="Processing..."
  variant="primary"
  size="md"
>
  Submit
</LoadingButton>
```

### LoadingCard

Card component with skeleton loading state.

```tsx
<LoadingCard 
  isLoading={loading}
  skeletonLines={4}
  showAvatar={true}
>
  {/* Actual card content */}
</LoadingCard>
```

## Context Management

### LoadingProvider

Wrap your application with the LoadingProvider to enable global loading state management.

```tsx
import { LoadingProvider } from './contexts/LoadingContext';

function App() {
  return (
    <LoadingProvider>
      {/* Your app components */}
    </LoadingProvider>
  );
}
```

### useLoading Hook

Access global loading state and utilities.

```tsx
import { useLoading } from './contexts/LoadingContext';

function MyComponent() {
  const { 
    globalLoading, 
    startLoading, 
    stopLoading, 
    updateProgress, 
    withLoading 
  } = useLoading();

  const handleAsyncOperation = async () => {
    // Method 1: Manual control
    startLoading('Processing...');
    try {
      await someAsyncOperation();
    } finally {
      stopLoading();
    }

    // Method 2: Automatic with withLoading
    await withLoading(someAsyncOperation(), 'Processing...');
  };

  return (
    <div>
      {globalLoading.isLoading && (
        <div>Loading: {globalLoading.message}</div>
      )}
    </div>
  );
}
```

## Accessibility

All loading components include comprehensive accessibility features:

- **ARIA Attributes**: Proper `role`, `aria-live`, `aria-busy`, and `aria-label` attributes
- **Screen Reader Support**: Loading announcements and progress updates
- **Keyboard Navigation**: Focus management and keyboard shortcuts
- **Reduced Motion**: Respects `prefers-reduced-motion` settings
- **Focus Management**: Proper focus trapping during loading states

### Accessibility Utilities

```tsx
import { 
  loadingAccessibility,
  loadingFocusManager,
  loadingKeyboardManager,
  createAccessibleLoadingProps,
  createAccessibleProgressProps,
  prefersReducedMotion
} from './utils/loadingAccessibility';

// Announce loading to screen readers
loadingAccessibility.announceLoadingStart('Uploading files');

// Manage focus during loading
const focusTrap = loadingFocusManager.trapFocus(element);

// Add keyboard navigation
const navigation = loadingKeyboardManager.addKeyboardNavigation(
  element,
  () => console.log('Escape pressed'),
  () => console.log('Enter pressed')
);
```

## Styling

Components use Tailwind CSS classes and can be customized through:

1. **Variant System**: Built-in color and size variants
2. **Custom Classes**: Additional CSS classes via `className` prop
3. **CSS Variables**: Theme customization through CSS custom properties
4. **Utility Classes**: Using the `cn()` utility for conditional classes

### Custom Variants

```tsx
// Custom color variant
const customVariantClasses = {
  custom: 'border-purple-200 border-t-purple-600'
};

// Custom size variant
const customSizeClasses = {
  xl: 'w-20 h-20'
};
```

## Testing

All components include comprehensive test coverage using React Testing Library.

### Running Tests

```bash
npm test
npm test:watch
```

### Test Structure

```tsx
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<LoadingSpinner label="Test loading" />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-live', 'polite');
  });
});
```

## Performance Considerations

- **Reduced Motion**: Automatically disables animations when `prefers-reduced-motion` is set
- **Lazy Loading**: Components only render when needed
- **Minimal Re-renders**: Efficient state management with React Context
- **CSS Animations**: Hardware-accelerated CSS transforms for smooth animations
- **Memory Management**: Proper cleanup of timers and event listeners

## Best Practices

1. **Use Appropriate Loading Types**: 
   - Spinners for indeterminate progress
   - Progress bars for measurable operations
   - Skeletons for content loading

2. **Provide Context**: Always include meaningful loading messages

3. **Respect User Preferences**: Honor reduced motion settings

4. **Test Accessibility**: Verify screen reader compatibility

5. **Performance**: Avoid excessive animations and maintain 60fps

6. **Consistency**: Use consistent loading patterns across the application

## Migration Guide

### From Basic Loading States

Replace basic loading indicators:

```tsx
// Before
{loading && <div className="spinner">Loading...</div>}

// After
<LoadingSpinner isLoading={loading} label="Loading..." />
```

### From Custom Skeletons

Replace custom skeleton implementations:

```tsx
// Before
{loading && (
  <div className="animate-pulse">
    <div className="h-4 bg-gray-200 rounded"></div>
    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
  </div>
)}

// After
<Skeleton variant="text" lines={2} animated={true} />
```

## Troubleshooting

### Common Issues

1. **Components Not Rendering**: Check imports and ensure proper file paths
2. **Styling Issues**: Verify Tailwind CSS is properly configured
3. **Accessibility Issues**: Ensure proper ARIA attributes are set
4. **Performance Issues**: Check for excessive re-renders or animations

### Debug Mode

Enable debug logging for loading context:

```tsx
<LoadingProvider debug={true}>
  {/* App */}
</LoadingProvider>
```

## Contributing

When adding new loading components:

1. Follow the established component patterns
2. Include comprehensive accessibility features
3. Add proper TypeScript types
4. Write thorough tests
5. Update documentation
6. Consider performance implications

## License

This loading system is part of the NEPA frontend project.
