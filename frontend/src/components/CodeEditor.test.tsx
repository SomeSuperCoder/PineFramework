import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeEditor, DEFAULT_CODE } from './CodeEditor';

const mockScripts = [
  { id: '1', name: 'Alpha Strategy', source: '//@version=6\nstrategy("Alpha")\nplot(close)', scriptType: 'strategy', createdAt: 1000, updatedAt: 1000 },
  { id: '2', name: 'Beta Indicator', source: '//@version=6\nindicator("Beta")\nplot(close)', scriptType: 'indicator', createdAt: 2000, updatedAt: 2000 },
];

interface QueueItem {
  url: string | RegExp;
  response: unknown;
  status?: number;
}

function mockFetchQueue(queue: QueueItem[]) {
  let index = 0;
  vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const item = queue[index];
    if (!item) {
      return new Response('{}', { status: 200 });
    }
    const match = typeof item.url === 'string' ? urlStr === item.url : item.url.test(urlStr);
    if (match) {
      index++;
      return new Response(JSON.stringify(item.response), { status: item.status ?? 200 });
    }
    return new Response('{}', { status: 200 });
  });
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
  );
});

describe('CodeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic rendering', () => {
    it('renders nothing when closed', () => {
      const { container } = render(<CodeEditor isOpen={false} onClose={() => {}} onAdd={() => {}} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders editor when open', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [mockScripts[1]], activeScriptId: null } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/Pine Script Editor/i)).toBeInTheDocument();
      });
    });

    it('shows empty state when no scripts exist', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [], activeScriptId: null } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/No scripts yet/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Create Your First Script/i)).toBeInTheDocument();
    });

    it('shows loading state while fetching', async () => {
      let resolveFetch: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
      vi.mocked(fetch).mockImplementation(() => fetchPromise.then(() => new Response(JSON.stringify({scripts: []}), { status: 200 })));

      render(<CodeEditor isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      expect(screen.getByText(/Loading scripts/i)).toBeInTheDocument();
      resolveFetch!(undefined);
    });
  });

  describe('script list and selection', () => {
    it('fetches scripts and renders dropdown on open', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: mockScripts, activeScriptId: null } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
        expect(screen.getByText('Beta Indicator')).toBeInTheDocument();
      });
    });

    it('loads first script on open', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: mockScripts, activeScriptId: null } },
        { url: '/api/scripts/1', response: { script: mockScripts[0] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
    });
  });

  describe('script type badge', () => {
    it('shows strategy badge for strategy scripts', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [mockScripts[0]], activeScriptId: null } },
        { url: '/api/scripts/1', response: { script: mockScripts[0] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('strategy')).toBeInTheDocument();
      });
    });

    it('shows indicator badge for indicator scripts', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [mockScripts[1]], activeScriptId: null } },
        { url: '/api/scripts/2', response: { script: mockScripts[1] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('indicator')).toBeInTheDocument();
      });
    });
  });

  describe('new script', () => {
    it('creates a new script on button click', async () => {
      const user = userEvent.setup();
      const newScript = { id: '3', name: 'My Strategy', source: DEFAULT_CODE, scriptType: 'strategy', createdAt: Date.now(), updatedAt: Date.now() };

      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [], activeScriptId: null } },
        { url: '/api/scripts', response: { script: newScript }, status: 201 },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onAdd={() => {}} />);
      await waitFor(() => expect(screen.getByText(/No scripts yet/i)).toBeInTheDocument());
      await user.click(screen.getByText('Create Your First Script'));
      await waitFor(() => {
        expect(screen.getByText('My Strategy')).toBeInTheDocument();
      });
    });
  });

  describe('close button', () => {
    it('calls onClose when Close is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: mockScripts, activeScriptId: null } },
        { url: '/api/scripts/1', response: { script: mockScripts[0] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={onClose} onAdd={() => {}} />);
      await waitFor(() => expect(screen.getByText('Alpha Strategy')).toBeInTheDocument());
      await user.click(screen.getByText('Close'));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('add script', () => {
    it('calls onAdd when Add button is clicked', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: mockScripts, activeScriptId: null } },
        { url: '/api/scripts/1', response: { script: mockScripts[0] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onAdd={onAdd} />);
      await waitFor(() => expect(screen.getByText('Alpha Strategy')).toBeInTheDocument());
      await user.click(screen.getByText(/Add/i));
      expect(onAdd).toHaveBeenCalledWith('1', mockScripts[0].source);
    });
  });
});
