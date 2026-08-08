import { useState, useEffect, useMemo } from 'react';
import { StrategySelector } from '../StrategySelector';
import { ProgressBar } from '../ProgressBar';
import type { BotStateT, WalletInfo, ConfigValues } from '../../types/bot';
import { TRADABLE_PAIRS, getTokenInfo } from 'pine-framework';
import { extractScriptName } from 'pine-framework/utils/script-name';
import { AutoSelectGrid } from './AutoSelectGrid';

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
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
        Wallet {wallet.hasWallet ? '✓ Imported' : '— Not Imported'}
      </div>
      {wallet.hasWallet ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#4caf50', fontSize: 11, fontFamily: 'monospace' }}>
            {wallet.publicKey?.slice(0, 8)}...{wallet.publicKey?.slice(-4)}
          </span>
          <span style={{ color: '#888', fontSize: 11 }}>
            {importedBalanceLoading ? (
              'Loading balance...'
            ) : importedBalance !== null ? (
              <span style={{ color: '#64b5f6' }}>
                USDC: {importedBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            ) : null}
          </span>
          <button
            onClick={handleRemove}
            disabled={importing}
            style={{
              padding: '3px 8px', background: '#2a1520', color: '#e94560',
              border: '1px solid #e94560', borderRadius: 3, cursor: 'pointer',
              fontSize: 10,
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
            style={{
              width: '100%', background: '#111128', color: '#e0e0e0',
              border: '1px solid #333', borderRadius: 4, padding: '6px 8px',
              fontSize: 11, fontFamily: 'monospace', resize: 'vertical',
            }}
          />

          {/* Balance preview — shown after valid seed phrase */}
          {(previewLoading || previewPublicKey) && (
            <div style={{
              padding: '8px 10px', background: '#0d1a10', borderRadius: 4,
              border: '1px solid #333',
            }}>
              {previewLoading ? (
                <span style={{ color: '#888', fontSize: 11 }}>Checking wallet...</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ color: '#4caf50', fontSize: 11, fontFamily: 'monospace' }}>
                    {previewPublicKey?.slice(0, 8)}...{previewPublicKey?.slice(-4)}
                  </span>
                  <span style={{ color: '#64b5f6', fontSize: 11 }}>
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
            style={{
              width: '100%', background: '#111128', color: '#e0e0e0',
              border: '1px solid #333', borderRadius: 4, padding: '6px 8px',
              fontSize: 11, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleImport}
              disabled={importing || !seedPhrase.trim() || !password}
              style={{
                padding: '4px 12px', background: '#1a3328', color: '#4caf50',
                border: '1px solid #4caf50', borderRadius: 3, cursor: importing ? 'wait' : 'pointer',
                fontSize: 10, fontWeight: 600, opacity: importing || !seedPhrase.trim() || !password ? 0.6 : 1,
              }}
            >
              {importing ? 'Importing...' : 'Import Wallet'}
            </button>
          </div>
          {error && <div style={{ color: '#e94560', fontSize: 10 }}>{error}</div>}
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
      <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
        Configuration
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StrategySelector
          backendUrl={backendUrl}
          value={strategySource}
          onChange={(src, _name, _id) => { setStrategySource(src); }}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ color: '#888', fontSize: 11 }}>
            DEX:{' '}
            <select
              value={dex}
              onChange={(e) => setDex(e.target.value as 'jupiter-swap' | 'jupiter-ultra')}
              style={{
                background: '#111128', color: '#e0e0e0', border: '1px solid #333',
                borderRadius: 3, padding: '2px 6px', fontSize: 11, marginLeft: 4,
              }}
            >
              <option value="jupiter-swap">Jupiter Swap</option>
              <option value="jupiter-ultra">Jupiter Ultra</option>
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ color: '#888', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={manualOverride}
                onChange={(e) => setManualOverride(e.target.checked)}
                style={{ accentColor: '#64b5f6' }}
              />
              Manual Override
            </label>
            {manualOverride ? (
              <label style={{ color: '#888', fontSize: 11 }}>
                Max Daily Loss ($):{' '}
                <input
                  type="number"
                  value={manualMaxDailyLoss}
                  onChange={(e) => setManualMaxDailyLoss(e.target.value)}
                  min="0"
                  step="0.01"
                  style={{
                    width: 70, background: '#111128', color: '#e0e0e0',
                    border: '1px solid #333', borderRadius: 3, padding: '2px 6px',
                    fontSize: 11, marginLeft: 4,
                  }}
                />
              </label>
            ) : (
              <span style={{ color: '#888', fontSize: 11 }}>
                Max Daily Loss:{' '}
                <span style={{ color: '#64b5f6', fontWeight: 600 }}>
                  ${maxDailyLoss.toFixed(2)}
                </span>
                <span style={{ color: '#666', fontSize: 10, marginLeft: 4 }}>
                  (10% × ${usdcBalance?.toFixed(2) ?? '0.00'})
                </span>
              </span>
            )}
          </div>
          <label style={{ color: '#888', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            Timezone:{' '}
            <input
              type="text"
              placeholder="Filter..."
              value={timezoneFilter}
              onChange={(e) => setTimezoneFilter(e.target.value)}
              style={{
                width: 80, background: '#111128', color: '#e0e0e0',
                border: '1px solid #333', borderRadius: 3, padding: '2px 6px',
                fontSize: 10, marginLeft: 4,
              }}
            />
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              style={{
                background: '#111128', color: '#e0e0e0',
                border: '1px solid #333', borderRadius: 3, padding: '2px 6px',
                fontSize: 11, marginLeft: 4,
              }}
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
        {error && <div style={{ color: '#e94560', fontSize: 10 }}>{error}</div>}
        {compatibilityWarnings.length > 0 && (
          <div style={{
            background: '#2a2010', border: '1px solid #ff9800', borderRadius: 4,
            padding: '6px 10px', marginTop: 4,
          }}>
            <div style={{ color: '#ff9800', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
              ⚠ Live Trading Compatibility Notes
            </div>
            {compatibilityWarnings.map((w, i) => (
              <div key={i} style={{ color: '#e0a040', fontSize: 10 }}>{w}</div>
            ))}
          </div>
        )}
        <button
          onClick={handleConfigure}
          disabled={configuring}
          style={{
            padding: '6px 16px', background: '#1a3a6a', color: '#64b5f6',
            border: '1px solid #64b5f6', borderRadius: 4, cursor: configuring ? 'wait' : 'pointer',
            fontSize: 11, fontWeight: 600, alignSelf: 'flex-start',
            opacity: configuring ? 0.7 : 1,
          }}
        >
          {configuring ? 'Configuring...' : 'Apply Configuration'}
        </button>
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
    <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
      <button
        onClick={isStopped && dashboardOpen ? () => sendCommand('start') : onToggleDashboard}
        disabled={loading}
        title={isStopped && dashboardOpen ? 'Start Live Trading Bot' : dashboardOpen ? 'Hide Dashboard' : 'Show Bot Dashboard'}
        style={{
          padding: '5px 10px',
          background: dashboardOpen ? '#1a3328' : '#111128',
          color: dashboardOpen ? '#4caf50' : '#888',
          border: `1px solid ${dashboardOpen ? '#4caf50' : '#333'}`,
          borderRadius: '4px',
          cursor: loading ? 'wait' : 'pointer',
          fontSize: '11px',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          opacity: loading ? 0.7 : 1,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <polygon points="2,0 9,5 2,10" />
        </svg>
        Bot Dashboard
      </button>
      {isRunning && (
        <>
          <button
            onClick={() => sendCommand('stop')}
            disabled={loading}
            title="Stop Bot"
            style={{
              padding: '5px 10px',
              background: '#e94560',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="1" y="1" width="8" height="8" rx="1" />
            </svg>
            Stop Bot
          </button>
          <button
            onClick={() => sendCommand('emergency-stop')}
            disabled={loading}
            title="Emergency Stop"
            style={{
              padding: '5px 8px',
              background: '#ff1744',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              opacity: loading ? 0.7 : 1,
            }}
          >
            ⚠
          </button>
        </>
      )}
      {isError && (
        <button
          onClick={() => sendCommand('reset')}
          disabled={loading}
          title="Reset Bot"
          style={{
            padding: '5px 10px',
            background: '#2a1520',
            color: '#ff9800',
            border: '1px solid #ff9800',
            borderRadius: '4px',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: '11px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          ⟳ Reset
        </button>
      )}
      {transitioning && (
        <span style={{ color: '#ff9800', fontSize: '11px', fontStyle: 'italic' }}>{botState}...</span>
      )}
      {!connected && (botState !== 'Idle' || dashboardOpen) && (
        <span style={{ color: '#ff9800', fontSize: '10px', marginLeft: '2px' }} title="Reconnecting...">
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
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          color: active ? '#fff' : done ? '#4caf50' : '#555',
          cursor: done ? 'pointer' : 'default',
          fontSize: 11, fontWeight: active ? 600 : 400,
          padding: '4px 8px',
        }}
      >
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: active ? '#1a3a6a' : done ? '#1a3328' : '#222',
          border: `1px solid ${active ? '#64b5f6' : done ? '#4caf50' : '#333'}`,
          fontSize: 10, fontWeight: 700, color: active ? '#64b5f6' : done ? '#4caf50' : '#555',
        }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a2e', paddingBottom: 8 }}>
        <StepDot s="wallet" label="Wallet" />
        <span style={{ color: '#333', margin: '0 2px' }}>→</span>
        <StepDot s="config" label="Config" />
        <span style={{ color: '#333', margin: '0 2px' }}>→</span>
        <StepDot s="backtest-choice" label="Backtest" />
        <span style={{ color: '#333', margin: '0 2px' }}>→</span>
        <StepDot s="review" label="Review" />
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          padding: '4px 10px', background: 'transparent', color: '#888',
          border: 'none', cursor: 'pointer', fontSize: 14,
        }}>
          ✕
        </button>
      </div>

      {/* Step 1: Wallet */}
      {step === 'wallet' && (
        <div>
          <WalletImportPanel backendUrl={backendUrl} wallet={wallet} onWalletChange={setWallet} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              onClick={() => setStep('config')}
              disabled={!wallet.hasWallet}
              style={{
                padding: '6px 20px', background: wallet.hasWallet ? '#1a3a6a' : '#111',
                color: wallet.hasWallet ? '#64b5f6' : '#555',
                border: `1px solid ${wallet.hasWallet ? '#64b5f6' : '#333'}`,
                borderRadius: 4, cursor: wallet.hasWallet ? 'pointer' : 'default',
                fontSize: 11, fontWeight: 600,
              }}
            >
              Next →
            </button>
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
            <button
              onClick={() => setStep('wallet')}
              style={{
                padding: '6px 14px', background: 'transparent', color: '#888',
                border: '1px solid #333', borderRadius: 4, cursor: 'pointer',
                fontSize: 11,
              }}
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Backtest Choice */}
      {step === 'backtest-choice' && (
        <div>
          <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
            Backtest Selection
          </div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
            How would you like to select your trading pair?
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => handleBacktestChoice('auto')}
              style={{
                padding: '12px 16px', background: '#1a3a6a', color: '#64b5f6',
                border: '1px solid #64b5f6', borderRadius: 6, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, textAlign: 'left',
              }}
            >
              <div style={{ marginBottom: 4 }}>🚀 Run Auto-Select Backtest</div>
              <div style={{ fontSize: 10, color: '#888', fontWeight: 400 }}>
                Automatically evaluate multiple pairs and timeframes to find the best performer
              </div>
            </button>
            <button
              onClick={() => handleBacktestChoice('manual')}
              style={{
                padding: '12px 16px', background: '#2a2010', color: '#ff9800',
                border: '1px solid #ff9800', borderRadius: 6, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, textAlign: 'left',
              }}
            >
              <div style={{ marginBottom: 4 }}>✋ Manually Select Pair & Timeframe</div>
              <div style={{ fontSize: 10, color: '#888', fontWeight: 400 }}>
                Choose your own pair and timeframe — you take full responsibility for the selection
              </div>
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 12 }}>
            <button
              onClick={() => setStep('config')}
              style={{
                padding: '6px 14px', background: 'transparent', color: '#888',
                border: '1px solid #333', borderRadius: 4, cursor: 'pointer',
                fontSize: 11,
              }}
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Backtest */}
      {step === 'backtest' && (
        <div>
          {/* Manual Selection Mode */}
          {backtestMode === 'manual' && (
            <div style={{
              padding: 12, background: '#2a2010', borderRadius: 6,
              border: '1px solid #ff9800', marginBottom: 12,
            }}>
              <div style={{ color: '#ff9800', fontWeight: 600, fontSize: 11, marginBottom: 4 }}>
                ⚠ Manual Selection Mode
              </div>
              <div style={{ fontSize: 10, color: '#e0a040', marginBottom: 8 }}>
                Auto-select was skipped. You are fully responsible for your pair/timeframe choice.
                The bot will only trade the pair you select — no automated evaluation was performed.
              </div>
               <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ color: '#888', fontSize: 11 }}>
                  Pair:{' '}
                  <select
                    value={manualPair?.symbol ?? ''}
                    onChange={(e) => setManualPair(prev => ({
                      symbol: e.target.value,
                      timeframe: prev?.timeframe ?? '60',
                    }))}
                    style={{
                      background: '#111128', color: '#e0e0e0', border: '1px solid #333',
                      borderRadius: 3, padding: '2px 6px', fontSize: 11, marginLeft: 4,
                    }}
                  >
                    <option value="">Select pair...</option>
                    {TRADABLE_PAIRS.map(pair => {
                      const info = getTokenInfo(pair);
                      const display = info ? `${info.symbol}/${info.quote}` : pair;
                      return <option key={pair} value={pair}>{display}</option>;
                    })}
                  </select>
                </label>
                <label style={{ color: '#888', fontSize: 11 }}>
                  Timeframe:{' '}
                  <select
                    value={manualPair?.timeframe ?? '60'}
                    onChange={(e) => setManualPair(prev => ({
                      symbol: prev?.symbol ?? '',
                      timeframe: e.target.value,
                    }))}
                    style={{
                      background: '#111128', color: '#e0e0e0', border: '1px solid #333',
                      borderRadius: 3, padding: '2px 6px', fontSize: 11, marginLeft: 4,
                    }}
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
                <div style={{ color: '#e94560', fontSize: 10, marginTop: 8 }}>
                  Both pair and timeframe are required
                </div>
              )}
            </div>
          )}

          {/* Auto-Select Mode */}
          {backtestMode === 'auto' && (
            <>
              <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
                Auto-Select Backtest
              </div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                Evaluating candidate pairs sequentially...
              </div>

              {/* Timeframe Selection */}
              {!autoSelectProgress && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>Select Timeframes:</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['5', '15', '60', '240'].map(tf => (
                      <label key={tf} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
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
                          style={{ accentColor: '#64b5f6' }}
                        />
                        <span style={{ fontSize: 11, color: '#ccc' }}>
                          {tf === '5' ? '5m' : tf === '15' ? '15m' : tf === '60' ? '1h' : '4h'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-Select Progress */}
              {autoSelectProgress && (
            <div style={{
              padding: 12, background: '#111128', borderRadius: 6,
              border: '1px solid #ff9800',
            }}>
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
            <div style={{
              marginTop: 12, padding: 12, background: '#0d1a10', borderRadius: 6,
              border: '1px solid #4caf50',
            }}>
              <div style={{ color: '#4caf50', fontWeight: 600, fontSize: 11, marginBottom: 4 }}>
                Auto-Select Complete
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
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
              <div style={{ marginTop: 8, padding: '6px 8px', background: '#1a3328', borderRadius: 3 }}>
                <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 11 }}>
                  ★ Best: {autoSelectResult.best.label}
                </span>
                <span style={{ color: '#888', fontSize: 10, marginLeft: 8 }}>
                  PF: {autoSelectResult.best.metrics.profitFactor?.toFixed(2)}
                  {' '}Sharpe: {autoSelectResult.best.metrics.sharpeRatio?.toFixed(2)}
                </span>
              </div>
            </div>
          )}
            </>
          )}

          {configureError && (
            <div style={{ color: '#e94560', fontSize: 11, marginTop: 8 }}>
              ⚠ {configureError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button
              onClick={() => backtestMode === 'manual' ? setStep('backtest-choice') : setStep('config')}
              disabled={!!autoSelectProgress}
              style={{
                padding: '6px 14px', background: 'transparent', color: '#888',
                border: '1px solid #333', borderRadius: 4, cursor: autoSelectProgress ? 'default' : 'pointer',
                fontSize: 11,
              }}
            >
              ← Back
            </button>
            {backtestMode === 'auto' ? (
              <button
                onClick={() => setStep('review')}
                disabled={!autoSelectResult}
                style={{
                  padding: '8px 24px', background: autoSelectResult ? '#1a3328' : '#222',
                  color: autoSelectResult ? '#4caf50' : '#555', border: `1px solid ${autoSelectResult ? '#4caf50' : '#333'}`,
                  borderRadius: 4, cursor: autoSelectResult ? 'pointer' : 'default',
                  fontSize: 12, fontWeight: 700,
                }}
              >
                Next →
              </button>
            ) : (
              <button
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
                style={{
                  padding: '8px 24px', background: manualPair?.symbol ? '#1a3328' : '#222',
                  color: manualPair?.symbol ? '#4caf50' : '#555', border: `1px solid ${manualPair?.symbol ? '#4caf50' : '#333'}`,
                  borderRadius: 4, cursor: manualPair?.symbol ? 'pointer' : 'default',
                  fontSize: 12, fontWeight: 700,
                }}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Review & Start */}
      {step === 'review' && (
        <div>
          <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
            Review & Start
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
            <div>
              <span style={{ color: '#888' }}>Wallet: </span>
              <span style={{ color: '#4caf50' }}>
                {wallet.publicKey ? `${wallet.publicKey.slice(0, 8)}...${wallet.publicKey.slice(-4)}` : '(none)'}
              </span>
            </div>
            {configValues && (
              <>
                <div>
                  <span style={{ color: '#888' }}>Strategy: </span>
                  <span style={{ color: '#e0e0e0' }}>
                    {extractScriptName(configValues.strategySource) ?? '(unnamed strategy)'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>DEX: </span>
                  <span style={{ color: '#e0e0e0' }}>{configValues.dex}</span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Selected Pair: </span>
                  <span style={{ color: '#4caf50', fontWeight: 600 }}>
                    {backtestMode === 'manual' && manualPair
                      ? `${manualPair.symbol} (${manualPair.timeframe === '5' ? '5m' : manualPair.timeframe === '15' ? '15m' : manualPair.timeframe === '60' ? '1h' : '4h'})`
                      : autoSelectResult?.best?.label ?? (persistedConfig?.pairs?.[0] ? `${persistedConfig.pairs[0].symbol} (${persistedConfig.pairs[0].timeframe})` : 'Pending...')}
                  </span>
                </div>
                {backtestMode === 'manual' && (
                  <div style={{ fontSize: 10, color: '#ff9800', marginLeft: 60 }}>
                    Manual selection — no auto-select evaluation performed
                  </div>
                )}
                {autoSelectResult && backtestMode === 'auto' && (
                  <div style={{ fontSize: 10, color: '#888', marginLeft: 60 }}>
                    PF: {autoSelectResult.best.metrics.profitFactor?.toFixed(2)}
                    {' '}Sharpe: {autoSelectResult.best.metrics.sharpeRatio?.toFixed(2)}
                  </div>
                )}
                <div>
                  <span style={{ color: '#888' }}>Max Daily Loss: </span>
                  <span style={{ color: '#e0e0e0' }}>${configValues.maxDailyLoss}</span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Timezone: </span>
                  <span style={{ color: '#e0e0e0' }}>{getTimezoneLabel(configValues.timezone)}</span>
                </div>
              </>
            )}
          </div>

          {startError && (
            <div style={{ color: '#e94560', fontSize: 11, marginTop: 8 }}>{startError}</div>
          )}
          {resetError && (
            <div style={{ color: '#e94560', fontSize: 11, marginTop: 8 }}>{resetError}</div>
          )}
          {chaosError && (
            <div style={{ color: '#e94560', fontSize: 11, marginTop: 8 }}>
              ⚠ Chaos mode toggle failed: {chaosError}. Start is blocked until chaos mode matches the engine.
            </div>
          )}

          {/* Reset buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid #1a1a2e', paddingTop: 12 }}>
            <button
              onClick={() => handleResetConfig(false)}
              disabled={resetting}
              style={{
                padding: '4px 10px', background: 'transparent', color: '#ff9800',
                border: '1px solid #ff9800', borderRadius: 4, cursor: resetting ? 'wait' : 'pointer',
                fontSize: 10,
              }}
            >
              {resetting ? 'Resetting...' : 'Reset Config'}
            </button>
            <button
              onClick={() => handleResetConfig(true)}
              disabled={resetting}
              style={{
                padding: '4px 10px', background: 'transparent', color: '#e94560',
                border: '1px solid #e94560', borderRadius: 4, cursor: resetting ? 'wait' : 'pointer',
                fontSize: 10,
              }}
            >
              Reset Everything
            </button>
          </div>

          {/* Re-run backtest button when config has autoSelect but hasn't been run this session */}
          {persistedConfig?.autoSelect === true && !backtestRunThisSession && !autoSelectResult && (
            <div style={{ 
              padding: '8px 12px', background: '#1a1a2e', borderRadius: 6, 
              border: '1px solid #ff9800', marginTop: 12 
            }}>
              <div style={{ color: '#ff9800', fontSize: 11, marginBottom: 6 }}>
                Auto-select backtest hasn't been run since page reload.
              </div>
              <button
                onClick={handleRerunBacktest}
                disabled={!!autoSelectProgress}
                style={{
                  padding: '6px 14px', background: '#2a2010', color: '#ff9800',
                  border: '1px solid #ff9800', borderRadius: 4, 
                  cursor: autoSelectProgress ? 'wait' : 'pointer',
                  fontSize: 11, fontWeight: 600,
                }}
              >
                {autoSelectProgress ? 'Running...' : 'Re-run Backtest'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button
              onClick={() => setStep('config')}
              disabled={!!autoSelectProgress}
              style={{
                padding: '6px 14px', background: 'transparent', color: '#888',
                border: '1px solid #333', borderRadius: 4, cursor: autoSelectProgress ? 'default' : 'pointer',
                fontSize: 11,
              }}
            >
              ← Back
            </button>
            <button
              onClick={handleStart}
              disabled={starting || !!autoSelectProgress || !!chaosError}
              title={chaosError ? 'Cannot start — chaos mode is in a failed state' : undefined}
              style={{
                padding: '8px 24px', background: starting ? '#1a3328' : '#1a3328',
                color: '#4caf50', border: '1px solid #4caf50', borderRadius: 4,
                cursor: (starting || !!autoSelectProgress) ? 'wait' : chaosError ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: (starting || !!autoSelectProgress || !!chaosError) ? 0.7 : 1,
              }}
            >
              {starting ? 'Starting...' : (
                <>
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="#4caf50">
                    <polygon points="2,0 9,5 2,10" />
                  </svg>
                  Start Bot
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
