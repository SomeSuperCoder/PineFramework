## 1. BotEngine Start Logic

- [x] 1.1 Modify `BotEngine.start()` in `src/trading/bot-engine.ts` to check `config.pairs?.length` instead of only `config.autoSelect` (see design.md — Implementation section)
- [x] 1.2 Add explicit error for empty pairs without autoSelect: "No trading pairs configured. Set pairs or enable auto-select."

## 2. Tests

- [x] 2.1 Update existing `tests/unit/trading/bot-engine.test.ts` tests for the new start precondition behavior
- [x] 2.2 Add test: start succeeds when autoSelect=true but pairs are configured
- [x] 2.3 Add test: start fails when autoSelect=true and pairs are empty
- [x] 2.4 Add test: start fails when autoSelect=false and pairs are empty

## 3. Spec Update

- [x] 3.1 Archive the delta spec `openspec/changes/fix-autoselect-gate/specs/bot-start-lifecycle/spec.md` into `openspec/specs/bot-start-lifecycle/spec.md`
