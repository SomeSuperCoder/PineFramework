alias t := test
alias d := dev
alias c := check

# build:lib first — vitest resolves pine-framework -> ./dist at runtime (ERR_MODULE_NOT_FOUND on fresh checkout without it)
test:
    pnpm run build:lib
    pnpm run test
    pnpm --filter pine-framework-frontend run test:e2e

dev:
    pnpm run dev

# dev-bot: backend WITHOUT file-watch — watch-restart kills the live bot's Bybit WS mid-handshake
dev-bot:
    pnpm --filter pine-framework-backend run dev:bot

# build:lib before typecheck — root pine-framework exports resolve to ./dist (Cannot find module on fresh checkout without it)
check:
    pnpm run build:lib
    pnpm run typecheck:all
    pnpm run lint
    pnpm run knip
    pnpm run build

# Podman / Container recipes
alias pp := podman-deploy
alias pb := podman-build
alias pu := podman-up
alias pd := podman-down
alias pl := podman-logs

# One-command deploy: build if needed, start/recreate containers
podman-deploy:
    podman-compose up --build -d

podman-build:
    podman-compose build

podman-up:
    podman-compose up -d

podman-down:
    podman-compose down

podman-logs:
    podman-compose logs -f
