/**
 * Component tests for DiagnosticsCard (redesigned Telegram settings screen):
 * the Send Test Message control, busy spinner + disabled state, botToken gating,
 * and role-based test-status callouts (status on success, alert on error).
 *
 * Pure presentational component — rendered directly with props.
 */
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiagnosticsCard } from '../components/TelegramConfigPanel/DiagnosticsCard';

function renderCard(
  overrides: Partial<Parameters<typeof DiagnosticsCard>[0]> = {},
): Mock<() => void> {
  const props = {
    botToken: 'tok-1',
    testing: false,
    testStatus: 'idle' as const,
    onSendTest: vi.fn<() => void>(),
    ...overrides,
  };
  render(<DiagnosticsCard {...props} />);
  return props.onSendTest;
}

describe('DiagnosticsCard', () => {
  it('renders the Send Test Message button', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Send Test Message' })).toBeEnabled();
  });

  it('disables the button when no bot token is configured', () => {
    renderCard({ botToken: '' });
    expect(screen.getByRole('button', { name: 'Send Test Message' })).toBeDisabled();
  });

  it('disables + shows the Loader2 spinner while testing', () => {
    renderCard({ testing: true });
    const button = screen.getByRole('button', { name: 'Send Test Message' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    // lucide-react v1.30.0 aliases Loader2 -> LoaderCircle (class `lucide-loader-circle`).
    expect(document.querySelector('svg.lucide-loader-circle')).not.toBeNull();
    expect(document.querySelector('svg.lucide-send')).toBeNull();
  });

  it('calls onSendTest on click', async () => {
    const onSendTest = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Send Test Message' }));
    expect(onSendTest).toHaveBeenCalledTimes(1);
  });

  it('shows role="status" on success and role="alert" on failure', () => {
    renderCard({ testStatus: 'ok' });
    expect(screen.getByRole('status')).toHaveTextContent('Connected — test message sent.');

    renderCard({ testStatus: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed — click Send Test Message to retry.');
  });

  it('shows no callout while idle', () => {
    renderCard();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
