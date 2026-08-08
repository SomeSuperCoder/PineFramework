import { tokens } from '../theme/tokens';

export interface ContentAreaProps {
  /** Breadcrumb segments (optional — if not provided, no breadcrumb shown) */
  breadcrumb?: string[];
  /** Panel label for breadcrumb (auto-derived from panel ID if not set) */
  panelLabel?: string;
  children: React.ReactNode;
}

export function ContentArea({ breadcrumb, panelLabel, children }: ContentAreaProps) {
  const segments = breadcrumb ?? (panelLabel ? [panelLabel] : []);

  return (
    <div style={styles.contentArea}>
      {/* Breadcrumb bar */}
      {segments.length > 0 && (
        <div style={styles.breadcrumbBar}>
          {segments.map((segment, i) => (
            <span key={i}>
              {i > 0 && <span style={styles.separator}>{'>'}</span>}
              <span
                style={{
                  ...styles.crumb,
                  color: i === segments.length - 1 ? tokens.colors.ink['1'] : tokens.colors.steel.disabled,
                }}
              >
                {segment}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div style={styles.scrollContainer}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  contentArea: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    background: tokens.colors.surface['0'],
  },
  breadcrumbBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 16px',
    fontSize: 11,
    color: tokens.colors.steel.disabled,
    borderBottom: `1px solid ${tokens.colors.hairline.default}`,
    background: tokens.colors.surface['1'],
    flexShrink: 0,
    gap: 4,
  },
  separator: {
    margin: '0 6px',
    color: '#333',
  },
  crumb: {
    color: tokens.colors.steel.disabled,
  },
  scrollContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    padding: 0,
  },
};
