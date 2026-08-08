import type { ReactNode } from 'react';
import {
  LayoutGrid,
  Bot,
  Send,
  TrendingUp,
  Settings,
} from 'lucide-react';
import type { PanelId } from './ControlPanel';
import { cn } from '@/lib/utils';

interface NavItem {
  id: PanelId;
  label: string;
  shortcut: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortcut: '1',
    icon: <LayoutGrid className="size-5" aria-hidden="true" />,
  },
  {
    id: 'bot',
    label: 'Bot',
    shortcut: '2',
    icon: <Bot className="size-5" aria-hidden="true" />,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    shortcut: '3',
    icon: <Send className="size-5" aria-hidden="true" />,
  },
  {
    id: 'backtest',
    label: 'Backtest',
    shortcut: '4',
    icon: <TrendingUp className="size-5" aria-hidden="true" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    shortcut: '5',
    icon: <Settings className="size-5" aria-hidden="true" />,
  },
];

export interface SidebarProps {
  activePanel: PanelId;
  onPanelChange: (panel: PanelId) => void;
  expanded: boolean;
  onHoverChange: (hovering: boolean) => void;
}

export function Sidebar({ activePanel, onPanelChange, expanded, onHoverChange }: SidebarProps) {
  return (
    <nav
      style={{
        width: expanded ? '13.75rem' : '4rem', // 220 ↔ 64
        transition: 'width 200ms cubic-bezier(0.25, 0.1, 0.25, 1)',
      }}
      className="flex shrink-0 flex-col overflow-hidden border-r border-[var(--pf-hairline)] bg-[var(--pf-surface-1)]"
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      role="navigation"
      aria-label="Main navigation"
      aria-expanded={expanded}
    >
      <div className="flex flex-col gap-0.5 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activePanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPanelChange(item.id)}
              className={cn(
                'relative flex h-10 w-full items-center gap-2.5 px-5 text-left transition-colors',
                'text-[var(--pf-steel-muted)] hover:bg-[var(--pf-surface-2)]/60 hover:text-[var(--pf-ink-1)]',
                isActive &&
                  'bg-[var(--pf-surface-2)] text-[var(--pf-ink-1)]',
              )}
              title={`${item.label} (${item.shortcut})`}
              aria-label={`${item.label} panel`}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Leading brand-blue indicator bar on the active item */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-[var(--pf-brand-blue)]"
                />
              )}
              <span className="flex w-6 shrink-0 items-center justify-center">{item.icon}</span>
              <span
                className={cn(
                  'whitespace-nowrap text-sm font-medium transition-opacity',
                  expanded ? 'opacity-100' : 'w-0 overflow-hidden opacity-0',
                )}
              >
                {item.label}
              </span>
              <span
                className={cn(
                  'ml-auto font-mono text-[10px] transition-opacity',
                  expanded ? 'opacity-40' : 'opacity-0',
                )}
              >
                {item.shortcut}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}