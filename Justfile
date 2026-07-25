alias t := test
alias s := start
alias c := check

test:
    pnpm run test
    pnpm --filter pine-framework-frontend run test:e2e

start:
    pnpm run dev

check:
    pnpm run typecheck:all
    pnpm run lint
    pnpm run build
