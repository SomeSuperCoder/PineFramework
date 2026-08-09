/**
 * Component tests for ConnectionCard (redesigned Telegram settings screen):
 * Bot Token + HTTP Proxy sub-sections, password reveal toggles, dirty-gated
 * Save buttons, busy spinner, and role-based status callouts.
 *
 * The card is a pure presentational component — rendered directly with props
 * (no hook mock required) so behavior is asserted hermetically. renderCard
 * cleans the DOM before every render so multi-state tests never collide.
 *
 * NOTE: in lucide-react v1.30.0 `Loader2` is an alias of `LoaderCircle`, so
 * the spinner svg carries the class `lucide-loader-circle` (not `-loader-2`).
 */
import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionCard } from '../components/TelegramConfigPanel/ConnectionCard';
import type { ProxyDraft } from '../components/TelegramConfigPanel/useTelegramSettings';

type CardProps = Parameters<typeof ConnectionCard>[0];

const BASE_PROXY: ProxyDraft = { host: '127.0.0.1', port: '8080', username: '', password: '' };

function renderCard(overrides: Partial<CardProps> = {}): CardProps {
  const props: CardProps = {
    botToken: 'tok-1',
    onBotTokenChange: vi.fn(),
    botTokenDirty: false,
    tokenSaving: false,
    tokenStatus: 'idle',
    onSaveToken: vi.fn(),
    proxy: BASE_PROXY,
    onProxyFieldChange: vi.fn(),
    proxyDirty: false,
    proxySaving: false,
    proxyStatus: 'idle',
    showProxyPassword: false,
    onToggleProxyPassword: vi.fn(),
    onSaveProxy: vi.fn(),
    ...overrides,
  };
  cleanup();
  render(<ConnectionCard {...props} />);
  return props;
}

describe('ConnectionCard', () => {
  it('renders Bot Token + HTTP Proxy sub-sections', () => {
    renderCard();
    expect(screen.getByRole('region', { name: 'Bot token' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'HTTP proxy' })).toBeInTheDocument();
    // SectionHeader headings (the input Label duplicates the text, so query by heading role).
    expect(screen.getByRole('heading', { name: 'Bot Token' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'HTTP Proxy' })).toBeInTheDocument();
  });

  it('renders the bot token input as type="password"', () => {
    renderCard();
    expect(screen.getByLabelText('Bot Token')).toHaveAttribute('type', 'password');
  });

  it('Eye toggle switches the token input to text and back', async () => {
    renderCard();
    const input = screen.getByLabelText('Bot Token');

    await userEvent.click(screen.getByRole('button', { name: 'Show bot token' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide bot token' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide bot token' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('disables Save while the token is unchanged, enables + fires when dirty', async () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    const props = renderCard({ botTokenDirty: true, botToken: 'new-token' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(props.onSaveToken).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and aria-busy while the token save is in flight', () => {
    renderCard({ tokenSaving: true, botTokenDirty: true });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('svg.lucide-loader-circle')).not.toBeNull();
  });

  it('shows role="status" on save success and role="alert" on save failure', () => {
    renderCard({ tokenStatus: 'saved' });
    expect(screen.getByRole('status')).toHaveTextContent('Token saved');

    renderCard({ tokenStatus: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to save');
  });

  it('renders the proxy fields wired to their labels', () => {
    renderCard();
    expect(screen.getByLabelText('Host')).toHaveValue('127.0.0.1');
    expect(screen.getByLabelText('Port')).toHaveValue(8080);
    expect(screen.getByLabelText(/Username/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('type', 'password');
  });

  it('toggles the proxy password visibility via its labeled button', async () => {
    const props = renderCard({ showProxyPassword: false });
    await userEvent.click(screen.getByRole('button', { name: 'Show proxy password' }));
    expect(props.onToggleProxyPassword).toHaveBeenCalledTimes(1);

    renderCard({ showProxyPassword: true });
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide proxy password' })).toBeInTheDocument();
  });

  it('disables Save Proxy while unchanged, reports proxy statuses with roles', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Save Proxy' })).toBeDisabled();

    renderCard({ proxyDirty: true, proxyStatus: 'saved' });
    expect(screen.getByRole('status')).toHaveTextContent('Proxy saved');

    renderCard({ proxyDirty: true, proxyStatus: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to save');
  });
});
