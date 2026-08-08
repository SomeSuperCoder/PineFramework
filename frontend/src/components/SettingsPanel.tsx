import { useState, useCallback, useEffect } from 'react';
import { tokens } from '../theme/tokens';

// ─── Storage helpers ─────────────────────────────────────────────────────────
const STORAGE_PREFIX = 'pine-settings-';

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveSetting<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SettingsPanelProps {
  onClose?: () => void;
}

type Theme = 'dark' | 'light';

interface Settings {
  // Display
  theme: Theme;
  chartAnimations: boolean;
  crosshairEnabled: boolean;
  showGridLines: boolean;
  timezone: string;
  // Data
  apiEndpoint: string;
  refreshInterval: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  // Advanced
  debugMode: boolean;
  logLevel: 'none' | 'error' | 'warn' | 'info' | 'debug';
  experimentalFeatures: boolean;
}

const DEFAULTS: Settings = {
  theme: 'dark',
  chartAnimations: true,
  crosshairEnabled: true,
  showGridLines: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  apiEndpoint: `http://${window.location.hostname}:8081`,
  refreshInterval: 30,
  cacheEnabled: true,
  cacheTTL: 300,
  debugMode: false,
  logLevel: 'warn',
  experimentalFeatures: false,
};

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const LOG_LEVELS: { value: Settings['logLevel']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warn' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={sectionStyles.header}>
      <span style={sectionStyles.icon}>{icon}</span>
      <span style={sectionStyles.label}>{label}</span>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={rowStyles.row}>
      <div style={rowStyles.info}>
        <div style={rowStyles.label}>{label}</div>
        {description && <div style={rowStyles.description}>{description}</div>}
      </div>
      <div style={rowStyles.control}>{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        ...toggleStyles.track,
        background: checked ? tokens.colors.brand.blue : tokens.colors.surface['1'],
        borderColor: checked ? tokens.colors.brand.blue : '#333',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div
        style={{
          ...toggleStyles.thumb,
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          background: checked ? tokens.colors.ink.default : '#666',
        }}
      />
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        ...selectStyles.select,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <div style={numberStyles.wrapper}>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        style={{
          ...numberStyles.input,
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      {unit && <span style={numberStyles.unit}>{unit}</span>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        ...textStyles.input,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
      }}
    />
  );
}

function DangerButton({
  label,
  description,
  onClick,
}: {
  label: string;
  description?: string;
  onClick: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleClick = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onClick();
    setConfirming(false);
  }, [confirming, onClick]);

  const handleCancel = useCallback(() => {
    setConfirming(false);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={handleClick}
        style={{
          ...dangerBtnStyles.base,
          background: confirming ? tokens.colors.semantic.error : 'transparent',
          borderColor: tokens.colors.semantic.error,
          color: confirming ? tokens.colors.ink.default : tokens.colors.semantic.error,
        }}
      >
        {confirming ? 'Confirm' : label}
      </button>
      {confirming && (
        <button onClick={handleCancel} style={dangerBtnStyles.cancel}>
          Cancel
        </button>
      )}
      {description && <span style={dangerBtnStyles.desc}>{description}</span>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings>(() => ({
    theme: loadSetting('theme', DEFAULTS.theme),
    chartAnimations: loadSetting('chartAnimations', DEFAULTS.chartAnimations),
    crosshairEnabled: loadSetting('crosshairEnabled', DEFAULTS.crosshairEnabled),
    showGridLines: loadSetting('showGridLines', DEFAULTS.showGridLines),
    timezone: loadSetting('timezone', DEFAULTS.timezone),
    apiEndpoint: loadSetting('apiEndpoint', DEFAULTS.apiEndpoint),
    refreshInterval: loadSetting('refreshInterval', DEFAULTS.refreshInterval),
    cacheEnabled: loadSetting('cacheEnabled', DEFAULTS.cacheEnabled),
    cacheTTL: loadSetting('cacheTTL', DEFAULTS.cacheTTL),
    debugMode: loadSetting('debugMode', DEFAULTS.debugMode),
    logLevel: loadSetting('logLevel', DEFAULTS.logLevel),
    experimentalFeatures: loadSetting('experimentalFeatures', DEFAULTS.experimentalFeatures),
  }));

  const [saved, setSaved] = useState(false);

  // Persist every change
  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    saveSetting(key, value);
  }, []);

  // Flash "Saved" indicator
  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 1500);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const handleResetAll = useCallback(() => {
    // Clear all pine-settings-* keys
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    setSettings(DEFAULTS);
    setSaved(true);
  }, []);

  const handleClearCache = useCallback(() => {
    // Clear all pine-settings-cache keys only
    localStorage.removeItem(STORAGE_PREFIX + 'cacheEnabled');
    localStorage.removeItem(STORAGE_PREFIX + 'cacheTTL');
    update('cacheEnabled', DEFAULTS.cacheEnabled);
    update('cacheTTL', DEFAULTS.cacheTTL);
    setSaved(true);
  }, [update]);

  return (
    <div style={panelStyles.container}>
      {/* Header */}
      <div style={panelStyles.header}>
        <button
          onClick={onClose}
          aria-label="Back to dashboard"
          style={panelStyles.backBtn}
        >
          ← Back
        </button>
        <h3 style={panelStyles.title}>Settings</h3>
        {saved && <span style={panelStyles.savedBadge}>Saved</span>}
      </div>

      {/* Sections */}
      <div style={panelStyles.sections}>
        {/* ── Display ── */}
        <div style={panelStyles.section}>
          <SectionHeader icon="🎨" label="Display" />
          <SettingRow label="Theme" description="Interface color scheme">
            <Select
              value={settings.theme}
              onChange={(v) => update('theme', v as Theme)}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Chart Animations" description="Smooth transitions on data updates">
            <Toggle
              checked={settings.chartAnimations}
              onChange={(v) => update('chartAnimations', v)}
            />
          </SettingRow>
          <SettingRow label="Crosshair" description="Show crosshair cursor on chart">
            <Toggle
              checked={settings.crosshairEnabled}
              onChange={(v) => update('crosshairEnabled', v)}
            />
          </SettingRow>
          <SettingRow label="Grid Lines" description="Show background grid on chart">
            <Toggle
              checked={settings.showGridLines}
              onChange={(v) => update('showGridLines', v)}
            />
          </SettingRow>
          <SettingRow label="Timezone" description="Display timezone for dates and timestamps">
            <Select
              value={settings.timezone}
              onChange={(v) => update('timezone', v)}
              options={TIMEZONES.map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))}
            />
          </SettingRow>
        </div>

        {/* ── Data ── */}
        <div style={panelStyles.section}>
          <SectionHeader icon="📡" label="Data" />
          <SettingRow label="API Endpoint" description="Backend server URL">
            <TextInput
              value={settings.apiEndpoint}
              onChange={(v) => update('apiEndpoint', v)}
              placeholder="http://localhost:8081"
            />
          </SettingRow>
          <SettingRow label="Refresh Interval" description="How often to poll for new data">
            <NumberInput
              value={settings.refreshInterval}
              onChange={(v) => update('refreshInterval', v)}
              min={5}
              max={300}
              step={5}
              unit="sec"
            />
          </SettingRow>
          <SettingRow label="Enable Cache" description="Cache API responses locally">
            <Toggle
              checked={settings.cacheEnabled}
              onChange={(v) => update('cacheEnabled', v)}
            />
          </SettingRow>
          <SettingRow label="Cache TTL" description="How long cached data stays valid">
            <NumberInput
              value={settings.cacheTTL}
              onChange={(v) => update('cacheTTL', v)}
              min={30}
              max={3600}
              step={30}
              unit="sec"
              disabled={!settings.cacheEnabled}
            />
          </SettingRow>
        </div>

        {/* ── Advanced ── */}
        <div style={panelStyles.section}>
          <SectionHeader icon="⚙️" label="Advanced" />
          <SettingRow label="Debug Mode" description="Show extra diagnostic info in the UI">
            <Toggle
              checked={settings.debugMode}
              onChange={(v) => update('debugMode', v)}
            />
          </SettingRow>
          <SettingRow label="Log Level" description="Verbosity of console logging">
            <Select
              value={settings.logLevel}
              onChange={(v) => update('logLevel', v as Settings['logLevel'])}
              options={LOG_LEVELS}
            />
          </SettingRow>
          <SettingRow label="Experimental Features" description="Enable unreleased UI features">
            <Toggle
              checked={settings.experimentalFeatures}
              onChange={(v) => update('experimentalFeatures', v)}
            />
          </SettingRow>
        </div>

        {/* ── Danger Zone ── */}
        <div style={{ ...panelStyles.section, marginBottom: 32 }}>
          <SectionHeader icon="🗑️" label="Danger Zone" />
          <SettingRow label="Clear Cache" description="Remove all locally cached data">
            <DangerButton label="Clear" onClick={handleClearCache} />
          </SettingRow>
          <SettingRow label="Reset All Settings" description="Restore every setting to defaults">
            <DangerButton label="Reset All" onClick={handleResetAll} />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'auto',
    background: tokens.colors.surface['1'],
    border: `1px solid ${tokens.colors.hairline.default}`,
    borderRadius: 8,
    padding: 20,
    color: tokens.colors.ink['1'],
    fontSize: 13,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  backBtn: {
    background: 'none',
    border: '1px solid #333',
    borderRadius: 4,
    color: '#aaa',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 13,
  },
  title: {
    margin: 0,
    color: tokens.colors.brand.blue,
    fontSize: 16,
    fontWeight: 600,
  },
  savedBadge: {
    marginLeft: 'auto',
    fontSize: 11,
    color: tokens.colors.semantic.success,
    fontWeight: 600,
    opacity: 0.8,
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
};

