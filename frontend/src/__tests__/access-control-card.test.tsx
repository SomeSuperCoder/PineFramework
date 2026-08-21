/**
 * Component tests for AccessControlCard (redesigned Telegram settings screen):
 * the Admin section (current admin badge/description, user id + username
 * inputs, dirty-gated "Set as Admin" with busy spinner + saved status), pending
 * controller requests (identity rows, per-row Approve/Deny busy states) and
 * active controllers (Remove gated behind an AlertDialog confirmation).
 *
 * Pure presentational component — rendered directly with props (no hook mock).
 *
 * NOTE: in lucide-react v1.30.0 `Loader2` is an alias of `LoaderCircle`, so
 * the spinner svg carries the class `lucide-loader-circle` (not `-loader-2`).
 */
import { describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessControlCard } from '../components/TelegramConfigPanel/AccessControlCard';
import type { TelegramAdmin, TelegramControlRequest, TelegramController } from '../types';

type CardProps = Parameters<typeof AccessControlCard>[0];

const ADMIN: TelegramAdmin = { userId: 42, username: 'alice' };

const REQUEST: TelegramControlRequest = {
  userId: 5,
  username: 'bob',
  firstName: 'Bob',
  requestedAt: 1,
};

const CONTROLLER: TelegramController = { userId: 3, username: 'carol' };

function makeProps(overrides: Partial<CardProps> = {}): CardProps {
  return {
    currentAdmin: null,
    requests: [],
    controllers: [],
    admin: { userId: '', username: '' },
    adminStatus: 'idle',
    onAdminFieldChange: vi.fn(),
    busy: {},
    onSetAdmin: vi.fn(),
    onApproveRequest: vi.fn(),
    onDenyRequest: vi.fn(),
    onRemoveController: vi.fn(),
    ...overrides,
  };
}

function renderCard(overrides: Partial<CardProps> = {}): CardProps {
  const props = makeProps(overrides);
  cleanup();
  render(<AccessControlCard {...props} />);
  return props;
}

