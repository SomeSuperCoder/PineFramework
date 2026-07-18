# Graph Report - pine-framework  (2026-07-18)

## Corpus Check
- 142 files · ~160,276 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 199 nodes · 650 edges · 14 communities (7 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `94c4994e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- parser.ts
- ExecutionEngine
- Tokenizer
- execution-engine.ts
- .consume
- .match
- Parser
- .parseExpression
- ParenthesizedExpressionNode
- .parseProgram

## God Nodes (most connected - your core abstractions)
1. `Parser` - 62 edges
2. `ExecutionEngine` - 53 edges
3. `Tokenizer` - 22 edges
4. `ExpressionNode` - 15 edges
5. `Token` - 9 edges
6. `TokenType` - 7 edges
7. `StatementNode` - 6 edges
8. `ArgumentNode` - 5 edges
9. `ParameterNode` - 5 edges
10. `ProgramNode` - 4 edges

## Surprising Connections (you probably didn't know these)
- `ParseResult` --references--> `Token`  [EXTRACTED]
  src/language/parser/parser.ts → src/language/parser/tokenizer.ts
- `Parser` --references--> `Token`  [EXTRACTED]
  src/language/parser/parser.ts → src/language/parser/tokenizer.ts
- `ParseResult` --references--> `ProgramNode`  [EXTRACTED]
  src/language/parser/parser.ts → src/language/parser/ast/nodes.ts

## Import Cycles
- None detected.

## Communities (14 total, 7 thin omitted)

### Community 0 - "parser.ts"
Cohesion: 0.09
Nodes (39): ArgumentNode, ArrayExpressionNode, AssignmentNode, BinaryExpressionNode, BooleanLiteralNode, BreakStatementNode, CallExpressionNode, ColorLiteralNode (+31 more)

### Community 3 - "execution-engine.ts"
Cohesion: 0.15
Nodes (12): AlertConditionEntry, AlertTriggerEntry, BoxEntry, ExecutionContext, ExecutionMetrics, ExecutionResult, ExecutionSnapshot, FormingCandleResult (+4 more)

### Community 13 - ".parseProgram"
Cohesion: 0.33
Nodes (3): extractVersion(), KEYWORDS, TokenType

## Knowledge Gaps
- **17 isolated node(s):** `ExecutionContext`, `ShapeEntry`, `LineEntry`, `LabelEntry`, `BoxEntry` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Parser` connect `Parser` to `parser.ts`, `.consume`, `.match`, `.previous`, `.parseExpression`, `ParenthesizedExpressionNode`, `.parseProgram`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `Tokenizer` connect `Tokenizer` to `parser.ts`, `.parseProgram`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Why does `ExecutionEngine` connect `ExecutionEngine` to `MemberExpressionNode`, `.parseReturnStatement`, `execution-engine.ts`, `.executeExpression`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **What connects `ExecutionContext`, `ShapeEntry`, `LineEntry` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `parser.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08826945412311266 - nodes in this community are weakly interconnected._
- **Should `MemberExpressionNode` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._