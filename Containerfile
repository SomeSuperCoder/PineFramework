# Stage 1: Build the root library
FROM node:20-slim AS builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY src/ src/
COPY tsconfig.json tsconfig.build.json ./

# Build the library
RUN pnpm run build:lib

# Stage 2: Final image (library only — no runtime needed, this is a build dependency)
# This Containerfile is primarily used as a build context for backend/frontend
# But we keep it for standalone library builds
FROM node:20-slim AS runtime

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# The library is consumed by other packages, not run directly
CMD ["echo", "pine-framework library built successfully"]
