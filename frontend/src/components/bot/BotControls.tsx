import { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, OctagonX, Play, RotateCcw, Square, X } from 'lucide-react';
import { StrategySelector } from '../StrategySelector';
import { ProgressBar } from '../ProgressBar';
import type { BotStateT, WalletInfo, ConfigValues } from '../../types/bot';
import { TRADABLE_PAIRS, getTokenInfo } from 'pine-framework';
import { extractScriptName } from 'pine-framework/utils/script-name';
import { AutoSelectGrid } from './AutoSelectGrid';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---- Timezone Utilities ----

interface TimezoneGroup {
  group: string;
  zones: string[];
}

/** All IANA timezones grouped by continent/region */
const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    group: 'UTC',
    zones: ['UTC'],
  },
  {
    group: 'America',
    zones: [
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Anchorage', 'America/Adak', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
      'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Santiago',
      'America/Caracas', 'America/Panama', 'America/Havana', 'America/Jamaica',
      'America/Indiana/Indianapolis', 'America/Detroit', 'America/Phoenix',
      'America/North_Dakota/Center', 'America/Boise', 'America/Menominee',
      'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'America/Toronto',
      'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax',
      'America/St_Johns', 'America/Godthab', 'America/Montevideo', 'America/Asuncion',
      'America/La_Paz', 'America/Guayaquil', 'America/Managua', 'America/Costa_Rica',
      'America/Guatemala', 'America/Tegucigalpa', 'America/El_Salvador', 'America/Manaus',
      'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia',
      'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista',
      'America/Rio_Branco', 'America/Noronha', 'America/Miquelon', 'America/Nuuk',
      'America/Scoresbysund', 'America/Danmarkshavn', 'America/Thule',
    ],
  },
  {
    group: 'Europe',
    zones: [
      'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
      'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Brussels',
      'Europe/Vienna', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Oslo',
      'Europe/Copenhagen', 'Europe/Helsinki', 'Europe/Warsaw', 'Europe/Prague',
      'Europe/Budapest', 'Europe/Bucharest', 'Europe/Sofia', 'Europe/Athens',
      'Europe/Istanbul', 'Europe/Moscow', 'Europe/Kiev', 'Europe/Kyiv',
      'Europe/Minsk', 'Europe/Vilnius', 'Europe/Riga', 'Europe/Tallinn',
      'Europe/Lisbon', 'Europe/Monaco', 'Europe/Luxembourg', 'Europe/Zurich',
      'Europe/Jersey', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Minsk',
    ],
  },
  {
    group: 'Asia',
    zones: [
      'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore',
      'Asia/Seoul', 'Asia/Taipei', 'Asia/Kolkata', 'Asia/Calcutta',
      'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Bahrain',
      'Asia/Kuwait', 'Asia/Muscat', 'Asia/Aden', 'Asia/Beirut',
      'Asia/Damascus', 'Asia/Amman', 'Asia/Jerusalem', 'Asia/Tel_Aviv',
      'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Phnom_Penh', 'Asia/Vientiane',
      'Asia/Yangon', 'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Makassar',
      'Asia/Jayapura', 'Asia/Manila', 'Asia/Almaty', 'Asia/Bishkek',
      'Asia/Tashkent', 'Asia/Dushanbe', 'Asia/Kabul', 'Asia/Tehran',
      'Asia/Baku', 'Asia/Tbilisi', 'Asia/Yerevan', 'Asia/Tbilisi',
      'Asia/Karachi', 'Asia/Dhaka', 'Asia/Colombo', 'Asia/Kathmandu',
      'Asia/Thimphu', 'Asia/Ulaanbaatar', 'Asia/Pyongyang', 'Asia/Chongqing',
      'Asia/Urumqi', 'Asia/Kashmir', 'Asia/Qyzylorda', 'Asia/Aqtau',
      'Asia/Aqtobe', 'Asia/Oral', 'Asia/Ashgabat', 'Asia/Turkmenistan',
    ],
  },
  {
    group: 'Africa',
    zones: [
      'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi',
      'Africa/Casablanca', 'Africa/Algiers', 'Africa/Tunis', 'Africa/Tripoli',
      'Africa/Accra', 'Africa/Addis_Ababa', 'Africa/Dar_es_Salaam', 'Africa/Kampala',
      'Africa/Kinshasa', 'Africa/Lubumbashi', 'Africa/Khartoum', 'Africa/Juba',
      'Africa/Maputo', 'Africa/Harare', 'Africa/Lusaka', 'Africa/Blantyre',
      'Africa/Windhoek', 'Africa/Gaborone', 'Africa/Maseru', 'Africa/Mbabane',
      'Africa/Freetown', 'Africa/Abidjan', 'Africa/Dakar', 'Africa/Bamako',
      'Africa/Niamey', 'Africa/Ndjamena', 'Africa/Bangui', 'Africa/Libreville',
      'Africa/Malabo', 'Africa/Sao_Tome', 'Africa/Bissau', 'Africa/Conakry',
    ],
  },
  {
    group: 'Australia / Pacific',
    zones: [
      'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth',
      'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart', 'Australia/Lord_Howe',
      'Australia/Lindeman', 'Australia/Eucla', 'Australia/Broken_Hill', 'Australia/Currie',
      'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fiji', 'Pacific/Guam',
      'Pacific/Port_Moresby', 'Pacific/Noumea', 'Pacific/Tongatapu', 'Pacific/Apia',
      'Pacific/Efate', 'Pacific/Galapagos', 'Pacific/Honolulu', 'Pacific/Midway',
      'Pacific/Niue', 'Pacific/Pago_Pago', 'Pacific/Palau', 'Pacific/Kosrae',
      'Pacific/Pohnpei', 'Pacific/Tarawa', 'Pacific/Majuro', 'Pacific/Kwajalein',
      'Pacific/Enderbury', 'Pacific/Kiritimati', 'Pacific/Rarotonga', 'Pacific/Tahiti',
      'Pacific/Marquesas', 'Pacific/Gambier', 'Pacific/Bora_Bora', 'Pacific/Tahiti',
    ],
  },
];

