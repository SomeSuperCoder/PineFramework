import { tokens } from '../theme/tokens';

export interface TopBarProps {
  botConnected: boolean;
  botState: string;
  errorCount: number;
  settingsOpen: boolean;
  onOpenSettings: () => void;
}

export function TopBar({
  botConnected,
  botState,
  errorCount,
  settingsOpen,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header style={styles.topbar}>
      {/* Left: Logo + App Name */}
      <div style={styles.leftSection}>
        <div style={styles.logo}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="10" width="3" height="8" rx="1" fill={tokens.colors.semantic.error} />
            <rect x="6" y="6" width="3" height="12" rx="1" fill={tokens.colors.semantic.error} />
            <rect x="10" y="3" width="3" height="15" rx="1" fill={tokens.colors.semantic.error} />
            <rect x="14" y="1" width="3" height="17" rx="1" fill={tokens.colors.semantic.error} />
          </svg>
          <span style={styles.appName}>Pine Framework</span>
        </div>
      </div>

      {/* Center: Status indicators */}
      <div style={styles.centerSection}>
        <StatusDot connected={botConnected} />
        <span style={styles.statusText}>Bot: {botState}</span>

        <div style={styles.divider} />

        {errorCount > 0 && (
          <>
            <span style={styles.errorBadge}>Errors: {errorCount}</span>
            <div style={styles.divider} />
          </>
        )}
      </div>

      {/* Right: Quick actions */}
      <div style={styles.rightSection}>
        {/* Settings gear */}
        <button
          onClick={onOpenSettings}
          style={{
            ...styles.iconButton,
            background: settingsOpen ? tokens.colors.surface['1'] : 'transparent',
            color: settingsOpen ? tokens.colors.semantic.error : tokens.colors.steel.muted,
          }}
          title="Settings (4)"
          aria-label="Open settings"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="2" />
            <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M11.2 2.8l-1.4 1.4M4.2 9.8l-1.4 1.4" />
          </svg>
        </button>

        {/* Notification bell */}
        <button style={styles.iconButton} title="Notifications" aria-label="Notifications">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5.5 11a1.5 1.5 0 0 0 3 0" />
            <path d="M10.5 5.5V5a3.5 3.5 0 0 0-7 0v.5" />
            <path d="M3 5.5a4 4 0 0 1 8 0" />
            <path d="M2.5 5.5v3a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: connected ? tokens.colors.semantic.success : tokens.colors.semantic.error,
        boxShadow: connected
          ? `0 0 6px ${tokens.colors.semantic.success}66`
          : `0 0 6px ${tokens.colors.semantic.error}66`,
      }}
      title={connected ? 'Connected' : 'Disconnected'}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  topbar: {
    display: 'flex',
    alignItems: 'center',
    height: 48,
    padding: '0 16px',
    background: tokens.colors.surface['1'],
    borderBottom: `1px solid ${tokens.colors.hairline.default}`,
    flexShrink: 0,
    gap: 12,
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 180,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  appName: {
    fontSize: 14,
    fontWeight: 600,
    color: tokens.colors.semantic.error,
    letterSpacing: '-0.01em',
  },
  centerSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 12,
    color: tokens.colors.steel.muted,
  },
  divider: {
    width: 1,
    height: 16,
    background: tokens.colors.hairline.default,
  },
  errorBadge: {
    fontSize: 11,
    color: tokens.colors.semantic.error,
    fontWeight: 600,
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
    justifyContent: 'flex-end',
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    background: 'transparent',
    color: tokens.colors.steel.muted,
    transition: 'background 0.15s, color 0.15s',
  },
};
