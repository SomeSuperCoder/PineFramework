# Remove dead 'light' theme option from SettingsPanel
**Date:** 2026-08-08
**Source:** qa-engineer (adoption QA gate)
**Priority:** medium
**Status:** dismissed
**Effort:** quick (<1hr)

## Recommendation
`SettingsPanel.tsx:30,380` exposes `Theme = 'dark' | 'light'` plus a "Light" select option, but `settings.theme` has zero consumers (no component reads it). Remove the dead option and type.

> ⚠️ **DISMISSED 2026-08-11** — `SettingsPanel.tsx` was deleted entirely (Director directive: AI-hallucinated panel, purely visual). Recommendation moot — the dead option no longer exists.

## Rationale
The design LAW doc (§0 Dark-Only Policy) forbids light theme — even as dead UI it contradicts the policy and invites future misuse. Keeping it costs nothing today but signals the wrong intent.

## Evidence
- QA verified `settings.theme` has no consumers; `prefers-color-scheme: light` = zero in repo.
