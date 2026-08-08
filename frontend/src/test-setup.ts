import '@testing-library/jest-dom';

/**
 * jsdom does not implement ResizeObserver; Radix Popover/Select and cmdk's
 * CommandList construct one on mount (shadcn-era components). Stub it so open
 * popover/command tests don't crash with `ReferenceError: ResizeObserver is
 * not defined`.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

/**
 * jsdom lacks pointer-capture and scrollIntoView; Radix Select opens its
 * listbox from a pointerdown capture guard and cmdk scrolls the highlighted
 * option into view. Without these no-ops the Radix listbox never mounts and
 * cmdk ArrowDown crashes (`hasPointerCapture is not a function` /
 * `scrollIntoView is not a function`).
 */
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}
