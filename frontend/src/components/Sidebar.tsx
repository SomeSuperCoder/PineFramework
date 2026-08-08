import { tokens } from '../theme/tokens';
import type { PanelId } from './ControlPanel';

interface NavItem {
  id: PanelId;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortcut: '1',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="7" height="7" rx="1" />
        <rect x="11" y="2" width="7" height="7" rx="1" />
        <rect x="2" y="11" width="7" height="7" rx="1" />
        <rect x="11" y="11" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'bot',
    label: 'Bot',
    shortcut: '2',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="6" width="14" height="10" rx="2" />
        <circle cx="7" cy="11" r="1.5" />
        <circle cx="13" cy="11" r="1.5" />
        <path d="M7 14h6" />
        <path d="M6 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
  {
    id: 'telegram',
    label: 'Telegram',
    shortcut: '3',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 10l16-7-5 16-2-6z" />
        <path d="M16 13l-7-3" />
      </svg>
    ),
  },
  {
    id: 'backtest',
    label: 'Backtest',
    shortcut: '4',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="2,14 6,6 10,10 14,3 18,7" />
        <polyline points="14,3 18,3 18,7" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    shortcut: '5',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="10" cy="10" r="3" />
        <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.2 4.2l2.1 2.1M13.7 13.7l2.1 2.1M15.8 4.2l-2.1 2.1M6.3 13.7l-2.1 2.1" />
      </svg>
    ),
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
        ...styles.sidebar,
        width: expanded ? 220 : 64,
      }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      role="navigation"
      aria-label="Main navigation"
    >
      <div style={styles.navList}>
        {NAV_ITEMS.map((item) => {
          const isActive = activePanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPanelChange(item.id)}
              style={{
                ...styles.navItem,
                background: isActive ? tokens.colors.surface['1'] : 'transparent',
                color: isActive ? tokens.colors.semantic.error : tokens.colors.steel.muted,
                borderRight: isActive ? `2px solid ${tokens.colors.semantic.error}` : '2px solid transparent',
              }}
              title={`${item.label} (${item.shortcut})`}
              aria-label={`${item.label} panel`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span
                style={{
                  ...styles.navLabel,
                  opacity: expanded ? 1 : 0,
                  width: expanded ? 'auto' : 0,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  ...styles.shortcutHint,
                  opacity: expanded ? 0.4 : 0,
                }}
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

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    background: tokens.colors.surface['1'],
    borderRight: `1px solid ${tokens.colors.hairline.default}`,
    flexShrink: 0,
    overflow: 'hidden',
    transition: `width ${tokens.motion.base} ${tokens.motion.ease}`,
  },
  navList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 0',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 20px',
    border: 'none',
    borderRadius: 0,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
    textAlign: 'left',
    width: '100%',
    transition: `background ${tokens.motion.fast} ${tokens.motion.ease}, color ${tokens.motion.fast} ${tokens.motion.ease}`,
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: 24,
  },
  navLabel: {
    fontWeight: 500,
    transition: `opacity ${tokens.motion.fast} ${tokens.motion.ease}`,
  },
  shortcutHint: {
    marginLeft: 'auto',
    fontSize: 10,
    fontFamily: 'monospace',
    transition: `opacity ${tokens.motion.fast} ${tokens.motion.ease}`,
  },
};
