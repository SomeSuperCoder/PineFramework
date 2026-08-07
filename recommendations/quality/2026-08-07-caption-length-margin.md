# REPORT_CAPTION_MAX_LENGTH vs escaped caption hard cap
**Date:** 2026-08-07
**Source:** Code Reviewer (Global PnL report review)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`handleReport` checks `REPORT_CAPTION_MAX_LENGTH = 1000` against the RAW report text, but `TelegramService.sendPhoto` escapes it (adds backslashes) before Telegram's hard 1024-char caption cap. A near-1000 raw caption can exceed 1024 after escaping. This degrades gracefully today (falls back to text + error note), but align the guard: measure the ESCAPED length, or use a lower cap (e.g. `1000` → ~900) to leave escape-growth headroom.

## Activity
Prevents the silent caption-to-body fallback on edge-case long reports; aligns the guard with the real transport cap.

## Evidence
TelegramBotFeature.ts `REPORT_CAPTION_MAX_LENGTH=1000` (raw check) vs TelegramService.sendPhoto escaped caption (MarkdownV2).