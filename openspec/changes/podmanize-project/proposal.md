## Why

The project currently lacks containerization. Developers must manually install Node.js >= 20, pnpm, system dependencies, and manage environment setup across machines. Containerizing with Podman provides reproducible builds, isolated environments, and eliminates "works on my machine" issues. Podman is chosen over Docker for its rootless daemonless architecture and OCI compatibility.

## What Changes

- Add multi-stage `Containerfile` for the backend (Express + WebSocket server)
- Add multi-stage `Containerfile` for the frontend (React + Vite SPA, served via nginx)
- Add `Containerfile` for the root library (pine-framework core)
- Add `compose.yml` to orchestrate backend + frontend as a unified stack
- Add `.containerignore` to exclude dev artifacts, tests, and node_modules from builds
- Update `Justfile` with podman-specific recipes (`podman-build`, `podman-up`, `podman-down`)

## Capabilities

### New Capabilities
_(none — pure tooling/infrastructure, no spec-level behavior changes)_

### Modified Capabilities
_(none)_

## Impact

- **Files added**: `Containerfile` (×3), `compose.yml`, `.containerignore`, `Justfile` updates
- **Dependencies**: None added — uses official `node:20-slim` and `nginx:alpine` base images
- **Runtime**: Backend runs on port 3000 (Express), frontend on port 80 (nginx)
- **Build**: `pnpm install` + `tsc` + `vite build` inside containers
- **Dev workflow**: Developers can `podman-compose up` for local development or use the Justfile recipes
