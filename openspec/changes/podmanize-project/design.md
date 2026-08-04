## Context

PineFramework is a pnpm monorepo with three packages: root library, backend (Express), and frontend (React/Vite). No containerization exists today. The project requires Node.js >= 20 and native dependencies (esbuild, bufferutil). Backend has WebSocket + Telegram bot dependencies; frontend is a static SPA served by Vite in dev.

## Goals / Non-Goals

**Goals:**
- Reproducible builds via Podman containers
- Production-ready images (multi-stage, minimal attack surface)
- One-command orchestration via `compose.yml`
- Developer-friendly Justfile recipes

**Non-Goals:**
- Kubernetes / Helm charts (premature for current scale)
- CI/CD pipeline integration (separate concern)
- Hot-reload dev containers (dev workflow stays local-first)

## Decisions

### 1. Multi-stage builds per package
**Choice:** Separate Containerfile for each workspace package (library, backend, frontend) rather than one monolithic Containerfile.

**Rationale:** Each package has different runtime requirements. Backend needs Node.js at runtime; frontend needs only nginx. Separate builds enable independent caching and smaller final images.

**Alternatives considered:**
- Single Containerfile with conditional stages → rejected: adds complexity, harder to cache
- Buildx multi-target → compatible but not necessary for Podman's workflow

### 2. `node:20-slim` base for build, `node:20-slim` for backend runtime
**Choice:** Use Debian slim variants for both build and runtime stages.

**Rationale:** `slim` includes enough for native module compilation (python3, gcc via buildpack-deps) without the full image bloat. Alpine was considered but causes issues with native npm modules (musl vs glibc).

### 3. `nginx:alpine` for frontend
**Choice:** Serve the built Vite SPA via nginx in the final frontend image.

**Rationale:** The frontend is a static SPA after `vite build`. Nginx is the lightest production-ready static server. SPA routing handled via nginx config.

### 4. Root-level library built first
**Choice:** Build the root `pine-framework` package before backend/frontend in the compose build order, since both depend on `pine-framework: workspace:*`.

**Rationale:** pnpm workspaces resolve local dependencies at install time. The library must be built (TypeScript compilation) before dependents can consume it.

### 5. `.containerignore` over `.dockerignore`
**Choice:** Use `.containerignore` (Podman-native) with `.dockerignore` as fallback symlink.

**Rationale:** Podman reads `.containerignore` first. Symlinking ensures compatibility if anyone uses Docker.

### 6. Compose with `podman-compose` or `docker-compose` compatible YAML
**Choice:** Write `compose.yml` (not `docker-compose.yml`) using the Compose Specification.

**Rationale:** The Compose Specification is vendor-agnostic. Both `podman-compose` and `docker compose` (v2) read it.

## Risks / Trade-offs

- **[Native module compilation]** → esbuild and bufferutil require node-gyp. Mitigation: Use `node:20-slim` which includes build essentials; multi-stage build cleans up build deps in final image.
- **[pnpm store caching]** → Without caching, every build reinstalls all deps. Mitigation: Use `--mount=type=cache` for pnpm store in Containerfile.
- **[Workspace dependency ordering]** → Root lib must build before dependents. Mitigation: Explicit `depends_on` in compose.yml + build script order.
- **[Image size]** → Node.js runtime images are ~200MB. Mitigation: Multi-stage builds, slim base images, prune devDependencies in production stage.

## Open Questions

_(None — all decisions are straightforward for this scope)_