const sectionStyles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    borderBottom: `1px solid ${tokens.colors.surface['1']}`,
    marginBottom: 8,
  },
  icon: {
    fontSize: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: tokens.colors.ink['1'],
    letterSpacing: '0.02em',
  },
};

const rowStyles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: `1px solid ${tokens.colors.hairline.default}`,
    gap: 16,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 13,
    color: tokens.colors.ink['1'],
  },
  description: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  control: {
    flexShrink: 0,
  },
};

const toggleStyles: Record<string, React.CSSProperties> = {
  track: {
    position: 'relative',
    width: 36,
    height: 20,
    borderRadius: 10,
    border: '1px solid',
    padding: 2,
    transition: 'background 0.2s, border-color 0.2s',
  },
  thumb: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    transition: 'transform 0.2s, background 0.2s',
  },
};

const selectStyles: Record<string, React.CSSProperties> = {
  select: {
    padding: '6px 10px',
    border: `1px solid ${tokens.colors.surface['2']}`,
    borderRadius: 4,
    background: tokens.colors.canvas,
    color: tokens.colors.ink['1'],
    fontSize: 12,
    cursor: 'pointer',
    minWidth: 140,
  },
};

const numberStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  input: {
    width: 70,
    padding: '6px 8px',
    border: `1px solid ${tokens.colors.surface['2']}`,
    borderRadius: 4,
    background: tokens.colors.canvas,
    color: tokens.colors.ink['1'],
    fontSize: 12,
    textAlign: 'right',
  },
  unit: {
    fontSize: 11,
    color: '#666',
    minWidth: 30,
  },
};

const textStyles: Record<string, React.CSSProperties> = {
  input: {
    width: 220,
    padding: '6px 8px',
    border: `1px solid ${tokens.colors.surface['2']}`,
    borderRadius: 4,
    background: tokens.colors.canvas,
    color: tokens.colors.ink['1'],
    fontSize: 12,
  },
};

const dangerBtnStyles: Record<string, React.CSSProperties> = {
  base: {
    padding: '5px 12px',
    border: '1px solid',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
  },
  cancel: {
    padding: '5px 10px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: 4,
    color: tokens.colors.steel.muted,
    fontSize: 12,
    cursor: 'pointer',
  },
  desc: {
    fontSize: 11,
    color: tokens.colors.steel.disabled,
  },
};
