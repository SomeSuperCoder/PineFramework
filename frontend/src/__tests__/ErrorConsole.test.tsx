import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorConsole } from '../components/ErrorConsole';
import type { PineScriptError } from '../types';

/**
 * ErrorConsole (shadcn Popover) — regression tests for the "Errors button →
 * black screen" bug.
 *
 * Root cause (PROVEN): the REST execute endpoint sent the EngineError OBJECT
 * {message, barIndex, span, stack} raw; useChartData stored the object into
 * PineScriptError.message (typed string) and ErrorConsole rendered
 * {error.message} → React threw "Objects are not valid as a React child" →
 * black screen. The fix normalizes to a string at the STORAGE boundary
 * (useChartData.toErrorMessage). These tests lock the render contract of the
 * new popover API ({errors, onClear}) and prove the exact bug payload renders
 * safely.
 *
 * Note on defense boundary: ErrorConsole itself renders `error.message`
 * directly — the object→string guard lives in useChartData.toErrorMessage
 * (locked by the useChartData engine-error tests + the dashboard-toolbar E2E
 * engine-error regression, which exercises the full wire→storage→render path).
 */

function renderConsole(errors: PineScriptError[], onClear = vi.fn()) {
  const user = userEvent.setup();
  render(<ErrorConsole errors={errors} onClear={onClear} />);
  return { user, onClear };
}

async function openPopover(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Errors' }));
  return screen.getByRole('dialog');
}

describe('ErrorConsole', () => {
  it('renders the EngineError message text safely — the exact payload from the black-screen bug does not crash', async () => {
    // The message text the engine produced in the original crash
    // (interpreter.ts:204-210 → wire → storage). The store now guarantees a
    // string; this locks the render path for the exact crash payload.
    const { user } = renderConsole([
      {
        type: 'error',
        message: 'Variable unknownVar is not defined',
        line: 1,
        column: 2,
      },
    ]);

    const popover = await openPopover(user);
    // If ErrorConsole crashed on render, openPopover itself would throw — the
    // assertion below proves the text reached the DOM uncorrupted.
    expect(
      within(popover).getByText('[Line 1, Col 2] Variable unknownVar is not defined'),
    ).toBeInTheDocument();
  });

  it('renders a plain string error message', async () => {
    const { user } = renderConsole([
      { type: 'error', message: 'Server error (500): e2e forced failure' },
    ]);

    const popover = await openPopover(user);
    expect(
      within(popover).getByText('Server error (500): e2e forced failure'),
    ).toBeInTheDocument();
  });

  it('shows the "No errors" empty state when the list is empty', async () => {
    const { user } = renderConsole([]);

    const popover = await openPopover(user);
    expect(within(popover).getByRole('heading', { name: 'Errors (0)' })).toBeInTheDocument();
    expect(within(popover).getByText('No errors')).toBeInTheDocument();
  });

  it('calls onClear when the Clear button is clicked', async () => {
    const onClear = vi.fn();
    const { user } = renderConsole(
      [{ type: 'error', message: 'first error' }],
      onClear,
    );

    const popover = await openPopover(user);
    await user.click(within(popover).getByRole('button', { name: 'Clear' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('trigger has accessible name "Errors", toggles open (aria-expanded) and shows a badge count', async () => {
    const { user } = renderConsole([
      { type: 'error', message: 'one' },
      { type: 'warning', message: 'two' },
    ]);

    const trigger = screen.getByRole('button', { name: 'Errors' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Badge shows the count while closed
    expect(trigger).toHaveTextContent('2');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Toggle closed again from the same trigger
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes via the visible Close button', async () => {
    const { user } = renderConsole([{ type: 'error', message: 'one' }]);

    const trigger = screen.getByRole('button', { name: 'Errors' });
    const popover = await openPopover(user);
    expect(popover).toBeInTheDocument();

    await user.click(within(popover).getByRole('button', { name: 'Close errors' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses with Escape (Radix behavior)', async () => {
    const { user } = renderConsole([{ type: 'error', message: 'one' }]);

    const trigger = screen.getByRole('button', { name: 'Errors' });
    await openPopover(user);

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
