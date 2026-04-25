# Empty State System

A comprehensive, accessible empty state system for the NEPA frontend application.

## Overview

This empty state system provides:
- **Reusable components** for different empty state scenarios
- **Accessibility features** with WCAG 2.1 AA compliance
- **Responsive design** with mobile-first approach
- **Customizable styling** with Tailwind CSS
- **TypeScript support** with comprehensive type definitions
- **Screen reader support** with proper ARIA attributes
- **Keyboard navigation** with focus management
- **Animation support** with reduced motion detection

## Components

### 1. EmptyState (Base Component)

The foundational empty state component with full customization options.

```tsx
import { EmptyState } from './components/EmptyState';

<EmptyState
  type="no-data"
  title="No transactions yet"
  description="You haven't made any payments. Start by adding your first payment."
  icon="💳"
  primaryAction={{
    label: 'Make a Payment',
    onClick: handlePayment,
    disabled: false
  }}
  secondaryAction={{
    label: 'View History',
    onClick: handleHistory,
    disabled: false
  }}
  size="medium"
  animated={true}
/>
```

### 2. Specialized Variants

#### NoDataEmptyState
For when there's no data in a list or collection.

```tsx
<NoDataEmptyState
  entity="transactions"
  isFirstTime={false}
  primaryAction={{
    label: 'Add Transaction',
    onClick: handleAdd
  }}
/>
```

#### NoResultsEmptyState
For when searches or filters return no results.

```tsx
<NoResultsEmptyState
  searchTerm="electricity"
  hasFilters={true}
  onClear={handleClearFilters}
/>
```

#### ConnectionErrorEmptyState
For network or server connection issues.

```tsx
<ConnectionErrorEmptyState
  error="Failed to connect to server"
  onRetry={handleRetry}
  showRetry={true}
/>
```

#### ListEmptyState
All-in-one component for list-based empty states.

```tsx
<ListEmptyState
  listType="transactions"
  state="no-data"
  onRetry={handleRetry}
  onClear={handleClear}
/>
```

## Accessibility Features

### WCAG 2.1 AA Compliance

- **ARIA Labels**: Context-aware labels for screen readers
- **Roles**: Appropriate roles (status, alert, region)
- **Live Regions**: Polite/assertive announcements
- **Keyboard Navigation**: Full keyboard support
- **Focus Management**: Proper focus handling
- **Reduced Motion**: Respects user motion preferences

### Screen Reader Support

The system automatically announces empty states to screen readers with context-aware messages:

- "No transactions available. You have no transactions yet. Consider adding your first transaction to get started."
- "No search results found for 'electricity' with current filters applied."
- "Connection error: Failed to connect to the server. Please check your internet connection and try again."

### Keyboard Navigation

- **Tab**: Navigate between action buttons
- **Enter**: Activate primary action when focused
- **Escape**: Exit focus trap (in modals)
- **Arrow Keys**: Navigate between options (when applicable)

## Styling and Animation

### CSS Classes

The system includes several CSS classes for customization:

```css
/* Base animations */
.animate-fade-in
.animate-pulse
.animate-bounce

/* Empty state specific */
.empty-state-container
.empty-state-icon
.empty-state-title
.empty-state-description
.empty-state-button

/* Responsive adjustments */
@media (max-width: 640px) { ... }
```

### Reduced Motion Support

Animations automatically respect user preferences:

```tsx
const shouldAnimate = animated && !prefersReducedMotion();
```

## Usage Examples

### Transaction History

```tsx
const TransactionHistory = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (loading && transactions.length === 0) {
    return (
      <ListEmptyState
        listType="transactions"
        state="loading"
      />
    );
  }

  if (error) {
    return (
      <ListEmptyState
        listType="transactions"
        state="error"
        error={error.message}
        onRetry={() => loadTransactions()}
      />
    );
  }

  if (transactions.length === 0) {
    return (
      <ListEmptyState
        listType="transactions"
        state="no-data"
        primaryAction={{
          label: 'Make a Payment',
          onClick: () => navigate('/payment')
        }}
      />
    );
  }

  return <TransactionList transactions={transactions} />;
};
```

### Search Results

```tsx
const SearchResults = ({ searchTerm, filters, results }) => {
  if (results.length === 0) {
    return (
      <NoResultsEmptyState
        searchTerm={searchTerm}
        hasFilters={Object.keys(filters).length > 0}
        onClear={() => clearFilters()}
        primaryAction={{
          label: 'Browse All Items',
          onClick: () => showAllItems()
        }}
      />
    );
  }

  return <ResultsList results={results} />;
};
```

## Testing

The system includes comprehensive tests covering:

- Component rendering
- Accessibility attributes
- Keyboard navigation
- Screen reader announcements
- User interactions
- Responsive behavior

Run tests with:
```bash
npm test EmptyState
```

## Best Practices

### 1. Use Appropriate Empty States

- **No Data**: First-time users or completely empty lists
- **No Results**: Searches/filters that return nothing
- **Error**: Network or server issues
- **Loading**: Data fetching in progress

### 2. Provide Clear Actions

Always give users a clear path forward:
- Primary action for the most likely next step
- Secondary action for alternative paths
- Clear/cancel actions for filters/search

### 3. Use Contextual Messaging

Tailor messages to the specific context:
- Mention the entity type (transactions, notifications, etc.)
- Include search terms when applicable
- Reference applied filters
- Provide specific error details

### 4. Maintain Consistency

Use the appropriate variant for each scenario:
- `ListEmptyState` for list-based components
- `NoResultsEmptyState` for search/filter scenarios
- `ConnectionErrorEmptyState` for network issues
- `NoDataEmptyState` for first-time user experiences

## Migration Guide

### From Basic Empty States

**Before:**
```tsx
{data.length === 0 && (
  <div className="text-center py-12">
    <div className="text-gray-500">No data found</div>
  </div>
)}
```

**After:**
```tsx
{data.length === 0 && (
  <ListEmptyState
    listType="transactions"
    state="no-data"
    primaryAction={{
      label: 'Add Transaction',
      onClick: handleAdd
    }}
  />
)}
```

### From Custom Empty States

Replace custom empty state implementations with the appropriate variant:

1. Identify the scenario (no data, no results, error, loading)
2. Choose the right variant
3. Configure actions and messaging
4. Remove custom styling in favor of the built-in styles

## File Structure

```
src/components/
├── EmptyState.tsx              # Base component
├── EmptyStateVariants.tsx      # Specialized variants
├── EmptyState.test.tsx         # Tests
├── EmptyStateExample.tsx       # Usage examples
└── README_EmptyStates.md       # This documentation

src/styles/
└── empty-states.css            # Empty state styles

src/utils/
└── accessibility.ts            # Accessibility utilities
```

## Contributing

When adding new empty state variants:

1. Follow the established patterns
2. Include comprehensive accessibility features
3. Add appropriate tests
4. Update documentation
5. Consider responsive design
6. Include keyboard navigation
7. Add screen reader support

## Support

For questions or issues with the empty state system:
- Check the usage examples above
- Review the test files for implementation details
- Consult the accessibility utilities for advanced features
- Refer to the CSS file for styling options
