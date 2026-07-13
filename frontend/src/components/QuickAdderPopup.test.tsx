import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickAdderPopup } from './QuickAdderPopup';

const mockScripts = [
  { id: '1', name: 'Alpha Strategy', source: '//@version=6\nstrategy("Alpha")', scriptType: 'strategy', createdAt: 1000, updatedAt: 1000 },
  { id: '2', name: 'Beta Indicator', source: '//@version=6\nindicator("Beta")', scriptType: 'indicator', createdAt: 2000, updatedAt: 2000 },
];

const mockBuiltInScripts = [
  { id: 'bi-1', name: 'RSI Built-In', source: '//@version=6\nindicator("RSI")', type: 'indicator' },
  { id: 'bi-2', name: 'MACD Built-In', source: '//@version=6\nindicator("MACD")', type: 'strategy' },
];

function mockFetchSuccess() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr === '/api/scripts') {
      return new Response(JSON.stringify({ scripts: mockScripts }), { status: 200 });
    }
    if (urlStr === '/api/scripts/built-in') {
      return new Response(JSON.stringify({ scripts: mockBuiltInScripts }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
  );
});

describe('QuickAdderPopup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders nothing when closed', () => {
      const { container } = render(<QuickAdderPopup isOpen={false} onClose={() => {}} onAdd={() => {}} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders popup when open', async () => {
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search indicators/i)).toBeInTheDocument();
      });
    });

    it('auto-focuses search input on open', async () => {
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search indicators/i)).toHaveFocus();
      });
    });

    it('shows loading state while fetching', async () => {
      let resolveFetch: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => fetchPromise.then(() => new Response(JSON.stringify({ scripts: [] }), { status: 200 })));
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      expect(screen.getByText(/Loading scripts/i)).toBeInTheDocument();
      resolveFetch!(undefined);
    });
  });

  describe('script list', () => {
    it('fetches and displays merged user and built-in scripts', async () => {
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
        expect(screen.getByText('Beta Indicator')).toBeInTheDocument();
        expect(screen.getByText('RSI Built-In')).toBeInTheDocument();
        expect(screen.getByText('MACD Built-In')).toBeInTheDocument();
      });
    });

    it('displays IND badge for indicator scripts', async () => {
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Beta Indicator')).toBeInTheDocument();
      });
      const indBadges = screen.getAllByText('IND');
      expect(indBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('displays STG badge for strategy scripts', async () => {
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      const stgBadges = screen.getAllByText('STG');
      expect(stgBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('displays Built-In badge for built-in scripts', async () => {
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('RSI Built-In')).toBeInTheDocument();
      });
      const builtInBadges = screen.getAllByText('Built-In');
      expect(builtInBadges.length).toBe(2);
    });
  });

  describe('search filtering', () => {
    it('filters scripts by name as user types', async () => {
      const user = userEvent.setup();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      const input = screen.getByPlaceholderText(/Search indicators/i);
      await user.type(input, 'Alpha');
      expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      expect(screen.queryByText('Beta Indicator')).not.toBeInTheDocument();
      expect(screen.queryByText('RSI Built-In')).not.toBeInTheDocument();
    });

    it('shows all scripts when search is cleared', async () => {
      const user = userEvent.setup();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      const input = screen.getByPlaceholderText(/Search indicators/i);
      await user.type(input, 'Alpha');
      await user.clear(input);
      expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      expect(screen.getByText('Beta Indicator')).toBeInTheDocument();
      expect(screen.getByText('RSI Built-In')).toBeInTheDocument();
    });

    it('shows empty message when no scripts match search', async () => {
      const user = userEvent.setup();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      const input = screen.getByPlaceholderText(/Search indicators/i);
      await user.type(input, 'zzzznonexistent');
      expect(screen.getByText(/No scripts found/i)).toBeInTheDocument();
    });
  });

  describe('add script', () => {
    it('calls onAdd with id and source when clicking a script', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={onAdd} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Alpha Strategy'));
      expect(onAdd).toHaveBeenCalledWith('1', mockScripts[0].source);
    });

    it('calls onAdd when pressing Enter on highlighted script', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={onAdd} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      const input = screen.getByPlaceholderText(/Search indicators/i);
      await user.keyboard('{Enter}');
      expect(onAdd).toHaveBeenCalledWith('1', mockScripts[0].source);
    });

    it('stays open after adding a script', async () => {
      const user = userEvent.setup();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Alpha Strategy'));
      expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
    });
  });

  describe('close behavior', () => {
    it('calls onClose when clicking backdrop', async () => {
      const onClose = vi.fn();
      mockFetchSuccess();
      const { container } = render(<QuickAdderPopup isOpen={true} onClose={onClose} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      const overlay = container.querySelector('.quick-adder-overlay')!;
      await userEvent.click(overlay);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when clicking X button', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={onClose} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      await user.click(screen.getByText('×'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when pressing Escape', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={onClose} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not close when clicking inside the modal', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={onClose} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Alpha Strategy'));
      // onAdd was called but onClose was not
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('keyboard navigation', () => {
    it('highlights next item on ArrowDown', async () => {
      const user = userEvent.setup();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      const input = screen.getByPlaceholderText(/Search indicators/i);
      await user.type(input, '{ArrowDown}');
      // Second item should be highlighted (index 1)
      const items = document.querySelectorAll('.quick-adder-item');
      expect(items[1]).toHaveClass('highlighted');
    });

    it('highlights previous item on ArrowUp', async () => {
      const user = userEvent.setup();
      mockFetchSuccess();
      render(<QuickAdderPopup isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      const input = screen.getByPlaceholderText(/Search indicators/i);
      await user.type(input, '{ArrowDown}{ArrowUp}');
      const items = document.querySelectorAll('.quick-adder-item');
      expect(items[0]).toHaveClass('highlighted');
    });
  });
});
