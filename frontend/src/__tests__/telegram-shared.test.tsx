/**
 * Light component tests for the shared Telegram panel building blocks:
 * StatusCallout (role contract + auto-dismiss), SectionHeader (title + icon),
 * SettingRow (label / description / children).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { KeyRound } from 'lucide-react';
import { StatusCallout } from '../components/TelegramConfigPanel/StatusCallout';
import { SectionHeader } from '../components/TelegramConfigPanel/SectionHeader';
import { SettingRow } from '../components/TelegramConfigPanel/SettingRow';

afterEach(() => {
  vi.useRealTimers();
});

describe('StatusCallout', () => {
  it('uses role="status" for the success tone', () => {
    render(<StatusCallout tone="success">Saved</StatusCallout>);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Saved');
  });

  it('uses role="status" for the info tone', () => {
    render(<StatusCallout tone="info">Info</StatusCallout>);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Info');
  });

  it('uses role="alert" for the error tone', () => {
    render(<StatusCallout tone="error">Failed</StatusCallout>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Failed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('auto-dismisses after autoDismissMs', () => {
    vi.useFakeTimers();
    render(
      <StatusCallout tone="success" autoDismissMs={100}>
        Transient
      </StatusCallout>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Transient');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays visible without autoDismissMs', () => {
    render(<StatusCallout tone="success">Persistent</StatusCallout>);
    expect(screen.getByRole('status')).toHaveTextContent('Persistent');
  });
});

describe('SectionHeader', () => {
  it('renders the title with the icon marked aria-hidden', () => {
    const { container } = render(<SectionHeader icon={KeyRound} title="Bot Token" />);
    expect(screen.getByRole('heading', { name: 'Bot Token' })).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('SettingRow', () => {
  it('renders label, description and children', () => {
    render(
      <SettingRow label="Test Message" description="Sends a connectivity check">
        <button type="button">Go</button>
      </SettingRow>,
    );
    expect(screen.getByText('Test Message')).toBeInTheDocument();
    expect(screen.getByText('Sends a connectivity check')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('omits the description when not provided', () => {
    render(
      <SettingRow label="Only Label">
        <span>child</span>
      </SettingRow>,
    );
    expect(screen.getByText('Only Label')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
