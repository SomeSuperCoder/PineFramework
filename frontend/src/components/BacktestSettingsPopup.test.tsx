import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BacktestSettingsPopup } from './BacktestSettingsPopup';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onRun: vi.fn(),
  scriptSource: '//@version=6\nstrategy("Test", commission_value=0.1, commission_type=strategy.percent)',
  timeframe: '60',
};

const storage = new Map<string, string>();
const mockStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
  get length() { return storage.size; },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
};

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });
});

function selectMethod(container: HTMLElement, value: string) {
  const select = container.querySelector('select') as HTMLSelectElement;
  fireEvent.change(select, { target: { value } });
}

describe('BacktestSettingsPopup', () => {
  describe('commission method dropdown', () => {
    it('should render commission method dropdown', () => {
      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      expect(screen.getByText('Commission Method')).toBeDefined();
      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select).toBeDefined();
    });

    it('should render all commission method options', () => {
      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      const select = container.querySelector('select') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.text);
      expect(options).toContain('Jupiter Ultra');
      expect(options).toContain('Jupiter (Basic Swap)');
      expect(options).toContain('Legacy (from strategy)');
    });

    it('should default to legacy when no saved settings', () => {
      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select.value).toBe('');
    });

    it('should restore saved method from localStorage (backward compat with rate)', () => {
      localStorage.setItem('pine-backtest-settings', JSON.stringify({
        initialCapital: 10000,
        commission: 0,
        daysBack: 30,
        dateRangeMode: 'days_back',
        startDate: '',
        endDate: '',
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { rate: 0.001 },
      }));

      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select.value).toBe('jupiter_ultra');
    });

    it('should restore saved method with pairCategory from localStorage', () => {
      localStorage.setItem('pine-backtest-settings', JSON.stringify({
        initialCapital: 10000,
        commission: 0,
        daysBack: 30,
        dateRangeMode: 'days_back',
        startDate: '',
        endDate: '',
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { pairCategory: 'sol_stable' },
      }));

      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select.value).toBe('jupiter_ultra');
    });
  });

  describe('method-specific settings fields', () => {
    it('should show auto-detect info for jupiter_ultra method', () => {
      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      selectMethod(container, 'jupiter_ultra');

      expect(screen.getByText('Default fee tier: 10 bps. Set a symbol to enable auto-detection.')).toBeDefined();
    });

    it('should show auto-detected tier when symbol is provided', () => {
      const { container } = render(<BacktestSettingsPopup {...defaultProps} symbol="SOLUSDT" />);
      selectMethod(container, 'jupiter_ultra');

      expect(screen.getByText(/Auto-detected:/)).toBeDefined();
      expect(screen.getByText(/SOL ↔ Stable/)).toBeDefined();
      expect(screen.getByText(/SOLUSDT/)).toBeDefined();
    });

    it('should show custom rate input when override checkbox is checked', async () => {
      const user = userEvent.setup();
      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      selectMethod(container, 'jupiter_ultra');

      const checkbox = screen.getByText('Override with custom rate').previousElementSibling as HTMLInputElement;
      await user.click(checkbox);

      expect(screen.getByText('Custom Rate')).toBeDefined();
    });

    it('should show realistic fee model info for jupiter_manual method', () => {
      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      selectMethod(container, 'jupiter_manual');

      expect(screen.getByText(/Realistic fee model/)).toBeDefined();
    });

    it('should show legacy commission value when no method selected', () => {
      render(<BacktestSettingsPopup {...defaultProps} />);
      expect(screen.getByText('Legacy Commission Value')).toBeDefined();
    });

    it('should hide legacy commission when method is selected', () => {
      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      selectMethod(container, 'jupiter_ultra');

      expect(screen.queryByText('Legacy Commission Value')).toBeNull();
    });
  });

  describe('persistence', () => {
    it('should update selected method in the dropdown', () => {
      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      selectMethod(container, 'jupiter_ultra');

      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select.value).toBe('jupiter_ultra');
    });

    it('should include method in config when Run is clicked', () => {
      const { container } = render(<BacktestSettingsPopup {...defaultProps} />);
      selectMethod(container, 'jupiter_ultra');

      // Fire the Run button
      const runButton = screen.getByText('Run Backtest');
      fireEvent.click(runButton);
    });
  });

  describe('buildConfig output', () => {
    it('should include commissionMethod in config when selected', async () => {
      const user = userEvent.setup();
      const onRun = vi.fn();
      const { container } = render(<BacktestSettingsPopup {...defaultProps} onRun={onRun} />);
      selectMethod(container, 'jupiter_ultra');

      const runButton = screen.getByText('Run Backtest');
      await user.click(runButton);

      expect(onRun).toHaveBeenCalledTimes(1);
      const config = onRun.mock.calls[0][0];
      expect(config.commissionMethod).toBe('jupiter_ultra');
      // Default jupiter_ultra settings include DEX fee + SOL price
      expect(config.commissionMethodSettings).toEqual(expect.objectContaining({ dexFeeBps: 25, solPriceUsd: 150 }));
    });

    it('should not include commissionMethod when legacy is selected', async () => {
      const user = userEvent.setup();
      const onRun = vi.fn();
      render(<BacktestSettingsPopup {...defaultProps} onRun={onRun} />);

      const runButton = screen.getByText('Run Backtest');
      await user.click(runButton);

      expect(onRun).toHaveBeenCalledTimes(1);
      const config = onRun.mock.calls[0][0];
      expect(config.commissionMethod).toBeUndefined();
    });
  });
});