/** Detect user's timezone via Intl API (OS-level, VPN-proof) */
function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** Get a human-readable label for an IANA timezone */
function getTimezoneLabel(iana: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    const abbreviation = tzPart?.value ?? '';
    return abbreviation ? `${iana} (${abbreviation})` : iana;
  } catch {
    return iana;
  }
}

// ---- Wallet Import Panel ----

function WalletImportPanel({ backendUrl, wallet, onWalletChange }: {
  backendUrl: string;
  wallet: WalletInfo;
  onWalletChange: (w: WalletInfo) => void;
}) {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [previewPublicKey, setPreviewPublicKey] = useState<string | null>(null);
  const [previewBalance, setPreviewBalance] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importedBalance, setImportedBalance] = useState<number | null>(null);
  const [importedBalanceLoading, setImportedBalanceLoading] = useState(false);

  // Fetch balance for already-imported wallet on mount
  useEffect(() => {
    if (wallet.hasWallet && wallet.publicKey) {
      setImportedBalanceLoading(true);
      fetch(`${backendUrl}/api/bot/wallet/balance`)
        .then(r => r.json())
        .then(data => { if (data.success) setImportedBalance(data.balance); })
        .catch(() => {})
        .finally(() => setImportedBalanceLoading(false));
    }
  }, [wallet.hasWallet, wallet.publicKey, backendUrl]);

  // Fetch preview (public key + balance) when seed phrase changes
  const fetchPreview = async (phrase: string) => {
    const words = phrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setPreviewPublicKey(null);
      setPreviewBalance(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/bot/wallet/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedPhrase: phrase.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setPreviewPublicKey(data.publicKey);
        setPreviewBalance(data.balance);
      } else {
        setPreviewPublicKey(null);
        setPreviewBalance(null);
      }
    } catch {
      setPreviewPublicKey(null);
      setPreviewBalance(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError('Seed phrase must be 12 or 24 words');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/bot/wallet/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedPhrase: seedPhrase.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
      } else {
        onWalletChange({ hasWallet: true, publicKey: data.publicKey, usdcBalance: previewBalance });
        setSeedPhrase('');
        setPassword('');
      }
    } catch {
      setError('Network error — is the backend running?');
    } finally {
      setImporting(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remove wallet? This cannot be undone.')) return;
    setImporting(true);
    try {
      const res = await fetch(`${backendUrl}/api/bot/wallet?confirm=true`, { method: 'DELETE' });
      if (res.ok) {
        onWalletChange({ hasWallet: false });
      }
    } catch { /* ignore */ } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mb-4">
      <div className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
        Wallet {wallet.hasWallet ? '✓ Imported' : '— Not Imported'}
      </div>
      {wallet.hasWallet ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-[#22c55e]">
            {wallet.publicKey?.slice(0, 8)}...{wallet.publicKey?.slice(-4)}
          </span>
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            {importedBalanceLoading ? (
              'Loading balance...'
            ) : importedBalance !== null ? (
              <span className="text-[var(--color-primary)]">
                USDC: {importedBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            ) : null}
          </span>
          <Button
            type="button"
            variant="ghost"
            onClick={handleRemove}
            disabled={importing}
            className="h-9 border border-[var(--color-destructive)]/40 px-3 text-xs text-[var(--color-destructive)] hover:bg-[rgba(239,68,68,0.12)]"
          >
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={seedPhrase}
            onChange={(e) => {
              setSeedPhrase(e.target.value);
              // Debounced preview fetch
              const val = e.target.value;
              setTimeout(() => fetchPreview(val), 500);
            }}
            placeholder="Paste 12 or 24 word seed phrase..."
            rows={2}
            className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-secondary)] p-2 font-mono text-[11px] text-[var(--color-foreground)]"
          />

          {/* Balance preview — shown after valid seed phrase */}
          {(previewLoading || previewPublicKey) && (
            <div className="rounded-md border border-[var(--color-border)] bg-[rgba(34,197,94,0.12)] p-2">
              {previewLoading ? (
                <span className="text-[11px] text-[var(--color-muted-foreground)]">Checking wallet...</span>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[11px] text-[#22c55e]">
                    {previewPublicKey?.slice(0, 8)}...{previewPublicKey?.slice(-4)}
                  </span>
                  <span className="text-[11px] text-[var(--color-primary)]">
                    USDC: {(previewBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set encryption password (min 8 chars)"
            className="w-full box-border rounded-md border border-[var(--color-border)] bg-[var(--color-secondary)] p-2 text-[11px] text-[var(--color-foreground)]"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleImport}
              disabled={importing || !seedPhrase.trim() || !password}
              className="h-10 border-[#22c55e]/50 bg-[rgba(34,197,94,0.12)] px-3 text-xs font-semibold text-[#22c55e] hover:bg-[rgba(34,197,94,0.12)]"
            >
              {importing ? 'Importing...' : 'Import Wallet'}
            </Button>
          </div>
          {error && <div className="text-[10px] text-[var(--color-destructive)]">{error}</div>}
        </div>
      )}
    </div>
  );
}

/** Check strategy source for patterns that are incompatible with live spot trading. */
function checkStrategyCompatibility(source: string): string[] {
  const warnings: string[] = [];

  // Remove comments and strings to avoid false positives
  let cleaned = source
    // Remove single-line comments
    .replace(/\/\/.*$/gm, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove template literals
    .replace(/`[^`]*`/g, '')
    // Remove single-quoted strings
    .replace(/'[^']*'/g, '')
    // Remove double-quoted strings
    .replace(/"[^"]*"/g, '');

  if (/strategy\.short\b/.test(cleaned)) {
    warnings.push('This strategy uses short positions (strategy.short). Spot trading only supports long positions.');
  }

  if (/strategy\.entry\s*\([^)]*\blimit\s*=/.test(cleaned)) {
    warnings.push('Limit orders (limit=) are not supported by DEX swaps. Market orders will be used.');
  }

  if (/strategy\.exit\s*\([^)]*\bshort\b/.test(cleaned)) {
    warnings.push('This strategy uses short exits (strategy.exit with short). Spot trading does not support short positions.');
  }

  if (/\bstrategy\.openprofit\b/.test(cleaned)) {
    warnings.push('strategy.openprofit may report different values in live trading vs backtesting.');
  }

  return warnings;
}

/** Calculate max daily loss: min($1, 10% × USDC balance) */
function calcMaxDailyLoss(usdcBalance: number): number {
  return Math.min(1, usdcBalance * 0.10);
}

function BotConfigPanel({ backendUrl, onConfigured, onConfigValues, usdcBalance }: {
  backendUrl: string;
  onConfigured: () => void;
  onConfigValues?: (values: ConfigValues) => void;
  usdcBalance: number | null;
}) {
  const [strategySource, setStrategySource] = useState('');
  const [dex, setDex] = useState<'jupiter-swap' | 'jupiter-ultra'>('jupiter-swap');
  const [timezone, setTimezone] = useState(() => {
    const stored = localStorage.getItem('botTimezone');
    if (stored) return stored;
    return detectTimezone();
  });
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState('');
  const [manualOverride, setManualOverride] = useState(false);
  const [manualMaxDailyLoss, setManualMaxDailyLoss] = useState('1.00');
  const [timezoneFilter, setTimezoneFilter] = useState('');

  // Persist timezone to localStorage
  useEffect(() => {
    localStorage.setItem('botTimezone', timezone);
  }, [timezone]);

  const calculatedMaxDailyLoss = calcMaxDailyLoss(usdcBalance ?? 0);
  const maxDailyLoss = manualOverride ? Number(manualMaxDailyLoss) : calculatedMaxDailyLoss;

  const compatibilityWarnings = useMemo(
    () => checkStrategyCompatibility(strategySource),
    [strategySource]
  );

  const handleConfigure = async () => {
    if (!strategySource.trim()) {
      setError('Select a strategy or paste your Pine Script strategy source code');
      return;
    }
    setConfiguring(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/bot/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategySource: strategySource.trim(),
          dex,
          risk: { maxDailyLoss },
          autoSelect: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Configuration failed');
      } else {
        onConfigValues?.({
          strategySource: strategySource.trim(),
          dex,
          maxDailyLoss,
          timezone,
        });
        onConfigured();
      }
    } catch {
      setError('Network error');
    } finally {
      setConfiguring(false);
    }
  };

  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
        Configuration
      </div>
      <div className="flex flex-col gap-2">
        <StrategySelector
          value={strategySource}
          onChange={(src, _name, _id) => { setStrategySource(src); }}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="text-[11px] text-[var(--color-muted-foreground)]">
            DEX:{' '}
            <select
              value={dex}
              onChange={(e) => setDex(e.target.value as 'jupiter-swap' | 'jupiter-ultra')}
              className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]"
            >
              <option value="jupiter-swap">Jupiter Swap</option>
              <option value="jupiter-ultra">Jupiter Ultra</option>
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
              <input
                type="checkbox"
                checked={manualOverride}
                onChange={(e) => setManualOverride(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              Manual Override
            </label>
            {manualOverride ? (
              <label className="text-[11px] text-[var(--color-muted-foreground)]">
                Max Daily Loss ($):{' '}
                <input
                  type="number"
                  value={manualMaxDailyLoss}
                  onChange={(e) => setManualMaxDailyLoss(e.target.value)}
                  min="0"
                  step="0.01"
                  className="ml-1 w-[70px] rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]"
                />
              </label>
            ) : (
              <span className="text-[11px] text-[var(--color-muted-foreground)]">
                Max Daily Loss:{' '}
                <span className="font-semibold text-[var(--color-primary)]">
                  ${maxDailyLoss.toFixed(2)}
                </span>
                <span className="ml-1 text-[10px] text-[var(--color-muted-foreground)]">
                  (10% × ${usdcBalance?.toFixed(2) ?? '0.00'})
                </span>
              </span>
            )}
          </div>
          <label className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
            Timezone:{' '}
            <input
              type="text"
              placeholder="Filter..."
              value={timezoneFilter}
              onChange={(e) => setTimezoneFilter(e.target.value)}
              className="ml-1 w-20 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-1 text-[10px] text-[var(--color-foreground)]"
            />
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]"
            >
              {TIMEZONE_GROUPS.map((group) => {
                const filtered = timezoneFilter
                  ? group.zones.filter(z => z.toLowerCase().includes(timezoneFilter.toLowerCase()))
                  : group.zones;
                if (filtered.length === 0) return null;
                return (
                  <optgroup key={group.group} label={group.group}>
                    {filtered.map((zone) => (
                      <option key={zone} value={zone}>{getTimezoneLabel(zone)}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
        </div>
        {error && <div className="text-[10px] text-[var(--color-destructive)]">{error}</div>}
        {compatibilityWarnings.length > 0 && (
          <div className="mt-1 rounded border border-[#eab308] bg-[rgba(234,179,8,0.12)] px-2.5 py-1.5">
            <div className="mb-0.5 text-[10px] font-semibold text-[#eab308]">
              ⚠ Live Trading Compatibility Notes
            </div>
            {compatibilityWarnings.map((w, i) => (
              <div key={i} className="text-[10px] text-[#eab308]">{w}</div>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={handleConfigure}
          disabled={configuring}
          className="h-11 self-start border-[var(--color-primary)]/50 bg-[rgba(var(--color-primary),0.12)] px-4 text-xs font-semibold text-[var(--color-primary)] hover:bg-[rgba(var(--color-primary),0.12)]"
        >
          {configuring ? 'Configuring...' : 'Apply Configuration'}
        </Button>
      </div>
    </div>
  );
}

export function TradingBotControlButton({
  backendUrl,
  botState,
  connected,
  onToggleDashboard,
  dashboardOpen,
}: {
  backendUrl: string;
  botState: BotStateT;
  connected: boolean;
  onToggleDashboard: () => void;
  dashboardOpen: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const sendCommand = async (command: string) => {
    setLoading(true);
    try {
      await fetch(`${backendUrl}/api/bot/${command}`, { method: 'POST' });
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const isRunning = botState === 'Running';
  const isStopped = botState === 'Idle' || botState === 'Stopped';
  const isError = botState === 'Error';
  const transitioning = botState === 'Starting' || botState === 'Stopping';

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant={dashboardOpen ? 'secondary' : 'ghost'}
        onClick={isStopped && dashboardOpen ? () => sendCommand('start') : onToggleDashboard}
        disabled={loading}
        title={isStopped && dashboardOpen ? 'Start Live Trading Bot' : dashboardOpen ? 'Hide Dashboard' : 'Show Bot Dashboard'}
        aria-pressed={isStopped && dashboardOpen ? undefined : dashboardOpen}
        className={cn(
          'h-10 px-3 text-sm',
          dashboardOpen
            ? 'bg-[rgba(34,197,94,0.12)] text-[#22c55e] hover:bg-[rgba(34,197,94,0.12)]'
            : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
        )}
      >
        {isStopped && dashboardOpen ? (
          <Play className="size-4" aria-hidden="true" />
        ) : (
          <LayoutDashboard className="size-4" aria-hidden="true" />
        )}
        Bot Dashboard
      </Button>
      {isRunning && (
        <>
          <Button
            type="button"
            variant="destructive"
            onClick={() => sendCommand('stop')}
            disabled={loading}
            title="Stop Bot"
            className="h-10 px-3 text-sm font-semibold"
          >
            <Square className="size-3.5" aria-hidden="true" />
            Stop Bot
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => sendCommand('emergency-stop')}
            disabled={loading}
            title="Emergency Stop"
            aria-label="Emergency Stop"
            className="h-10 w-10"
          >
            <OctagonX className="size-4" aria-hidden="true" />
          </Button>
        </>
      )}
      {isError && (
        <Button
          type="button"
          variant="outline"
          onClick={() => sendCommand('reset')}
          disabled={loading}
          title="Reset Bot"
          className="h-10 border-[#eab308]/50 px-3 text-sm text-[#eab308] hover:bg-[rgba(234,179,8,0.12)]"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Reset
        </Button>
      )}
      {transitioning && (
        <span className="text-[11px] font-medium italic text-[#eab308]">{botState}...</span>
      )}
      {!connected && (botState !== 'Idle' || dashboardOpen) && (
        <span className="ml-0.5 text-[10px] text-[#eab308]" title="Reconnecting...">
          ○
        </span>
      )}
    </div>
  );
}

// ---- Setup Wizard ----

export function SetupWizard({
  backendUrl,
  initialWallet,
  persistedConfig,
  onStart,
  onClose,
  autoSelectProgress,
  autoSelectResult,
  onConfigReset,
  onBacktestStarted,
  chaosError = null,
}: {
  backendUrl: string;
  initialWallet: WalletInfo;
  persistedConfig?: {
    strategySource: string;
    dex: string;
    risk: { maxDailyLoss: number };
    autoSelect?: boolean;
    pairs?: Array<{ symbol: string; timeframe: string }>;
    walletPublicKey?: string;
  } | null;
  onStart: () => Promise<void>;
  onClose: () => void;
  autoSelectProgress?: { current: number; total: number; pair: { symbol: string; timeframe: string }; phase: string; statuses: Record<string, { phase: string; status: 'pending' | 'active' | 'done' | 'failed' }>; candleProgress?: { fetched: number; total: number }; ranking?: Array<{ label: string; metrics: Record<string, number> }> } | null;
  autoSelectResult?: {
    best: { pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> };
    ranking: Array<{ pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> }>;
    evaluatedCount: number;
    failedCount: number;
  } | null;
  onConfigReset?: () => void;
  onBacktestStarted?: () => void;
  /** Non-null when the last chaos toggle failed — Start is blocked and the error is shown. */
  chaosError?: string | null;
}) {
  // Determine initial step: if config exists AND wallet exists, go to review
  const getInitialStep = (): 'wallet' | 'config' | 'backtest-choice' | 'backtest' | 'review' => {
    if (persistedConfig && initialWallet.hasWallet) {
      return 'review';
    }
    return initialWallet.hasWallet ? 'config' : 'wallet';
  };

  const [step, setStep] = useState<'wallet' | 'config' | 'backtest-choice' | 'backtest' | 'review'>(getInitialStep);
  const [wallet, setWallet] = useState<WalletInfo>(initialWallet);
  const [configValues, setConfigValues] = useState<ConfigValues | null>(() => {
    // Initialize configValues from persisted config if available
    if (persistedConfig) {
      return {
        strategySource: persistedConfig.strategySource,
        dex: persistedConfig.dex,
        maxDailyLoss: persistedConfig.risk.maxDailyLoss,
        timezone: (() => {
          const stored = localStorage.getItem('botTimezone');
          return stored || detectTimezone();
        })(),
      };
    }
    return null;
  });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [configureError, setConfigureError] = useState('');
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(() => {
    const saved = localStorage.getItem('autoSelectTimeframes');
    return saved ? JSON.parse(saved) : ['5', '15', '60', '240'];
  });
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [backtestRunThisSession, setBacktestRunThisSession] = useState(false);
  const [backtestMode, setBacktestMode] = useState<'auto' | 'manual'>('auto');
  const [manualPair, setManualPair] = useState<{ symbol: string; timeframe: string } | null>(null);

  // When persisted config/wallet data loads after mount (e.g. after bot stops, when
  // LiveDashboard re-fetches wallet status + config), advance to review.
  //   - 'config' → 'review': persisted config arrived after mount
  //   - 'wallet' → 'review': wallet info arrived after mount while the local state
  //     still shows "no wallet" (stale import-wallet step). A user deliberately
  //     viewing an already-imported wallet is left alone.
  useEffect(() => {
    if (!persistedConfig || !initialWallet.hasWallet || step === 'review') return;
    if (step === 'config' || (step === 'wallet' && !wallet.hasWallet)) {
      setStep('review');
    }
  }, [persistedConfig, initialWallet.hasWallet, wallet.hasWallet, step]);

  // Balance from wallet info or fetched from backend
  const [usdcBalance, setUsdcBalance] = useState<number | null>(wallet.usdcBalance ?? null);

  // Fetch balance from backend if wallet exists but balance is missing (e.g., after page reload)
  useEffect(() => {
    if (wallet.hasWallet && usdcBalance === null) {
      fetch(`${backendUrl}/api/bot/wallet/balance`)
        .then(r => r.json())
        .then(data => { if (data.success) setUsdcBalance(data.balance); })
        .catch(() => {});
    }
  }, [wallet.hasWallet, usdcBalance, backendUrl]);

  useEffect(() => {
    localStorage.setItem('autoSelectTimeframes', JSON.stringify(selectedTimeframes));
  }, [selectedTimeframes]);

  // Auto-advance from Backtest to Review when auto-select completes
  useEffect(() => {
    if (step === 'backtest' && autoSelectResult) {
      setStep('review');
    }
  }, [step, autoSelectResult]);

  const handleStart = async () => {
    if (chaosError) {
      // The engine's chaos state is unknown/inconsistent — never start on a lie.
      setStartError('Start blocked: chaos mode could not be updated. Resolve the chaos mode error before starting.');
      return;
    }
    setStarting(true);
    setStartError('');
    try {
      await onStart();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start bot');
    } finally {
      setStarting(false);
    }
  };

  const handleResetConfig = async (removeWallet: boolean) => {
    const confirmMessage = removeWallet
      ? 'Reset everything? This will remove your wallet and all configuration.'
      : 'Reset configuration? Your wallet will be kept.';
    if (!confirm(confirmMessage)) return;

    setResetting(true);
    setResetError('');
    try {
      const res = await fetch(`${backendUrl}/api/bot/config`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeWallet }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Reset failed');
      }
      // Clear local state
      setConfigValues(null);
      onConfigReset?.();
      // Go to appropriate step
      if (removeWallet) {
        setWallet({ hasWallet: false });
        setStep('wallet');
      } else {
        setStep('config');
      }
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const handleRerunBacktest = async () => {
    setStep('backtest-choice');
  };

  const StepDot = ({ s, label }: { s: typeof step; label: string }) => {
    const steps = ['wallet', 'config', 'backtest-choice', 'backtest', 'review'];
    const idx = steps.indexOf(s) + 1;
    const active = step === s;
    const done = steps.indexOf(s) < steps.indexOf(step);
    return (
      <span
        onClick={done ? () => setStep(s) : undefined}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]',
          active
            ? 'font-semibold text-[var(--color-foreground)]'
            : done
              ? 'cursor-pointer text-[#22c55e]'
              : 'text-[var(--color-muted-foreground)]',
        )}
      >
        <span
          className={cn(
            'inline-flex size-[18px] items-center justify-center rounded-full border font-semibold',
            active
              ? 'border-[var(--color-primary)] bg-[rgba(var(--color-primary),0.12)] text-[var(--color-primary)]'
              : done
                ? 'border-[#22c55e] bg-[rgba(34,197,94,0.12)] text-[#22c55e]'
                : 'border-[var(--color-input)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
          )}
        >
          {done ? '✓' : idx}
        </span>
        {label}
      </span>
    );
  };

  const handleBacktestChoice = async (mode: 'auto' | 'manual') => {
    setBacktestMode(mode);
    if (mode === 'auto') {
      try {
        await fetch(`${backendUrl}/api/bot/backtest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeframes: selectedTimeframes }),
        });
        setBacktestRunThisSession(true);
        onBacktestStarted?.();
      } catch (err) {
        console.error('Backtest trigger failed:', err);
      }
    }
    setStep('backtest');
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Step indicator */}
      <div className="flex items-center border-b border-[var(--color-card)] pb-2">
        <StepDot s="wallet" label="Wallet" />
        <span className="mx-0.5 text-[var(--color-muted-foreground)]">→</span>
        <StepDot s="config" label="Config" />
        <span className="mx-0.5 text-[var(--color-muted-foreground)]">→</span>
        <StepDot s="backtest-choice" label="Backtest" />
        <span className="mx-0.5 text-[var(--color-muted-foreground)]">→</span>
        <StepDot s="review" label="Review" />
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          className="h-9 w-9 text-[var(--color-muted-foreground)]"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Step 1: Wallet */}
      {step === 'wallet' && (
        <div>
          <WalletImportPanel backendUrl={backendUrl} wallet={wallet} onWalletChange={setWallet} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('config')}
              disabled={!wallet.hasWallet}
              className="h-11 border-[var(--color-primary)]/50 bg-[rgba(var(--color-primary),0.12)] px-5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[rgba(var(--color-primary),0.12)]"
            >
              Next →
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Config */}
      {step === 'config' && (
        <div>
          <BotConfigPanel
            backendUrl={backendUrl}
            onConfigured={() => { setStep('backtest-choice'); }}
            onConfigValues={(v) => setConfigValues(v)}
            usdcBalance={usdcBalance}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('wallet')}
              className="h-10 px-3.5 text-[11px] text-[var(--color-muted-foreground)]"
            >
              ← Back
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Backtest Choice */}
      {step === 'backtest-choice' && (
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
            Backtest Selection
          </div>
          <div className="mb-3 text-[11px] text-[var(--color-muted-foreground)]">
            How would you like to select your trading pair?
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleBacktestChoice('auto')}
              className="h-auto flex-col items-start gap-1 border-[var(--color-primary)]/50 bg-[rgba(var(--color-primary),0.12)] px-4 py-3 text-left text-xs font-semibold text-[var(--color-primary)] hover:bg-[rgba(var(--color-primary),0.12)]"
            >
              <span>🚀 Run Auto-Select Backtest</span>
              <span className="text-[10px] font-normal text-[var(--color-muted-foreground)]">
                Automatically evaluate multiple pairs and timeframes to find the best performer
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleBacktestChoice('manual')}
              className="h-auto flex-col items-start gap-1 border-[#eab308]/60 bg-[rgba(234,179,8,0.12)] px-4 py-3 text-left text-xs font-semibold text-[#eab308] hover:bg-[rgba(234,179,8,0.12)]"
            >
              <span>✋ Manually Select Pair & Timeframe</span>
              <span className="text-[10px] font-normal text-[var(--color-muted-foreground)]">
                Choose your own pair and timeframe — you take full responsibility for the selection
              </span>
            </Button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 12 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('config')}
              className="h-10 px-3.5 text-[11px] text-[var(--color-muted-foreground)]"
            >
              ← Back
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Backtest */}
      {step === 'backtest' && (
        <div>
          {/* Manual Selection Mode */}
          {backtestMode === 'manual' && (
            <div className="mb-3 rounded-md border border-[#eab308] bg-[rgba(234,179,8,0.12)] p-3">
              <div className="mb-1 text-[11px] font-semibold text-[#eab308]">
                ⚠ Manual Selection Mode
              </div>
              <div className="mb-2 text-[10px] text-[#eab308]">
                Auto-select was skipped. You are fully responsible for your pair/timeframe choice.
                The bot will only trade the pair you select — no automated evaluation was performed.
              </div>
               <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label className="text-[11px] text-[var(--color-muted-foreground)]">
                  Pair:{' '}
                  <select
                    value={manualPair?.symbol ?? ''}
                    onChange={(e) => setManualPair(prev => ({
                      symbol: e.target.value,
                      timeframe: prev?.timeframe ?? '60',
                    }))}
                    className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]"
                  >
                    <option value="">Select pair...</option>
                    {TRADABLE_PAIRS.map(pair => {
                      const info = getTokenInfo(pair);
                      const display = info ? `${info.symbol}/${info.quote}` : pair;
                      return <option key={pair} value={pair}>{display}</option>;
                    })}
                  </select>
                </label>
                <label className="text-[11px] text-[var(--color-muted-foreground)]">
                  Timeframe:{' '}
                  <select
                    value={manualPair?.timeframe ?? '60'}
                    onChange={(e) => setManualPair(prev => ({
                      symbol: prev?.symbol ?? '',
                      timeframe: e.target.value,
                    }))}
                    className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]"
                  >
                    <option value="1">1m</option>
                    <option value="5">5m</option>
                    <option value="15">15m</option>
                    <option value="30">30m</option>
                    <option value="60">1h</option>
                    <option value="240">4h</option>
                    <option value="1440">1d</option>
                  </select>
                </label>
              </div>
              {/* Validation: empty check */}
              {manualPair && (!manualPair.symbol || !manualPair.timeframe) && (
                <div className="mt-2 text-[10px] text-[var(--color-destructive)]">
                  Both pair and timeframe are required
                </div>
              )}
            </div>
          )}

          {/* Auto-Select Mode */}
          {backtestMode === 'auto' && (
            <>
              <div className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
                Auto-Select Backtest
              </div>
              <div className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
                Evaluating candidate pairs sequentially...
              </div>

              {/* Timeframe Selection */}
              {!autoSelectProgress && (
                <div className="mb-3">
                  <div className="mb-1.5 text-[11px] text-[var(--color-muted-foreground)]">Select Timeframes:</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['5', '15', '60', '240'].map(tf => (
                      <label key={tf} className="flex cursor-pointer items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedTimeframes.includes(tf)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTimeframes(prev => [...prev, tf]);
                            } else {
                              setSelectedTimeframes(prev => prev.filter(t => t !== tf));
                            }
                          }}
                          className="accent-[var(--color-primary)]"
                        />
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">
                          {tf === '5' ? '5m' : tf === '15' ? '15m' : tf === '60' ? '1h' : '4h'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-Select Progress */}
              {autoSelectProgress && (
            <div className="rounded-md border border-[#eab308] bg-[var(--color-secondary)]/60 p-3">
              <ProgressBar
                progress={(autoSelectProgress.current / Math.max(autoSelectProgress.total, 1)) * 100}
                phase="Evaluating"
                variant="inline"
                status="running"
              />
              <div style={{ marginTop: 8 }}>
                <AutoSelectGrid
                  statuses={autoSelectProgress.statuses}
                  ranking={autoSelectProgress.ranking}
                  candleProgress={autoSelectProgress.candleProgress}
                  currentPair={`${autoSelectProgress.pair.symbol} (${autoSelectProgress.pair.timeframe})`}
                />
              </div>
            </div>
          )}

          {/* Auto-Select Results */}
          {autoSelectResult && (
            <div className="mt-3 rounded-md border border-[#22c55e] bg-[rgba(34,197,94,0.12)] p-3">
              <div className="mb-1 text-[11px] font-semibold text-[#22c55e]">
                Auto-Select Complete
              </div>
              <div className="mb-1 text-[11px] text-[var(--color-muted-foreground)]">
                Evaluated {autoSelectResult.evaluatedCount} pair
                {autoSelectResult.evaluatedCount !== 1 ? 's' : ''}
                {autoSelectResult.failedCount > 0 && `, ${autoSelectResult.failedCount} failed`}
              </div>
              <AutoSelectGrid
                statuses={Object.fromEntries(
                  autoSelectResult.ranking.map(r => [r.label, { phase: 'done', status: 'done' as const }])
                )}
                ranking={autoSelectResult.ranking}
              />
              <div className="mt-2 rounded bg-[rgba(34,197,94,0.12)] px-2 py-1.5">
                <span className="text-[11px] font-semibold text-[#22c55e]">
                  ★ Best: {autoSelectResult.best.label}
                </span>
                <span className="ml-2 text-[10px] text-[var(--color-muted-foreground)]">
                  PF: {autoSelectResult.best.metrics.profitFactor?.toFixed(2)}
                  {' '}Sharpe: {autoSelectResult.best.metrics.sharpeRatio?.toFixed(2)}
                </span>
              </div>
            </div>
          )}
            </>
          )}

          {configureError && (
            <div className="mt-2 text-[11px] text-[var(--color-destructive)]">
              ⚠ {configureError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => backtestMode === 'manual' ? setStep('backtest-choice') : setStep('config')}
              disabled={!!autoSelectProgress}
              className="h-10 px-3.5 text-[11px] text-[var(--color-muted-foreground)]"
            >
              ← Back
            </Button>
            {backtestMode === 'auto' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('review')}
                disabled={!autoSelectResult}
                className="h-11 border-[#22c55e]/50 bg-[rgba(34,197,94,0.12)] px-6 text-xs font-semibold text-[#22c55e] hover:bg-[rgba(34,197,94,0.12)]"
              >
                Next →
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (!manualPair) return;
                  setConfigureError('');
                  // Persist manual pair selection to backend so engine.start() can find it.
                  // A failed configure must NOT advance to review/Start — the engine would
                  // start with stale config while the UI claims the new pair is saved.
                  try {
                    const res = await fetch(`${backendUrl}/api/bot/configure`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        strategySource: configValues?.strategySource ?? persistedConfig?.strategySource ?? '',
                        dex: configValues?.dex ?? persistedConfig?.dex ?? 'jupiter-swap',
                        risk: { maxDailyLoss: configValues?.maxDailyLoss ?? persistedConfig?.risk?.maxDailyLoss ?? 1 },
                        autoSelect: false,
                        pairs: [manualPair],
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setConfigureError(data.error || `Failed to save configuration (HTTP ${res.status})`);
                      return;
                    }
                    // Refresh persisted config so the resolved manual pair reaches
                    // LiveDashboard before the bot starts (mini chart activePair).
                    onBacktestStarted?.();
                    setStep('review');
                  } catch {
                    setConfigureError('Failed to save configuration — check backend connection');
                  }
                }}
                disabled={!manualPair?.symbol}
                className="h-11 border-[#22c55e]/50 bg-[rgba(34,197,94,0.12)] px-6 text-xs font-semibold text-[#22c55e] hover:bg-[rgba(34,197,94,0.12)]"
              >
                Next →
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Review & Start */}
      {step === 'review' && (
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
            Review & Start
          </div>
          <div className="flex flex-col gap-1.5 text-[11px]">
            <div>
              <span className="text-[var(--color-muted-foreground)]">Wallet: </span>
              <span className="text-[#22c55e]">
                {wallet.publicKey ? `${wallet.publicKey.slice(0, 8)}...${wallet.publicKey.slice(-4)}` : '(none)'}
              </span>
            </div>
            {configValues && (
              <>
                <div>
                  <span className="text-[var(--color-muted-foreground)]">Strategy: </span>
                  <span className="text-[var(--color-foreground)]">
                    {extractScriptName(configValues.strategySource) ?? '(unnamed strategy)'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-muted-foreground)]">DEX: </span>
                  <span className="text-[var(--color-foreground)]">{configValues.dex}</span>
                </div>
                <div>
                  <span className="text-[var(--color-muted-foreground)]">Selected Pair: </span>
                  <span className="font-semibold text-[#22c55e]">
                    {backtestMode === 'manual' && manualPair
                      ? `${manualPair.symbol} (${manualPair.timeframe === '5' ? '5m' : manualPair.timeframe === '15' ? '15m' : manualPair.timeframe === '60' ? '1h' : '4h'})`
                      : autoSelectResult?.best?.label ?? (persistedConfig?.pairs?.[0] ? `${persistedConfig.pairs[0].symbol} (${persistedConfig.pairs[0].timeframe})` : 'Pending...')}
                  </span>
                </div>
                {backtestMode === 'manual' && (
                  <div className="ml-[60px] text-[10px] text-[#eab308]">
                    Manual selection — no auto-select evaluation performed
                  </div>
                )}
                {autoSelectResult && backtestMode === 'auto' && (
                  <div className="ml-[60px] text-[10px] text-[var(--color-muted-foreground)]">
                    PF: {autoSelectResult.best.metrics.profitFactor?.toFixed(2)}
                    {' '}Sharpe: {autoSelectResult.best.metrics.sharpeRatio?.toFixed(2)}
                  </div>
                )}
                <div>
                  <span className="text-[var(--color-muted-foreground)]">Max Daily Loss: </span>
                  <span className="text-[var(--color-foreground)]">${configValues.maxDailyLoss}</span>
                </div>
                <div>
                  <span className="text-[var(--color-muted-foreground)]">Timezone: </span>
                  <span className="text-[var(--color-foreground)]">{getTimezoneLabel(configValues.timezone)}</span>
                </div>
              </>
            )}
          </div>

          {startError && (
            <div className="mt-2 text-[11px] text-[var(--color-destructive)]">{startError}</div>
          )}
          {resetError && (
            <div className="mt-2 text-[11px] text-[var(--color-destructive)]">{resetError}</div>
          )}
          {chaosError && (
            <div className="mt-2 text-[11px] text-[var(--color-destructive)]">
              ⚠ Chaos mode toggle failed: {chaosError}. Start is blocked until chaos mode matches the engine.
            </div>
          )}

          {/* Reset buttons */}
          <div className="mt-3 flex gap-2 border-t border-[var(--color-card)] pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleResetConfig(false)}
              disabled={resetting}
              className="h-9 border-[#eab308]/50 px-2.5 text-[10px] text-[#eab308] hover:bg-[rgba(234,179,8,0.12)]"
            >
              {resetting ? 'Resetting...' : 'Reset Config'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleResetConfig(true)}
              disabled={resetting}
              className="h-9 border-[var(--color-destructive)]/50 px-2.5 text-[10px] text-[var(--color-destructive)] hover:bg-[rgba(239,68,68,0.12)]"
            >
              Reset Everything
            </Button>
          </div>

          {/* Re-run backtest button when config has autoSelect but hasn't been run this session */}
          {persistedConfig?.autoSelect === true && !backtestRunThisSession && !autoSelectResult && (
            <div className="mt-3 rounded-md border border-[#eab308] bg-[var(--color-card)] p-2">
              <div className="mb-1.5 text-[11px] text-[#eab308]">
                Auto-select backtest hasn't been run since page reload.
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleRerunBacktest}
                disabled={!!autoSelectProgress}
                className="h-10 border-[#eab308]/60 bg-[rgba(234,179,8,0.12)] px-3.5 text-[11px] font-semibold text-[#eab308] hover:bg-[rgba(234,179,8,0.12)]"
              >
                {autoSelectProgress ? 'Running...' : 'Re-run Backtest'}
              </Button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('config')}
              disabled={!!autoSelectProgress}
              className="h-10 px-3.5 text-[11px] text-[var(--color-muted-foreground)]"
            >
              ← Back
            </Button>
            <Button
              type="button"
              onClick={handleStart}
              disabled={starting || !!autoSelectProgress || !!chaosError}
              title={chaosError ? 'Cannot start — chaos mode is in a failed state' : undefined}
              className="h-11 border border-[#22c55e]/50 bg-[rgba(34,197,94,0.12)] px-6 text-xs font-semibold text-[#22c55e] hover:bg-[rgba(34,197,94,0.12)]"
            >
              {starting ? 'Starting...' : (
                <>
                  <Play className="size-3.5 text-[#22c55e]" aria-hidden="true" />
                  Start Bot
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
