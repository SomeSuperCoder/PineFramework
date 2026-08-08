import { useState, useCallback, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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

interface Settings {
  // Display
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
    <div className="flex items-center gap-2 border-b pb-2 mb-2" style={{ borderColor: tokens.colors.surface['1'] }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span className="text-[13px] font-semibold tracking-[0.02em]">{label}</span>
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
    <div
      className="flex items-center justify-between py-2.5 gap-4"
      style={{ borderBottom: `1px solid ${tokens.colors.hairline.default}` }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13px]">{label}</div>
        {description && (
          <div className="text-[11px] mt-0.5" style={{ color: tokens.colors.ink['3'] }}>
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function NumberControl({
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
    <div className="flex items-center gap-1.5">
      <Input
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
        className="w-[70px] h-9 text-right"
      />
      {unit && (
        <span className="text-[11px] min-w-[30px]" style={{ color: tokens.colors.ink['3'] }}>
          {unit}
        </span>
      )}
    </div>
  );
}

/** DANGER ACTION — an AlertDialog (Radix) confirm instead of the two-step
 *  inline button, so the destructive intent is explicit and screen-reader
 *  friendly (design §15.4 "destructive confirm" recipe). */
function DangerAction({
  label,
  description,
  onConfirm,
}: {
  label: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" size="sm">
            {label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{label}?</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>{label}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings>(() => ({
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
    <div
      style={{
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
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          aria-label="Back to dashboard"
        >
          ← Back
        </Button>
        <h3 className="m-0 text-[16px] font-semibold">Settings</h3>
        {saved && (
          <span className="ml-auto text-[11px] font-semibold opacity-80" style={{ color: tokens.colors.semantic.success }}>
            Saved
          </span>
        )}
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-6">
        {/* ── Display ── */}
        <div>
          <SectionHeader icon="🎨" label="Display" />
          <SettingRow label="Chart Animations" description="Smooth transitions on data updates">
            <Switch
              checked={settings.chartAnimations}
              onCheckedChange={(v) => update('chartAnimations', v)}
              aria-label="Chart Animations"
            />
          </SettingRow>
          <SettingRow label="Crosshair" description="Show crosshair cursor on chart">
            <Switch
              checked={settings.crosshairEnabled}
              onCheckedChange={(v) => update('crosshairEnabled', v)}
              aria-label="Crosshair"
            />
          </SettingRow>
          <SettingRow label="Grid Lines" description="Show background grid on chart">
            <Switch
              checked={settings.showGridLines}
              onCheckedChange={(v) => update('showGridLines', v)}
              aria-label="Grid Lines"
            />
          </SettingRow>
          <SettingRow label="Timezone" description="Display timezone for dates and timestamps">
            <Select value={settings.timezone} onValueChange={(v) => update('timezone', v)}>
              <SelectTrigger className="w-[180px] h-9" aria-label="Timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </div>

        {/* ── Data ── */}
        <div>
          <SectionHeader icon="📡" label="Data" />
          <SettingRow label="API Endpoint" description="Backend server URL">
            <Label htmlFor="settings-api-endpoint" className="sr-only">
              API Endpoint
            </Label>
            <Input
              id="settings-api-endpoint"
              value={settings.apiEndpoint}
              onChange={(e) => update('apiEndpoint', e.target.value)}
              placeholder="http://localhost:8081"
              className="w-[220px] h-9"
            />
          </SettingRow>
          <SettingRow label="Refresh Interval" description="How often to poll for new data">
            <NumberControl
              value={settings.refreshInterval}
              onChange={(v) => update('refreshInterval', v)}
              min={5}
              max={300}
              step={5}
              unit="sec"
            />
          </SettingRow>
          <SettingRow label="Enable Cache" description="Cache API responses locally">
            <Switch
              checked={settings.cacheEnabled}
              onCheckedChange={(v) => update('cacheEnabled', v)}
              aria-label="Enable Cache"
            />
          </SettingRow>
          <SettingRow label="Cache TTL" description="How long cached data stays valid">
            <NumberControl
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
        <div>
          <SectionHeader icon="⚙️" label="Advanced" />
          <SettingRow label="Debug Mode" description="Show extra diagnostic info in the UI">
            <Switch
              checked={settings.debugMode}
              onCheckedChange={(v) => update('debugMode', v)}
              aria-label="Debug Mode"
            />
          </SettingRow>
          <SettingRow label="Log Level" description="Verbosity of console logging">
            <Select value={settings.logLevel} onValueChange={(v) => update('logLevel', v as Settings['logLevel'])}>
              <SelectTrigger className="h-9" aria-label="Log Level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOG_LEVELS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label="Experimental Features" description="Enable unreleased UI features">
            <Switch
              checked={settings.experimentalFeatures}
              onCheckedChange={(v) => update('experimentalFeatures', v)}
              aria-label="Experimental Features"
            />
          </SettingRow>
        </div>

        {/* ── Danger Zone ── */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader icon="🗑️" label="Danger Zone" />
          <SettingRow label="Clear Cache" description="Remove all locally cached data">
            <DangerAction
              label="Clear"
              description="This will remove all locally cached data. This action cannot be undone."
              onConfirm={handleClearCache}
            />
          </SettingRow>
          <SettingRow label="Reset All Settings" description="Restore every setting to defaults">
            <DangerAction
              label="Reset All"
              description="This will restore every setting to its default value. This action cannot be undone."
              onConfirm={handleResetAll}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}