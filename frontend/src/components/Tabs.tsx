import React, {
  useState,
  useRef,
  createContext,
  useContext,
  useId,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TabsVariant = 'default' | 'bordered' | 'pills' | 'underline';
export type TabsSize = 'sm' | 'md' | 'lg';
export type TabsOrientation = 'horizontal' | 'vertical';

export interface TabItem {
  /** Unique identifier */
  id: string;
  /** Label shown in the tab trigger */
  label: React.ReactNode;
  /** Panel content */
  content: React.ReactNode;
  /** Disable this specific tab */
  disabled?: boolean;
  /** Optional icon rendered before the label */
  icon?: React.ReactNode;
  /** Badge / count rendered after the label */
  badge?: React.ReactNode;
}

export interface TabsProps {
  /** Tab definitions */
  tabs: TabItem[];
  /** Initially active tab id (uncontrolled) */
  defaultActiveTab?: string;
  /** Controlled active tab id */
  activeTab?: string;
  /** Callback when active tab changes */
  onTabChange?: (id: string) => void;
  /** Visual variant */
  variant?: TabsVariant;
  /** Size variant */
  size?: TabsSize;
  /** Layout orientation */
  orientation?: TabsOrientation;
  /** Accessible label for the tablist */
  ariaLabel?: string;
  /** Extra class on the root element */
  className?: string;
  /** Extra class on the tab list */
  tabListClassName?: string;
  /** Extra class on each tab panel */
  tabPanelClassName?: string;
  /** Lazy-mount panels (only render when first activated) */
  lazy?: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
  variant: TabsVariant;
  size: TabsSize;
  orientation: TabsOrientation;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

const useTabsContext = () => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tab sub-components must be used inside <Tabs>');
  return ctx;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tabListClass: Record<TabsVariant, string> = {
  default: 'tabs-list tabs-list-default',
  bordered: 'tabs-list tabs-list-bordered',
  pills: 'tabs-list tabs-list-pills',
  underline: 'tabs-list tabs-list-underline',
};

const tabTriggerActiveClass: Record<TabsVariant, string> = {
  default: 'tabs-trigger-active-default',
  bordered: 'tabs-trigger-active-bordered',
  pills: 'tabs-trigger-active-pills',
  underline: 'tabs-trigger-active-underline',
};

const sizeClass: Record<TabsSize, string> = {
  sm: 'tabs-sm',
  md: 'tabs-md',
  lg: 'tabs-lg',
};

// ─── Tabs (root) ──────────────────────────────────────────────────────────────

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  defaultActiveTab,
  activeTab: controlledActive,
  onTabChange,
  variant = 'default',
  size = 'md',
  orientation = 'horizontal',
  ariaLabel = 'Tabs',
  className = '',
  tabListClassName = '',
  tabPanelClassName = '',
  lazy = false,
}) => {
  const baseId = useId();
  const firstEnabledId = tabs.find((t) => !t.disabled)?.id ?? tabs[0]?.id ?? '';

  const [internalActive, setInternalActive] = useState(
    defaultActiveTab ?? firstEnabledId,
  );

  const isControlled = controlledActive !== undefined;
  const activeTab = isControlled ? controlledActive : internalActive;

  const handleTabChange = (id: string) => {
    if (!isControlled) setInternalActive(id);
    onTabChange?.(id);
  };

  // Track which panels have ever been activated (for lazy rendering)
  const activatedRef = useRef<Set<string>>(new Set([activeTab]));
  // Update synchronously so the panel renders on the same cycle
  activatedRef.current.add(activeTab);

  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const enabledTabs = tabs.filter((t) => !t.disabled);

    // Use the currently focused trigger id, falling back to activeTab
    const focusedId =
      (document.activeElement as HTMLElement | null)?.id?.replace(
        `${baseId}-tab-`,
        '',
      ) ?? activeTab;
    const currentIndex = enabledTabs.findIndex((t) => t.id === focusedId);

    const isHorizontal = orientation === 'horizontal';
    const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';

    let nextIndex: number | null = null;

    if (e.key === nextKey) {
      nextIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (e.key === prevKey) {
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = enabledTabs.length - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      const nextTab = enabledTabs[nextIndex];
      handleTabChange(nextTab.id);
      triggerRefs.current.get(nextTab.id)?.focus();
    }
  };

  return (
    <TabsContext.Provider
      value={{ activeTab, setActiveTab: handleTabChange, variant, size, orientation, baseId }}
    >
      <div
        className={`tabs tabs-${orientation} ${sizeClass[size]} ${className}`}
        data-variant={variant}
        data-orientation={orientation}
        data-size={size}
      >
        {/* Tab list */}
        <div
          role="tablist"
          aria-label={ariaLabel}
          aria-orientation={orientation}
          className={`${tabListClass[variant]} ${tabListClassName}`}
          onKeyDown={handleKeyDown}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            const triggerId = `${baseId}-tab-${tab.id}`;
            const panelId = `${baseId}-panel-${tab.id}`;

            return (
              <button
                key={tab.id}
                id={triggerId}
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                aria-disabled={tab.disabled}
                disabled={tab.disabled}
                tabIndex={isActive ? 0 : -1}
                ref={(el) => {
                  if (el) triggerRefs.current.set(tab.id, el);
                  else triggerRefs.current.delete(tab.id);
                }}
                className={[
                  'tabs-trigger',
                  isActive
                    ? `tabs-trigger-active ${tabTriggerActiveClass[variant]}`
                    : 'tabs-trigger-inactive',
                  tab.disabled ? 'tabs-trigger-disabled' : '',
                ].join(' ')}
                onClick={() => !tab.disabled && handleTabChange(tab.id)}
              >
                {tab.icon && (
                  <span className="tabs-trigger-icon" aria-hidden="true">
                    {tab.icon}
                  </span>
                )}
                <span className="tabs-trigger-label">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="tabs-trigger-badge" aria-label={`${tab.badge} items`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        <div className="tabs-panels">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            const triggerId = `${baseId}-tab-${tab.id}`;
            const panelId = `${baseId}-panel-${tab.id}`;
            const shouldRender = !lazy || activatedRef.current.has(tab.id);

            return (
              <div
                key={tab.id}
                id={panelId}
                role="tabpanel"
                aria-labelledby={triggerId}
                tabIndex={0}
                hidden={!isActive}
                className={`tabs-panel ${isActive ? 'tabs-panel-active' : ''} ${tabPanelClassName}`}
                data-state={isActive ? 'active' : 'inactive'}
              >
                {shouldRender ? tab.content : null}
              </div>
            );
          })}
        </div>
      </div>
    </TabsContext.Provider>
  );
};

// ─── Named export for context consumers ───────────────────────────────────────
export { useTabsContext };
export default Tabs;
