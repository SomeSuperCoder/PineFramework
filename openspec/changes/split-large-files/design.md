## Context

The pine-framework monorepo has grown organically, resulting in several source files exceeding 700 lines (parser.ts: 1505, strategy-engine.ts: 1438, useChartData.ts: 1224, etc.). These monolithic files are problematic for AI-assisted development because large context windows compress token budgets and reduce reasoning quality. They also make code review harder, increase merge conflict surface area, and obscure module boundaries.

The project already has a pattern of barrel re-exports via `index.ts` files (e.g., `src/language/parser/index.ts`, `src/language/runtime/index.ts`, `src/strategy/index.ts`). This design extends that pattern — splitting monolithic files into focused sub-modules while preserving the existing public API surface through those same barrel files.

## Goals / Non-Goals

**Goals:**
- Reduce every source file to ≤400 lines (soft target) where the existing module has clearly separable concerns
- Preserve 100% of the existing public API surface via barrel re-exports
- Maintain identical runtime behavior — zero test modifications required
- Follow existing conventions (barrel `index.ts` files, directory-per-module layout)

**Non-Goals:**
- No behavioral changes, feature additions, or refactoring of logic
- No renaming of existing exports, types, or interfaces
- No changes to test files (unless import paths change and need updating)
- No restructuring of the module dependency graph
- No performance optimization or code simplification beyond the split itself

## Decisions

### Decision 1: Extract complementary concerns into sibling modules, not deep hierarchies

**Rationale:** Each large file mixes multiple concerns that can be separated by responsibility. For example, `parser.ts` contains statement parsing, expression parsing, and utility methods — each can be a separate file in the same directory. Deep nesting (>2 levels) adds import path complexity without benefit.

**Alternatives considered:**
- Keeping files monolithic (rejected: defeats the purpose)
- Creating deep sub-directories (rejected: barrel complexity exceeds benefit)

### Decision 2: Barrel re-exports via existing `index.ts` files

**Rationale:** The project already uses `index.ts` barrel files (e.g., `src/language/parser/index.ts` exports `Parser`, `parse`, `ParseResult`). By adding the new sub-module exports to the same barrel, every existing import continues to work without modification.

**Alternatives considered:**
- Updating every import site (rejected: massive diff, error-prone, no benefit)
- Re-exporting only from the new sub-files (rejected: breaks backward compatibility)

### Decision 3: Class methods extracted as standalone functions taking the class instance

**Rationale:** When splitting a class, methods that are primarily cohesive can be extracted into standalone functions that receive the class instance (`this`) as their first argument, or as static methods on a helper class. This avoids the complexity of cross-file class inheritance while keeping the code testable.

**Alternatives considered:**
- Breaking the class into an inheritance hierarchy (rejected: tight coupling)
- Using mixins (rejected: TypeScript type complexity, reduced readability)

### Decision 4: Splits grouped by natural cohesion, not by file size alone

**Rationale:** The goal is AI-friendliness, not artificial line counts. Each extracted module should represent a *coherent set of related functions*. For example, `expression-executor.ts` splits into `array-methods.ts` (array operations), `drawing-methods.ts` (line/box/label operations), and `type-constructors.ts` — each is a natural domain. A file that genuinely cannot be split cleanly (e.g., a dense state machine) may remain large.

### Decision 5: Multi-pass approach — split the largest files first, then iterate

**Rationale:** The 10 largest files account for ~9,500 lines. Splitting them yields the most improvement per unit of effort. Smaller files (300-500 lines) can be split in follow-up changes if needed.

## Risks / Trade-offs

- **[Risk] Imports may break** if a re-export is missed in the barrel file → **Mitigation**: Run full test suite after each split, commit only after all tests pass
- **[Risk] Circular dependencies** from cross-referencing between extracted modules → **Mitigation**: Map dependency graph before splitting; enforce one-directional imports via ESLint `import/no-cycle`
- **[Risk] Split creates noise in git blame** → **Mitigation**: Use `git diff --ignore-all-space` for review; include `git blame` hints in commit messages; split in focused commits per file (not one mega-commit)
- **[Risk] Merge conflicts with active branches** → **Mitigation**: Schedule this change when other feature branches are minimal; split files in dependency order (leaves first, roots last)
- **[Trade-off] More files means more imports in the barrel** → Acceptable: barrel files are the public API surface; clearly documented exports improve discoverability