describe('AccessControlCard', () => {
  describe('Admin section', () => {
    it('renders the current admin as a badge with the username description', () => {
      renderCard({ currentAdmin: ADMIN });
      expect(screen.getByText('Current admin')).toBeInTheDocument();
      expect(screen.getByText('alice')).toBeInTheDocument(); // SettingRow description
      expect(screen.getByText('42')).toBeInTheDocument(); // Badge userId
      expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
    });

    it('shows "Not configured" when no admin is set', () => {
      renderCard();
      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });

    it('renders the user id + username inputs wired to onAdminFieldChange', () => {
      const props = renderCard();
      // fireEvent.change carries the full value: the card is fully controlled,
      // so a per-keystroke userEvent.type would reset the input between keys
      // (the prop value never updates in a stateless test harness).
      fireEvent.change(screen.getByLabelText('User ID'), { target: { value: '42' } });
      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
      expect(props.onAdminFieldChange).toHaveBeenCalledWith('userId', '42');
      expect(props.onAdminFieldChange).toHaveBeenCalledWith('username', 'alice');
    });

    it('keeps Set as Admin disabled while the draft is empty or unchanged', () => {
      // Empty draft (no admin configured yet).
      renderCard();
      expect(screen.getByRole('button', { name: 'Set as Admin' })).toBeDisabled();
      // Draft equals the current admin — not dirty.
      renderCard({ currentAdmin: ADMIN, admin: { userId: '42', username: 'alice' } });
      expect(screen.getByRole('button', { name: 'Set as Admin' })).toBeDisabled();
    });

    // The card is purely presentational: clicking fires onSetAdmin, and the
    // saved/error callout is driven entirely by the adminStatus prop.
    it('enables Set as Admin when the draft differs and fires onSetAdmin', async () => {
      const props = renderCard({
        currentAdmin: ADMIN,
        admin: { userId: '42', username: 'alice2' },
      });
      const setButton = screen.getByRole('button', { name: 'Set as Admin' });
      expect(setButton).toBeEnabled();

      await userEvent.click(setButton);
      expect(props.onSetAdmin).toHaveBeenCalledTimes(1);
      // No callout while idle — status only appears via the adminStatus prop.
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the success callout when adminStatus is "saved"', () => {
      renderCard({ adminStatus: 'saved' });
      expect(screen.getByRole('status')).toHaveTextContent('Admin saved');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the error callout when adminStatus is "error"', () => {
      renderCard({ adminStatus: 'error' });
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to save');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('disables Set as Admin + shows the spinner while busy.admin is set', () => {
      renderCard({ admin: { userId: '42', username: '' }, busy: { admin: true } });
      const setButton = screen.getByRole('button', { name: 'Set as Admin' });
      expect(setButton).toBeDisabled();
      expect(setButton).toHaveAttribute('aria-busy', 'true');
      expect(document.querySelector('svg.lucide-loader-circle')).not.toBeNull();
    });
  });

  describe('Controller requests', () => {
    it('shows the empty state when there are no pending requests', () => {
      renderCard();
      expect(screen.getByText('No pending requests.')).toBeInTheDocument();
    });

    it('renders each request and approves/denies with the userId', async () => {
      const props = renderCard({
        requests: [REQUEST, { ...REQUEST, userId: 7, username: '' }],
      });
      // Identity badge: username when present, "User <id>" fallback.
      expect(screen.getByText('bob')).toBeInTheDocument();
      expect(screen.getByText('ID 5')).toBeInTheDocument();
      expect(screen.getByText('User 7')).toBeInTheDocument();
      expect(screen.getByText('ID 7')).toBeInTheDocument();

      await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
      expect(props.onApproveRequest).toHaveBeenCalledWith(5);

      await userEvent.click(screen.getAllByRole('button', { name: 'Deny' })[1]);
      expect(props.onDenyRequest).toHaveBeenCalledWith(7);
    });

    it('disables both row actions + shows the spinner on the busy action for that row only', () => {
      renderCard({
        requests: [REQUEST, { ...REQUEST, userId: 7, username: '' }],
        busy: { 'approve:5': true },
      });
      const approves = screen.getAllByRole('button', { name: 'Approve' });
      const denies = screen.getAllByRole('button', { name: 'Deny' });

      expect(approves[0]).toBeDisabled();
      expect(approves[0]).toHaveAttribute('aria-busy', 'true');
      expect(denies[0]).toBeDisabled(); // rowBusy disables the sibling action too
      expect(approves[1]).toBeEnabled();
      expect(denies[1]).toBeEnabled();
      expect(document.querySelector('svg.lucide-loader-circle')).not.toBeNull();
    });
  });

  describe('Controllers', () => {
    it('shows the empty state when no controllers are configured', () => {
      renderCard();
      expect(screen.getByText('No controllers configured.')).toBeInTheDocument();
    });

    it('removes a controller only after confirming the AlertDialog', async () => {
      const props = renderCard({
        controllers: [CONTROLLER, { userId: 9, username: '' }],
      });
      expect(screen.getByText('carol')).toBeInTheDocument();
      expect(screen.getByText('ID 3')).toBeInTheDocument();
      expect(screen.getByText('User 9')).toBeInTheDocument();

      await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText('Remove controller?')).toBeInTheDocument();
      expect(within(dialog).getByText('This revokes their access.')).toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
      expect(props.onRemoveController).toHaveBeenCalledWith(3);
    });

    it('cancelling the dialog does not remove the controller', async () => {
      const props = renderCard({ controllers: [CONTROLLER] });
      await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(props.onRemoveController).not.toHaveBeenCalled();
    });

    it('disables Remove + shows the spinner while remove:<id> is busy', () => {
      renderCard({ controllers: [CONTROLLER], busy: { 'remove:3': true } });
      const remove = screen.getByRole('button', { name: 'Remove' });
      expect(remove).toBeDisabled();
      expect(remove).toHaveAttribute('aria-busy', 'true');
      expect(document.querySelector('svg.lucide-loader-circle')).not.toBeNull();
    });
  });
});
