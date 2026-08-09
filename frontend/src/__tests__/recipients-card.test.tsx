/**
 * Component tests for RecipientsCard (redesigned Telegram settings screen):
 * the linked-chats list (type badge + title, per-chat language Select, Unlink
 * AlertDialog, expandable read-only member subscription rows) and the per-alert
 * delivery toggles (collapsed by default, n/m summary badge, per-chat switches
 * wired through getAlertPref + onToggleAlert).
 *
 * Pure presentational component — rendered directly with props; getAlertPref is
 * injected so toggle wiring is asserted hermetically. Member subscription
 * switches are read-only indicators (memberSubscriptions is not editable), so
 * they are asserted disabled — never forced interactive.
 *
 * NOTE: in lucide-react v1.30.0 `Loader2` is an alias of `LoaderCircle`, so
 * the spinner svg carries the class `lucide-loader-circle` (not `-loader-2`).
 */
import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipientsCard } from '../components/TelegramConfigPanel/RecipientsCard';
import type { AlertConditionData, TelegramChat } from '../types';

type CardProps = Parameters<typeof RecipientsCard>[0];

const ALERT: AlertConditionData = { id: 'a1', title: 'Price Breakout', message: 'Price moved' };

function makeChat(overrides: Partial<TelegramChat> = {}): TelegramChat {
  return {
    chatId: 1,
    type: 'private',
    title: 'Trading Chat',
    linked: true,
    language: 'en',
    memberSubscriptions: {},
    ...overrides,
  };
}

const LINKED_PRIVATE = makeChat();
const LINKED_GROUP = makeChat({ chatId: 2, type: 'group', title: 'Signals Group' });

function makeProps(overrides: Partial<CardProps> = {}): CardProps {
  return {
    chats: [],
    alertConditions: [],
    busy: {},
    getAlertPref: vi.fn(() => false),
    onUpdateChatLanguage: vi.fn(),
    onUnlinkChat: vi.fn(),
    onToggleAlert: vi.fn(),
    ...overrides,
  };
}

function renderCard(overrides: Partial<CardProps> = {}): CardProps {
  const props = makeProps(overrides);
  cleanup();
  render(<RecipientsCard {...props} />);
  return props;
}

