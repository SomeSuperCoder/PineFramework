import { useState, useEffect, useMemo, Fragment } from 'react';
import { Play, X } from 'lucide-react';
import { ProgressBar } from '../ProgressBar';
import type { WalletInfo, ConfigValues } from '../../types/bot';
import { TRADABLE_PAIRS, getTokenInfo } from 'pine-framework';
import { AutoSelectGrid } from './AutoSelectGrid';
import { StrategyMultiSelect } from './StrategyMultiSelect';
import { WorldRankingPanel } from './WorldRankingPanel';
import { CapitalAllocationPanel } from './CapitalAllocationPanel';
import { computeAllocation } from '../../utils/portfolio';
import type {
  WizardStep,
  SelectedStrategy,
  WorldRankingEntry,
  AllocationEntry,
  AutoSelectProgressV2,
  AutoSelectResultV2,
} from '../../types/multiWorld';
import { pnlOf } from '../../types/multiWorld';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

  const handleConfigure = async () => {
    setConfiguring(true);
    setError('');
    try {
      const res = await fetch(`${backendUrl}/api/bot/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          strategySource: '',
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
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="text-[11px] text-[var(--color-muted-foreground)]">
            DEX:{' '}
            <Select
              value={dex}
              onValueChange={(v) => setDex(v as 'jupiter-swap' | 'jupiter-ultra')}
            >
              <SelectTrigger
                aria-label="DEX"
                className="ml-1 h-7 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 text-[11px] text-[var(--color-foreground)]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jupiter-swap">Jupiter Swap</SelectItem>
                <SelectItem value="jupiter-ultra">Jupiter Ultra</SelectItem>
              </SelectContent>
            </Select>
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
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger
                aria-label="Timezone"
                className="ml-1 h-7 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 text-[11px] text-[var(--color-foreground)]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_GROUPS.map((group) => {
                  const filtered = timezoneFilter
                    ? group.zones.filter((z) =>
                        z.toLowerCase().includes(timezoneFilter.toLowerCase()),
                      )
                    : group.zones;
                  if (filtered.length === 0) return null;
                  return (
                    <SelectGroup key={group.group}>
                      <SelectLabel>{group.group}</SelectLabel>
                      {filtered.map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {getTimezoneLabel(zone)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </label>
        </div>
        {error && <div className="text-[10px] text-[var(--color-destructive)]">{error}</div>}
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
  autoSelectProgress?: AutoSelectProgressV2 | null;
  autoSelectResult?: AutoSelectResultV2 | null;
  onConfigReset?: () => void;
  onBacktestStarted?: () => void;
  /** Non-null when the last chaos toggle failed — Start is blocked and the error is shown. */
  chaosError?: string | null;
}) {
  // Determine initial step: if config exists AND wallet exists, go to review
  const getInitialStep = (): WizardStep => {
    if (persistedConfig && initialWallet.hasWallet) {
      return 'review';
    }
    return initialWallet.hasWallet ? 'config' : 'wallet';
  };

  const [step, setStep] = useState<WizardStep>(getInitialStep);
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

  // F2 — strategies replace the single strategySource
  const [selectedStrategies, setSelectedStrategies] = useState<SelectedStrategy[]>(() =>
    persistedConfig?.strategySource
      ? [{ id: 'legacy', name: 'Imported strategy', source: persistedConfig.strategySource, isBuiltIn: false }]
      : [],
  );

  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(() => {
    const saved = localStorage.getItem('autoSelectTimeframes');
    return saved ? JSON.parse(saved) : ['5', '15', '60', '240'];
  });
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [backtestRunThisSession, setBacktestRunThisSession] = useState(false);
  const [backtestMode, setBacktestMode] = useState<'auto' | 'manual'>('auto');
  const [manualPair, setManualPair] = useState<{ symbol: string; timeframe: string } | null>(null);

  // F2 — backtest result → ranking / allocation / block gate
  const [blocked, setBlocked] = useState(false);
  const [ranking, setRanking] = useState<WorldRankingEntry[]>([]);
  const [topN, setTopN] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [totalCapital, setTotalCapital] = useState<number>(() => {
    const b = wallet.usdcBalance ?? 0;
    return b > 0 ? Math.round(b * 100) / 100 : 1000;
  });

  // Tag every ranking world with a strategy name for display. Prefer the
  // backend-derived script name (sent on the auto-select complete broadcast),
  // then the locally-selected strategy's friendly name — this guarantees the
  // tag is visible even before a backend restart ships the broadcast
  // enrichment — and finally the strategy id. Auto-select tests a single
  // strategy (selectedStrategies[0]), so a uniform tag is correct.
  const selectedStrategyName = selectedStrategies[0]?.name ?? '';
  const displayRanking = useMemo(() => {
    if (!autoSelectResult) return [];
    return autoSelectResult.ranking.map((w) => ({
      ...w,
      strategyName: w.strategyName || selectedStrategyName || w.strategyId || '',
    }));
  }, [autoSelectResult, selectedStrategyName]);

  // PnL-weighted split across the explicitly-selected worlds (D5)
  const allocation = useMemo<AllocationEntry[]>(() => {
    if (!autoSelectResult) return [];
    const selected = displayRanking.filter((w) => selectedKeys.has(w.worldKey));
    return computeAllocation(selected, totalCapital);
  }, [displayRanking, selectedKeys, totalCapital]);

  const tfLabel = (tf: string) =>
    tf === '5' ? '5m' : tf === '15' ? '15m' : tf === '60' ? '1h' : tf === '240' ? '4h' : tf;

  // When persisted config/wallet data loads after mount (e.g. after bot stops, when
  // LiveDashboard re-fetches wallet status + config), advance to review.
  //   - 'config' → 'review': persisted config arrived after mount
  //   - 'wallet' → 'review': wallet info arrived after mount while the local state
  //     still shows "no wallet" (stale import-wallet step). A user deliberately
  //     viewing an already-imported wallet is left alone.
  useEffect(() => {
    if (!persistedConfig || !initialWallet.hasWallet || step === 'review' || blocked) return;
    if (step === 'config' || (step === 'wallet' && !wallet.hasWallet)) {
      setStep('review');
    }
  }, [persistedConfig, initialWallet.hasWallet, wallet.hasWallet, step, blocked]);

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

  // Route on backtest completion: block on zero positive-PnL, else → ranking.
  useEffect(() => {
    if (step !== 'backtest' || !autoSelectResult) return;
    if (autoSelectResult.blocked || autoSelectResult.positiveWorlds.length === 0) {
      setBlocked(true);
      return;
    }
    const rk: WorldRankingEntry[] = displayRanking.map((w) => ({
      ...w,
      pnlPercent: pnlOf(w.metrics),
      profitFactor: w.metrics.profitFactor,
      sharpeRatio: w.metrics.sharpeRatio,
      selected: false,
    }));
    const positiveKeys = rk.filter((w) => w.pnlPercent > 0).map((w) => w.worldKey);
    const top = autoSelectResult.positiveCount;
    setRanking(rk);
    setTopN(top);
    setSelectedKeys(new Set(positiveKeys.slice(0, top)));
    setBlocked(false);
    setStep('ranking');
  }, [step, autoSelectResult]);

  const buildWorldsPayload = (): Array<Record<string, unknown>> => {
    if (backtestMode === 'manual' && manualPair) {
      const st = selectedStrategies[0];
      return [
        {
          worldKey: `${manualPair.symbol}:${manualPair.timeframe}:${st?.id ?? ''}`,
          strategyId: st?.id ?? '',
          symbol: manualPair.symbol,
          timeframe: manualPair.timeframe,
          source: st?.source,
          isBuiltIn: st?.isBuiltIn,
          allocatedUsdc: totalCapital,
          weight: 1,
        },
      ];
    }
    return allocation.map((a) => ({
      worldKey: a.worldKey,
      strategyId: a.strategyId,
      symbol: a.symbol,
      timeframe: a.timeframe,
      source: a.source,
      isBuiltIn: a.isBuiltIn,
      allocatedUsdc: a.allocatedUsdc,
      weight: a.weight,
    }));
  };

  const handleStart = async () => {
    if (chaosError) {
      // The engine's chaos state is unknown/inconsistent — never start on a lie.
      setStartError('Start blocked: chaos mode could not be updated. Resolve the chaos mode error before starting.');
      return;
    }
    // v2: push the multi-world selection (strategy per world + capital split) so the
    // engine launches the chosen portfolio rather than a single legacy pair.
    try {
      await fetch(`${backendUrl}/api/bot/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dex: configValues?.dex ?? persistedConfig?.dex ?? 'jupiter-swap',
          risk: { maxDailyLoss: configValues?.maxDailyLoss ?? persistedConfig?.risk?.maxDailyLoss ?? 1 },
          timezone: configValues?.timezone ?? detectTimezone(),
          autoSelect: backtestMode === 'auto',
          strategySource: selectedStrategies[0]?.source ?? configValues?.strategySource ?? persistedConfig?.strategySource ?? '',
          worlds: buildWorldsPayload(),
        }),
      });
    } catch {
      // Non-fatal: engine may already hold a compatible config from the config step.
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
    setStep('backtest');
  };

  const STEP_ORDER: WizardStep[] = ['wallet', 'config', 'strategies', 'backtest', 'ranking', 'allocation', 'review'];
  const STEP_LABELS: Array<[WizardStep, string]> = [
    ['wallet', 'Wallet'],
    ['config', 'Config'],
    ['strategies', 'Strategies'],
    ['backtest', 'Backtest'],
    ['ranking', 'Ranking'],
    ['allocation', 'Allocate'],
    ['review', 'Review'],
  ];
  const StepDot = ({ s, label }: { s: WizardStep; label: string }) => {
    const idx = STEP_ORDER.indexOf(s) + 1;
    const active = step === s;
    const done = STEP_ORDER.indexOf(s) < STEP_ORDER.indexOf(step);
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

  const runBacktest = async () => {
    setBlocked(false);
    setRanking([]);
    setSelectedKeys(new Set());
    setBacktestRunThisSession(true);
    try {
      await fetch(`${backendUrl}/api/bot/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeframes: selectedTimeframes,
          strategyIds: selectedStrategies.map((s) => s.id),
        }),
      });
      onBacktestStarted?.();
    } catch (err) {
      console.error('Backtest trigger failed:', err);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Step indicator */}
      <div className="flex items-center border-b border-[var(--color-card)] pb-2">
        {STEP_LABELS.map(([s, label], i) => (
          <Fragment key={s}>
            <StepDot s={s} label={label} />
            {i < STEP_LABELS.length - 1 && (
              <span className="mx-0.5 text-[var(--color-muted-foreground)]">→</span>
            )}
          </Fragment>
        ))}
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
            onConfigured={() => { setStep('strategies'); }}
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

      {/* Step 3: Strategies */}
      {step === 'strategies' && (
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
            Strategies
          </div>
          <StrategyMultiSelect selected={selectedStrategies} onChange={setSelectedStrategies} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('config')}
              className="h-10 px-3.5 text-[11px] text-[var(--color-muted-foreground)]"
            >
              ← Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                // Persist the selected strategy's source so the engine can compile
                // it for the backtest + live run (the new wizard configures the
                // strategy here, not at the Config step).
                try {
                  const res = await fetch(`${backendUrl}/api/bot/configure`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      strategySource: selectedStrategies[0]?.source ?? '',
                      dex: configValues?.dex ?? persistedConfig?.dex ?? 'jupiter-swap',
                      risk: { maxDailyLoss: configValues?.maxDailyLoss ?? persistedConfig?.risk?.maxDailyLoss ?? 1 },
                      timezone: configValues?.timezone ?? detectTimezone(),
                      autoSelect: true,
                    }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setConfigureError(data.error || `Failed to save strategy (HTTP ${res.status})`);
                    return;
                  }
                } catch {
                  setConfigureError('Failed to save strategy — check backend connection');
                  return;
                }
                setStep('backtest');
              }}
              disabled={selectedStrategies.length === 0}
              className="h-11 border-[var(--color-primary)]/50 bg-[rgba(var(--color-primary),0.12)] px-6 text-xs font-semibold text-[var(--color-primary)] hover:bg-[rgba(var(--color-primary),0.12)]"
            >
              Next →
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Backtest */}
      {step === 'backtest' && (
        <div>
          {/* §2 Block gate — zero positive-PnL worlds blocks progression */}
          {blocked && autoSelectResult && (
            <div role="alert" className="mb-3 rounded-md border border-[var(--color-destructive)]/50 bg-[rgba(239,68,68,0.12)] p-3">
              <div className="text-[12px] font-semibold text-[var(--color-destructive)]">⚠ No profitable worlds found</div>
              <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                Every backtested combination finished with non-positive PnL. The bot won't trade a portfolio with no positive expectation.
              </p>
              <Button
                type="button"
                autoFocus
                onClick={() => setStep('strategies')}
                className="mt-2 h-10 border-[var(--color-primary)]/50 bg-[rgba(var(--color-primary),0.12)] px-4 text-xs font-semibold text-[var(--color-primary)] hover:bg-[rgba(var(--color-primary),0.12)]"
              >
                ← Back — pick another strategy
              </Button>
              <p className="mt-1.5 text-[10px] text-[var(--color-muted-foreground)]">
                Adjust your strategy selection or timeframes, then run the backtest again.
              </p>
              <div className="mt-2 opacity-60">
                <AutoSelectGrid
                  statuses={Object.fromEntries(
                    autoSelectResult.ranking.map((r) => [r.worldKey, { phase: 'done', status: 'done' as const }]),
                  )}
                  ranking={displayRanking}
                />
              </div>
            </div>
          )}

          {/* Mode toggle (pre-run only) */}
          {!autoSelectProgress && (
            <div className="mb-3 flex gap-2">
              <Button
                type="button"
                variant={backtestMode === 'auto' ? 'default' : 'outline'}
                onClick={() => setBacktestMode('auto')}
                className="h-10 px-3.5 text-[11px]"
              >
                Auto (backtest-all)
              </Button>
              <Button
                type="button"
                variant={backtestMode === 'manual' ? 'default' : 'outline'}
                onClick={() => setBacktestMode('manual')}
                className="h-10 px-3.5 text-[11px]"
              >
                Manual (single world)
              </Button>
            </div>
          )}

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
                  <Select
                    value={manualPair?.symbol}
                    onValueChange={(v) =>
                      setManualPair((prev) => ({ symbol: v, timeframe: prev?.timeframe ?? '60' }))
                    }
                  >
                    <SelectTrigger
                      aria-label="Pair"
                      className="ml-1 h-7 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 text-[11px] text-[var(--color-foreground)]"
                    >
                      <SelectValue placeholder="Select pair..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TRADABLE_PAIRS.map((pair) => {
                        const info = getTokenInfo(pair);
                        const display = info ? `${info.symbol}/${info.quote}` : pair;
                        return (
                          <SelectItem key={pair} value={pair}>
                            {display}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </label>
                <label className="text-[11px] text-[var(--color-muted-foreground)]">
                  Timeframe:{' '}
                  <Select
                    value={manualPair?.timeframe ?? '60'}
                    onValueChange={(v) =>
                      setManualPair((prev) => ({ symbol: prev?.symbol ?? '', timeframe: v }))
                    }
                  >
                    <SelectTrigger
                      aria-label="Timeframe"
                      className="ml-1 h-7 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 text-[11px] text-[var(--color-foreground)]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1m</SelectItem>
                      <SelectItem value="5">5m</SelectItem>
                      <SelectItem value="15">15m</SelectItem>
                      <SelectItem value="30">30m</SelectItem>
                      <SelectItem value="60">1h</SelectItem>
                      <SelectItem value="240">4h</SelectItem>
                      <SelectItem value="1440">1d</SelectItem>
                    </SelectContent>
                  </Select>
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

              {!autoSelectProgress && (
                <Button
                  type="button"
                  onClick={runBacktest}
                  disabled={selectedStrategies.length === 0}
                  className="mt-2 h-11 border-[var(--color-primary)]/50 bg-[rgba(var(--color-primary),0.12)] px-6 text-xs font-semibold text-[var(--color-primary)] hover:bg-[rgba(var(--color-primary),0.12)]"
                >
                  Run Backtest
                </Button>
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
                  concurrency={autoSelectProgress.concurrency}
                  activeWorlds={autoSelectProgress.activeWorlds}
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
                ranking={displayRanking}
              />
              <div className="mt-2 rounded bg-[rgba(34,197,94,0.12)] px-2 py-1.5">
                <span className="text-[11px] font-semibold text-[#22c55e]">
                  ★ Best: {autoSelectResult.best?.label ?? '—'}
                </span>
                <span className="ml-2 text-[10px] text-[var(--color-muted-foreground)]">
                  PF: {autoSelectResult.best?.metrics.profitFactor?.toFixed(2)}
                  {' '}Sharpe: {autoSelectResult.best?.metrics.sharpeRatio?.toFixed(2)}
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
              onClick={() => setStep('config')}
              disabled={!!autoSelectProgress}
              className="h-10 px-3.5 text-[11px] text-[var(--color-muted-foreground)]"
            >
              ← Back
            </Button>
            {backtestMode === 'auto' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('ranking')}
                disabled={!autoSelectResult || blocked || !!autoSelectProgress}
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
                        strategySource: selectedStrategies[0]?.source ?? configValues?.strategySource ?? persistedConfig?.strategySource ?? '',
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

      {/* Step 5: World Ranking */}
      {step === 'ranking' && (
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">World Ranking</div>
          <WorldRankingPanel
            ranking={ranking}
            positiveCount={ranking.filter((w) => w.pnlPercent > 0).length}
            topN={topN}
            onTopNChange={(n) => {
              setTopN(n);
              const posKeys = ranking.filter((w) => w.pnlPercent > 0).map((w) => w.worldKey);
              setSelectedKeys(new Set(posKeys.slice(0, n)));
            }}
            selectedKeys={selectedKeys}
            onToggleWorld={(k) =>
              setSelectedKeys((prev) => {
                const nw = new Set(prev);
                if (nw.has(k)) nw.delete(k);
                else nw.add(k);
                return nw;
              })
            }
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <Button type="button" variant="outline" onClick={() => setStep('backtest')} className="h-10 px-3.5 text-[11px] text-[var(--color-muted-foreground)]">
              ← Back
            </Button>
            <Button type="button" variant="outline" onClick={() => setStep('allocation')} disabled={selectedKeys.size === 0} className="h-11 border-[var(--color-primary)]/50 bg-[rgba(var(--color-primary),0.12)] px-6 text-xs font-semibold text-[var(--color-primary)] hover:bg-[rgba(var(--color-primary),0.12)]">
              Next →
            </Button>
          </div>
        </div>
      )}

      {/* Step 6: Capital Allocation */}
      {step === 'allocation' && (
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">Capital Allocation</div>
          <CapitalAllocationPanel allocation={allocation} totalCapital={totalCapital} onTotalCapitalChange={setTotalCapital} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <Button type="button" variant="outline" onClick={() => setStep('ranking')} className="h-10 px-3.5 text-[11px] text-[var(--color-muted-foreground)]">
              ← Back
            </Button>
            <Button type="button" variant="outline" onClick={() => setStep('review')} disabled={allocation.length === 0 || !(totalCapital > 0)} className="h-11 border-[#22c55e]/50 bg-[rgba(34,197,94,0.12)] px-6 text-xs font-semibold text-[#22c55e] hover:bg-[rgba(34,197,94,0.12)]">
              Next →
            </Button>
          </div>
        </div>
      )}

      {/* Step 7: Review & Start */}
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
                  <span className="text-[var(--color-muted-foreground)]">Strategies: </span>
                  <span className="text-[var(--color-foreground)]">
                    {selectedStrategies.length > 0 ? selectedStrategies.map((s) => s.name).join(', ') : '(none)'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-muted-foreground)]">DEX: </span>
                  <span className="text-[var(--color-foreground)]">{configValues.dex}</span>
                </div>
                <div>
                  <span className="text-[var(--color-muted-foreground)]">Max Daily Loss: </span>
                  <span className="text-[var(--color-foreground)]">${configValues.maxDailyLoss}</span>
                </div>
                <div>
                  <span className="text-[var(--color-muted-foreground)]">Timezone: </span>
                  <span className="text-[var(--color-foreground)]">{getTimezoneLabel(configValues.timezone)}</span>
                </div>
                <div className="mt-1">
                  <span className="text-[var(--color-muted-foreground)]">Selected Worlds: </span>
                  <ul className="ml-4 list-disc">
                    {backtestMode === 'manual' && manualPair && selectedStrategies[0] ? (
                      <li key="manual">
                        {manualPair.symbol} · {tfLabel(manualPair.timeframe)} · {selectedStrategies[0].name} — ${totalCapital.toFixed(2)}
                      </li>
                    ) : allocation.length > 0 ? (
                      allocation.map((a) => (
                        <li key={a.worldKey}>
                          {a.symbol} · {tfLabel(a.timeframe)} · {a.strategyName ?? a.strategyId} · PnL {a.pnlPercent.toFixed(2)}% · ${a.allocatedUsdc.toFixed(2)}
                        </li>
                      ))
                    ) : (
                      <li className="text-[var(--color-muted-foreground)]">Pending…</li>
                    )}
                  </ul>
                </div>
                <div>
                  <span className="text-[var(--color-muted-foreground)]">Total Capital: </span>
                  <span className="text-[var(--color-foreground)]">${totalCapital.toFixed(2)}</span>
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
              onClick={() => setStep(backtestMode === 'manual' ? 'config' : 'allocation')}
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
