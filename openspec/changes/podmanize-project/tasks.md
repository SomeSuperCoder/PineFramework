## 1. Container Ignore

- [x] 1.1 Create `.containerignore` at project root (exclude node_modules, .git, dist, coverage, test-results, .opencode, openspec)
- [x] 1.2 Symlink `.containerignore` to `.dockerignore` for Docker compatibility

## 2. Root Library Containerfile

- [x] 2.1 Create `Containerfile` at project root for pine-framework library (multi-stage: build with node:20-slim, no runtime stage needed — library only)
- [x] 2.2 Install pnpm via corepack, copy workspace manifests first for layer caching, then copy source
- [x] 2.3 Build TypeScript library (`tsc -p tsconfig.build.json`)

## 3. Backend Containerfile

- [x] 3.1 Create `backend/Containerfile` (multi-stage: build with node:20-slim, runtime with node:20-slim)
- [x] 3.2 Build stage: install pnpm, copy workspace manifests, install deps, build pine-framework lib first, then build backend
- [x] 3.3 Runtime stage: copy only dist/, node_modules (production), set CMD to `node dist/index.js`
- [x] 3.4 Use `--mount=type=cache` for pnpm store to speed up rebuilds

## 4. Frontend Containerfile

- [x] 4.1 Create `frontend/Containerfile` (multi-stage: build with node:20-slim, runtime with nginx:alpine)
- [x] 4.2 Build stage: install pnpm, copy workspace manifests, install deps, build pine-framework lib first, then build frontend (`vite build`)
- [x] 4.3 Runtime stage: copy dist/ to nginx html dir, add custom nginx config for SPA routing
- [x] 4.4 Create `frontend/nginx.conf` for SPA fallback routing

## 5. Compose Configuration

- [x] 5.1 Create `compose.yml` at project root with backend and frontend services
- [x] 5.2 Backend service: build from `backend/Containerfile`, expose port 3000, depends_on frontend
- [x] 5.3 Frontend service: build from `frontend/Containerfile`, expose port 80
- [x] 5.4 Set build context to project root so workspace packages resolve correctly

## 6. Justfile Recipes

- [x] 6.1 Add `podman-build` recipe: build all images via podman-compose
- [x] 6.2 Add `podman-up` recipe: start stack in detached mode
- [x] 6.3 Add `podman-down` recipe: stop and remove containers
- [x] 6.4 Add `podman-logs` recipe: tail logs from all services

## 7. Verification

- [x] 7.1 Build all images successfully with `podman-compose build`
- [x] 7.2 Start the stack with `podman-compose up` and verify backend responds on port 3000
- [x] 7.3 Verify frontend serves the SPA on port 80 via nginx
- [x] 7.4 Verify `podman-compose down` cleans up containers