describe('RecipientsCard', () => {
  describe('Chats section', () => {
    it('shows the empty state when no chats are linked', () => {
      renderCard();
      expect(screen.getByText('No chats linked yet.')).toBeInTheDocument();
    });

    it('lists only linked chats with their type badge + title', () => {
      renderCard({
        chats: [LINKED_PRIVATE, makeChat({ chatId: 3, title: 'Hidden Chat', linked: false }), LINKED_GROUP],
      });
      expect(screen.getByText('Private')).toBeInTheDocument();
      expect(screen.getByText('Trading Chat')).toBeInTheDocument();
      expect(screen.getByText('Group')).toBeInTheDocument();
      expect(screen.getByText('Signals Group')).toBeInTheDocument();
      expect(screen.queryByText('Hidden Chat')).not.toBeInTheDocument();
    });

    it('changes a chat language through the labelled Select', async () => {
      const props = renderCard({ chats: [LINKED_PRIVATE] });
      await userEvent.click(screen.getByRole('combobox', { name: 'Language for Trading Chat' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Spanish' }));
      expect(props.onUpdateChatLanguage).toHaveBeenCalledWith(1, 'es');
    });

    it('disables the language Select while lang:<chatId> is busy', () => {
      renderCard({ chats: [LINKED_PRIVATE], busy: { 'lang:1': true } });
      expect(screen.getByRole('combobox', { name: 'Language for Trading Chat' })).toBeDisabled();
    });

    it('unlinks a chat only after confirming the AlertDialog', async () => {
      const props = renderCard({ chats: [LINKED_PRIVATE] });
      await userEvent.click(screen.getByRole('button', { name: 'Unlink Trading Chat' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText('Unlink chat?')).toBeInTheDocument();
      expect(within(dialog).getByText(/removes Trading Chat/)).toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
      expect(props.onUnlinkChat).toHaveBeenCalledWith(1);
    });

    it('cancelling the unlink dialog does not unlink', async () => {
      const props = renderCard({ chats: [LINKED_PRIVATE] });
      await userEvent.click(screen.getByRole('button', { name: 'Unlink Trading Chat' }));
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(props.onUnlinkChat).not.toHaveBeenCalled();
    });

    it('disables the unlink button + shows the spinner while unlink:<id> is busy', () => {
      renderCard({ chats: [LINKED_PRIVATE], busy: { 'unlink:1': true } });
      const unlink = screen.getByRole('button', { name: 'Unlink Trading Chat' });
      expect(unlink).toBeDisabled();
      expect(unlink).toHaveAttribute('aria-busy', 'true');
      expect(document.querySelector('svg.lucide-loader-circle')).not.toBeNull();
    });

    it('expands a chat to reveal read-only member subscription switches', async () => {
      renderCard({
        chats: [
          makeChat({
            memberSubscriptions: { '101': ['trading', 'report'], '102': ['daily'] },
          }),
        ],
      });

      // Collapsed by default — no switches in the document.
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();

      // JSX trims whitespace between the Badge and the title, so the trigger's
      // accessible name is "PrivateTrading Chat" (no space).
      await userEvent.click(screen.getByRole('button', { name: /PrivateTrading Chat/ }));
      expect(await screen.findByText('User 101')).toBeInTheDocument();
      expect(screen.getByText('2 subscriptions')).toBeInTheDocument();
      expect(screen.getByText('User 102')).toBeInTheDocument();
      expect(screen.getByText('1 subscription')).toBeInTheDocument();

      const sub101 = screen.getByRole('switch', { name: 'Subscriptions for user 101' });
      expect(sub101).toBeChecked();
      expect(sub101).toBeDisabled(); // memberSubscriptions is read-only — display indicator only
      const sub102 = screen.getByRole('switch', { name: 'Subscriptions for user 102' });
      expect(sub102).toBeChecked();
      expect(sub102).toBeDisabled();
    });

    it('shows a no-members note inside an expanded chat without subscriptions', async () => {
      renderCard({ chats: [LINKED_PRIVATE] });
      // Accessible name is "PrivateTrading Chat" (JSX whitespace is trimmed).
      await userEvent.click(screen.getByRole('button', { name: /PrivateTrading Chat/ }));
      expect(await screen.findByText('No members in this chat.')).toBeInTheDocument();
    });
  });

  describe('Per-alert toggles', () => {
    it('shows the empty state when no alerts are configured', () => {
      renderCard();
      expect(screen.getByText('No alerts configured yet.')).toBeInTheDocument();
    });

    it('is collapsed by default and shows the enabled/total summary badge', async () => {
      const getAlertPref = vi.fn((chatId: number) => chatId === 1);
      renderCard({
        chats: [LINKED_PRIVATE, LINKED_GROUP],
        alertConditions: [ALERT],
        getAlertPref,
      });
      // 1 of 2 linked chats has this alert enabled.
      expect(screen.getByText('1/2')).toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(getAlertPref).toHaveBeenCalledWith(1, 'a1');
      expect(getAlertPref).toHaveBeenCalledWith(2, 'a1');
    });

    it('expands to per-chat switches wired to getAlertPref + onToggleAlert', async () => {
      const getAlertPref = vi.fn((chatId: number) => chatId === 1);
      const props = renderCard({
        chats: [LINKED_PRIVATE, LINKED_GROUP],
        alertConditions: [ALERT],
        getAlertPref,
      });

      await userEvent.click(screen.getByRole('button', { name: /Price Breakout/ }));
      const onSwitch = await screen.findByRole('switch', {
        name: 'Price Breakout for Trading Chat',
      });
      expect(onSwitch).toBeChecked();
      const offSwitch = screen.getByRole('switch', {
        name: 'Price Breakout for Signals Group',
      });
      expect(offSwitch).not.toBeChecked();

      // Toggle passes the CURRENT enabled state so the hook can flip it.
      await userEvent.click(onSwitch);
      expect(props.onToggleAlert).toHaveBeenCalledWith(1, 'a1', true);
      await userEvent.click(offSwitch);
      expect(props.onToggleAlert).toHaveBeenCalledWith(2, 'a1', false);
    });

    it('shows the link-a-chat note when alerts exist but no chats are linked', async () => {
      renderCard({ alertConditions: [ALERT] });
      await userEvent.click(screen.getByRole('button', { name: /Price Breakout/ }));
      expect(await screen.findByText('Link a chat to enable alerts.')).toBeInTheDocument();
    });
  });
});
