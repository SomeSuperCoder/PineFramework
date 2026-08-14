# Containerized frontend cannot reach the API — proxy wiring gap
**Date:** 2026-08-13
**Source:** team/core/scout (README rewrite context)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Wire the containerized stack so the SPA can actually talk to the backend:
1. Add an `/api` (and `/ws`) reverse proxy to `frontend/nginx.conf` (currently `try_files` + static cache only — no proxy).
2. Fix `compose.yml` port mapping: backend is published `3000:3000` but the backend listens on `PORT` default `8081` — either publish `8081:8081` or pass `PORT=3000` to the container.

## Rationale
As currently wired, the Docker stack serves the SPA but it cannot reach the REST API or WebSockets, so the containerized product is non-functional for anything but static display. Local development (Vite proxy on `:3000` → `:8081`) works, but the Docker path claims to be a deployment option and isn't one yet.

## Evidence
- `frontend/nginx.conf` — static-only, no `/api` proxy (verified by Scout, 2026-08-13)
- `compose.yml` — backend `3000:3000` with `NODE_ENV=production`; backend defaults to `PORT=8081` (`backend/src/index.ts`)
- README.md Docker section (lines 437-449) documents the caveat and recommends `just dev`
