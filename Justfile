alias t := test
alias d := dev
alias c := check

test:
    pnpm run test
    pnpm --filter pine-framework-frontend run test:e2e

dev:
    pnpm run dev

# dev-bot: backend WITHOUT file-watch — watch-restart kills the live bot's Bybit WS mid-handshake
dev-bot:
    pnpm --filter pine-framework-backend run dev:bot

check:
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
