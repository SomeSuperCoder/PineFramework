/**
 * Inline Pine Script source for "Every Bar Alert" — no filesystem dependency.
 *
 * Use this in backend tests that do not want to read `test_indicators/every-bar-alert.pine`
 * from disk.  The condition `close == close` is always true, so every executed bar
 * produces exactly one `AlertTriggerEntry`.
 */
export const EVERY_BAR_ALERT_SOURCE = `//@version=6
indicator("Every Bar Alert", overlay=true, precision=2)

alertcondition(close == close, title="Every Bar Alert", message="Alert on bar {{bar_index}}")

plot(close, color=color.blue, linewidth=1, title="Close")
`;

/**
 * A script whose `alertcondition` triggers only when `close > threshold`.
 * Useful for tests that need a subset of bars to produce alert triggers.
 */
export function thresholdAlertSource(threshold: number): string {
  return `//@version=6
indicator("Threshold Alert", overlay=true, precision=2)

alertcondition(close > ${threshold}, title="Cross Alert", message="Price crossed {{ticker}}")

plot(close, color=color.blue, linewidth=1, title="Close")
`;
}
