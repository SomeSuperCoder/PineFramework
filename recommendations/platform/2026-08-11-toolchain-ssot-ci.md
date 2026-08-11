# Use packageManager field as SSOT for pnpm/just toolchain in CI
**Date:** 2026-08-11
**Source:** DevOps Engineer (work report, CI workflow)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
When `packageManager` gets added to root `package.json`, switch the CI workflow to derive pnpm's version from it (`pnpm/action-setup@v4` without a hardcoded `version`, or reading the field) instead of the pinned `9.15.0`. Optionally validate `just` version bump (`1.36` → newer) once tested.

## Rationale
Single source of truth for the toolchain — avoids drift between the pinned CI version and the version developers use locally.

## Evidence
- Root `package.json` currently has NO `packageManager` field; lockfile is pnpm v9-compatible; CI pins `version: 9.15.0` in `pnpm/action-setup@v4`.
