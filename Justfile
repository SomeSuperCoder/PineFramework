alias t := test
alias d := dev
alias c := check

test:
    pnpm run test
    pnpm --filter pine-framework-frontend run test:e2e

dev:
    pnpm run dev

check:
    pnpm run typecheck:all
    pnpm run lint
    pnpm run build

# Podman / Container recipes
alias pb := podman-build
alias pu := podman-up
alias pd := podman-down
alias pl := podman-logs

podman-build:
    podman-compose build

podman-up:
    podman-compose up -d

podman-down:
    podman-compose down

podman-logs:
    podman-compose logs -f
