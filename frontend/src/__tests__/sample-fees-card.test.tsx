import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SampleFeesCard } from '../components/SampleFeesCard';

function okJson(body: unknown): Partial<Response> {
  return { ok: true, status: 200, json: async () => body };
}

function errorResponse(status: number): Partial<Response> {
  return { ok: status >= 200 && status < 300, status, json: async () => ({}) };
}

/** Stubs global fetch; the handler is invoked with the request URL for every call. */
function stubFetch(impl: (url: string) => Promise<Partial<Response>> | Partial<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Partial<Response>> => {
    return impl(String(input));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SampleFeesCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders null when the route probe returns 404 (feature absent)', async () => {
    stubFetch(() => errorResponse(404));
    const { container } = render(
      <SampleFeesCard symbol="SOL" commissionMethod="jupiter_manual" />,
    );

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders the fee grid on a 200 success', async () => {
    const fetchMock = stubFetch(() =>
      okJson({ dexFeeBps: 25, source: 'api', dexLabel: 'Jupiter Pool', solPriceUsd: 150 }),
    );
    render(<SampleFeesCard symbol="SOL" commissionMethod="jupiter_manual" />);

    expect(await screen.findByText('25 bps')).toBeInTheDocument();
    expect(screen.getByText('Live API')).toBeInTheDocument();
    expect(screen.getByText('Jupiter Pool')).toBeInTheDocument();
    expect(screen.getByText('$150')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/backtest/dex-fee?symbol=SOL'),
    );
  });

  it('labels source "cache" as Cache', async () => {
    stubFetch(() => okJson({ dexFeeBps: 10, source: 'cache' }));
    render(<SampleFeesCard symbol="SOL" commissionMethod="jupiter_manual" />);

    expect(await screen.findByText('10 bps')).toBeInTheDocument();
    expect(screen.getByText('Cache')).toBeInTheDocument();
  });

  it('labels source "in-memory-cache" as Memory Cache', async () => {
    stubFetch(() => okJson({ dexFeeBps: 10, source: 'in-memory-cache' }));
    render(<SampleFeesCard symbol="SOL" commissionMethod="jupiter_manual" />);

    expect(await screen.findByText('10 bps')).toBeInTheDocument();
    expect(screen.getByText('Memory Cache')).toBeInTheDocument();
  });

  it('shows "No fee data available" on a 400 response', async () => {
    stubFetch(() => errorResponse(400));
    render(<SampleFeesCard symbol="SOL" commissionMethod="jupiter_manual" />);

    expect(await screen.findByText('No fee data available for SOL.')).toBeInTheDocument();
  });

  it('shows the info callout when dexFeeBps is missing from a 200 response', async () => {
    stubFetch(() => okJson({ source: 'api' }));
    render(<SampleFeesCard symbol="SOL" commissionMethod="jupiter_manual" />);

    expect(await screen.findByText('No fee data available for SOL.')).toBeInTheDocument();
  });

  it('shows the error callout with Retry on network failure and recovers when retried', async () => {
    let failing = true;
    const fetchMock = vi.fn(async (): Promise<Partial<Response>> => {
      if (failing) throw new Error('network down');
      return okJson({ dexFeeBps: 25, source: 'api', dexLabel: 'Jupiter Pool', solPriceUsd: 150 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SampleFeesCard symbol="SOL" commissionMethod="jupiter_manual" />);

    expect(await screen.findByText('Could not fetch live fees.')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /retry/i });

    failing = false;
    await userEvent.click(retry);

    expect(await screen.findByText('25 bps')).toBeInTheDocument();
  });

  it('renders an em dash for SOL Price when solPriceUsd is absent', async () => {
    stubFetch(() => okJson({ dexFeeBps: 25, source: 'api', dexLabel: 'Jupiter Pool' }));
    render(<SampleFeesCard symbol="SOL" commissionMethod="jupiter_manual" />);

    expect(await screen.findByText('25 bps')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('refetches for the new symbol when the symbol prop changes', async () => {
    const fetchMock = stubFetch(() =>
      okJson({ dexFeeBps: 25, source: 'api', dexLabel: 'Jupiter Pool', solPriceUsd: 150 }),
    );
    const { rerender } = render(
      <SampleFeesCard symbol="SOL" commissionMethod="jupiter_manual" />,
    );
    expect(await screen.findByText('25 bps')).toBeInTheDocument();

    rerender(<SampleFeesCard symbol="ETH" commissionMethod="jupiter_manual" />);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes('symbol=ETH')),
      ).toBe(true);
    });
  });
});
