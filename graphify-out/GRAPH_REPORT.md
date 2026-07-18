# Graph Report - pine-framework  (2026-07-18)

## Corpus Check
- 142 files · ~160,013 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 199 nodes · 712 edges · 13 communities (5 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `da32d41f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- parser.ts
- ExecutionEngine
- Tokenizer
- execution-engine.ts
- .executeExpression
- .consume
- .match
- Parser
- .previous
- .parseReturnStatement
- MemberExpressionNode
- ParenthesizedExpressionNode

## God Nodes (most connected - your core abstractions)
1. `Parser` - 62 edges
2. `ExecutionEngine` - 55 edges
3. `Tokenizer` - 22 edges
4. `ExpressionNode` - 18 edges
5. `Token` - 9 edges
6. `StatementNode` - 8 edges
7. `FunctionExpressionNode` - 8 edges
8. `TokenType` - 7 edges
9. `ProgramNode` - 6 edges
10. `VariableDeclarationNode` - 6 edges

## Surprising Connections (you probably didn't know these)
- `ExecutionEngine` --references--> `ProgramNode`  [EXTRACTED]
  src/language/runtime/execution-engine.ts → src/language/parser/ast/nodes.ts
- `ExecutionEngine` --references--> `FunctionExpressionNode`  [EXTRACTED]
  src/language/runtime/execution-engine.ts → src/language/parser/ast/nodes.ts
- `ParseResult` --references--> `Token`  [EXTRACTED]
  src/language/parser/parser.ts → src/language/parser/tokenizer.ts
- `Parser` --references--> `Token`  [EXTRACTED]
  src/language/parser/parser.ts → src/language/parser/tokenizer.ts
- `ParseResult` --references--> `ProgramNode`  [EXTRACTED]
  src/language/parser/parser.ts → src/language/parser/ast/nodes.ts

## Import Cycles
- None detected.

## Communities (13 total, 8 thin omitted)

### Community 0 - "parser.ts"
Cohesion: 0.09
Nodes (23): ArgumentNode, ArrayExpressionNode, BinaryExpressionNode, BooleanLiteralNode, BreakStatementNode, ColorLiteralNode, ContinueStatementNode, ExportStatementNode (+15 more)

### Community 2 - "Tokenizer"
Cohesion: 0.24
Nodes (3): extractVersion(), KEYWORDS, Tokenizer

### Community 3 - "execution-engine.ts"
Cohesion: 0.09
Nodes (17): IdentifierNode, NaLiteralNode, NumberLiteralNode, StringLiteralNode, UnaryExpressionNode, AlertConditionEntry, AlertTriggerEntry, BoxEntry (+9 more)

### Community 4 - ".executeExpression"
Cohesion: 0.13
Nodes (10): AssignmentNode, CallExpressionNode, ExpressionStatementNode, ForStatementNode, FunctionExpressionNode, IfStatementNode, StatementNode, SwitchStatementNode (+2 more)

## Knowledge Gaps
- **16 isolated node(s):** `ImportStatementNode`, `ExportStatementNode`, `LiteralNode`, `KEYWORDS`, `ExecutionContext` (+11 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ExecutionEngine` connect `ExecutionEngine` to `parser.ts`, `execution-engine.ts`, `.executeExpression`, `.parseReturnStatement`, `MemberExpressionNode`, `ParenthesizedExpressionNode`?**
  _High betweenness centrality (0.250) - this node is a cross-community bridge._
- **Why does `Tokenizer` connect `Tokenizer` to `parser.ts`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `Parser` connect `Parser` to `parser.ts`, `Tokenizer`, `.consume`, `.match`, `.previous`, `.parseExpression`, `.parseReturnStatement`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **What connects `ImportStatementNode`, `ExportStatementNode`, `LiteralNode` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `parser.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0944741532976827 - nodes in this community are weakly interconnected._
- **Should `ExecutionEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.13538461538461538 - nodes in this community are weakly interconnected._
- **Should `execution-engine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._