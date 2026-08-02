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
