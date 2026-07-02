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

  describe('basic rendering (task 77.5)', () => {
    it('renders nothing when closed', () => {
      const { container } = render(<CodeEditor isOpen={false} onClose={() => {}} onRun={() => {}} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders editor when open', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [mockScripts[1]], activeScriptId: null } },
        { url: '/api/scripts/running', response: { script: null } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/Pine Script Editor/i)).toBeInTheDocument();
      });
    });

    it('shows empty state when no scripts exist', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [], activeScriptId: null } },
        { url: '/api/scripts/running', response: { script: null } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/No scripts yet/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Create Your First Script/i)).toBeInTheDocument();
    });

    it('shows loading state while fetching', async () => {
      let resolveFetch: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
      vi.mocked(fetch).mockImplementation(() => fetchPromise.then(() => new Response(JSON.stringify({scripts: []}), { status: 200 })));

      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={() => {}} />);
      expect(screen.getByText(/Loading scripts/i)).toBeInTheDocument();
      resolveFetch!(undefined);
    });
  });

  describe('script list and selection (tasks 77.5 & 79.6)', () => {
    it('fetches scripts and renders dropdown on open', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: mockScripts, activeScriptId: null } },
        { url: '/api/scripts/running', response: { script: mockScripts[0] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
        expect(screen.getByText('Beta Indicator')).toBeInTheDocument();
      });
    });

    it('loads running script on open when no initialScriptId', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: mockScripts, activeScriptId: null } },
        { url: '/api/scripts/running', response: { script: mockScripts[0] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Strategy')).toBeInTheDocument();
      });
      const calls = vi.mocked(fetch).mock.calls;
      const runningCall = calls.find(([url]) => url.toString().includes('/api/scripts/running'));
      expect(runningCall).toBeTruthy();
    });

    it('loads initialScriptId when provided', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: mockScripts, activeScriptId: '2' } },
        { url: '/api/scripts/2', response: { script: mockScripts[1] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={() => {}} initialScriptId="2" />);
      await waitFor(() => {
        const calls = vi.mocked(fetch).mock.calls;
        const loadCall = calls.find(([url]) => url.toString().includes('/api/scripts/2'));
        expect(loadCall).toBeTruthy();
      });
    });
  });

  describe('script type badge (task 77.5)', () => {
    it('shows strategy badge for strategy scripts', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [mockScripts[0]], activeScriptId: null } },
        { url: '/api/scripts/running', response: { script: mockScripts[0] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('strategy')).toBeInTheDocument();
      });
    });

    it('shows indicator badge for indicator scripts', async () => {
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [mockScripts[1]], activeScriptId: null } },
        { url: '/api/scripts/running', response: { script: mockScripts[1] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText('indicator')).toBeInTheDocument();
      });
    });
  });

  describe('new script (task 79.6)', () => {
    it('creates a new script on button click', async () => {
      const user = userEvent.setup();
      const newScript = { id: '3', name: 'My Strategy', source: DEFAULT_CODE, scriptType: 'strategy', createdAt: Date.now(), updatedAt: Date.now() };

      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: [], activeScriptId: null } },
        { url: '/api/scripts/running', response: { script: null } },
        { url: '/api/scripts', response: { scripts: [], activeScriptId: null } },
        { url: '/api/scripts', response: { script: newScript }, status: 201 },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={() => {}} />);
      await waitFor(() => expect(screen.getByText(/No scripts yet/i)).toBeInTheDocument());
      await user.click(screen.getByText('Create Your First Script'));
      await waitFor(() => {
        expect(screen.getByText('My Strategy')).toBeInTheDocument();
      });
    });
  });

  describe('close button (task 79.6)', () => {
    it('calls onClose when Close is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: mockScripts, activeScriptId: null } },
        { url: '/api/scripts/running', response: { script: mockScripts[0] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={onClose} onRun={() => {}} />);
      await waitFor(() => expect(screen.getByText('Alpha Strategy')).toBeInTheDocument());
      await user.click(screen.getByText('Close'));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('run script (task 79.6)', () => {
    it('calls onRun when Run button is clicked', async () => {
      const user = userEvent.setup();
      const onRun = vi.fn();
      mockFetchQueue([
        { url: '/api/scripts', response: { scripts: mockScripts, activeScriptId: null } },
        { url: '/api/scripts/running', response: { script: mockScripts[0] } },
      ]);
      render(<CodeEditor isOpen={true} onClose={() => {}} onRun={onRun} />);
      await waitFor(() => expect(screen.getByText('Alpha Strategy')).toBeInTheDocument());
      await user.click(screen.getByText(/Run/i));
      expect(onRun).toHaveBeenCalledWith('1', mockScripts[0].source);
    });
  });
});
