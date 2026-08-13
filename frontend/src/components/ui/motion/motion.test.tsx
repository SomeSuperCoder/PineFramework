import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { FadeIn } from './fade-in';
import { Stagger } from './stagger';
import { useReducedMotion } from './use-reduced-motion';

/**
 * Stub window.matchMedia to report the given `matches` value.
 *
 * jsdom does not implement matchMedia at all, so this is both the mock used
 * by the reduced-motion tests AND the proof that the components still work
 * when the API is absent (see `useReducedMotion` guard tests below).
 */
function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return mql;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('returns false when window.matchMedia is undefined (jsdom/SSR guard)', () => {
    // Force the guard's precondition: no matchMedia anywhere in the env.
    vi.stubGlobal('matchMedia', undefined);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('reports the matchMedia value and subscribes to change events when the API exists', () => {
    const mql = mockMatchMedia(false);

    const { result, unmount } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});

describe('FadeIn', () => {
  it('renders children immediately on first render — content is never gated by the animation', () => {
    render(
      <FadeIn>
        <p>Visible right away</p>
      </FadeIn>
    );

    // Synchronous assertion: no fake timers, no waitFor. The animation is
    // purely decorative and must never delay content visibility.
    expect(screen.getByText('Visible right away')).toBeInTheDocument();
  });

  it('applies the entrance animation classes by default (no reduced motion)', () => {
    const { container } = render(<FadeIn>content</FadeIn>);

    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass('animate-in');
    expect(el).toHaveClass('fade-in-0');
    expect(el).toHaveClass('slide-in-from-bottom-2');
    expect(el).toHaveClass('duration-base');
  });

  it('renders children without animation classes under reduced motion', () => {
    mockMatchMedia(true);

    const { container } = render(<FadeIn>content</FadeIn>);

    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toHaveClass('animate-in');
    expect(el).not.toHaveClass('slide-in-from-bottom-2');
    expect(el).toHaveTextContent('content');
  });
});

describe('Stagger', () => {
  it('delays each child by index * stepMs, capped at maxOffsetMs (100ms)', () => {
    // Children are built via .map() so React sees an array of elements with
    // NO whitespace text nodes between them (which would shift child indexes).
    render(
      <Stagger>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} data-testid={`c${i}`} />
        ))}
      </Stagger>
    );

    const delays = ['c0', 'c1', 'c2', 'c3', 'c4'].map(
      (id) => screen.getByTestId(id).style.animationDelay
    );

    // stepMs=40 → 0, 40, 80, then the 100ms cap for indexes 3 and 4.
    expect(delays).toEqual(['0ms', '40ms', '80ms', '100ms', '100ms']);
  });

  it('applies no delays to any child under reduced motion', () => {
    mockMatchMedia(true);

    render(
      <Stagger>
        {[0, 1, 2].map((i) => (
          <div key={i} data-testid={`c${i}`} />
        ))}
      </Stagger>
    );

    expect(screen.getByTestId('c0').style.animationDelay).toBe('');
    expect(screen.getByTestId('c1').style.animationDelay).toBe('');
    expect(screen.getByTestId('c2').style.animationDelay).toBe('');
  });
});
