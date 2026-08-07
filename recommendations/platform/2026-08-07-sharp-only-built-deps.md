# sharp missing from pnpm onlyBuiltDependencies
**Date:** 2026-08-07
**Source:** Telegram Bot Engineer (Global PnL image pipeline)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
The root `pnpm-workspace.yaml`/package.json has `onlyBuiltDependencies: [esbuild]` which does not list `sharp`. It still works today because sharp ships prebuilt optional deps (`@img/sharp-linux-x64`), but pnpm emits an ignored-build-script warning and the prebuilt fallback could be blocked on other platforms (e.g. arm64) where a compile step WOULD be needed. Add `"sharp"` to the allowlist to future-proof platform fallbacks and silence the warning.

## Evidence
G0 Scout report + Wave 2 engineer recommendation: `pnpm --filter pine-framework-backend add sharp` output.