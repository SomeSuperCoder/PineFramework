# Module Boundaries and Responsibilities

## Language Processing Layer

- **Parser**: Language syntax to AST conversion
- **Compiler**: AST validation and IR generation
- **Type System**: Type checking and coercion
- **AST Walker**: Tree traversal and transformation

## Execution Layer

- **Interpreter** (split into `statement-executor.ts` and `expression-executor.ts` for maintainability): Pine script execution environment; `expression-executor.ts` handles expression evaluation (binary ops, member access, index expressions, function calls), `statement-executor.ts` handles statement-level execution (variable declarations, if/else, for loops, switch, return)
- **State Management**: Series and variable state
- **Scope Manager**: Variable scope handling
- **Error Handler**: Exception and rollback management

## Data Layer

- **Data Engine**: OHLCV data management
- **Request System**: Multi-symbol data access
- **Cache Manager**: Data caching and invalidation
- **Alignment Engine**: Data alignment across timeframes

## Analysis Layer

- **TA Engine**: Technical indicator calculations
- **Math Library**: Mathematical function implementations
- **Statistical Functions**: Statistical calculations
- **Optimization Engine**: Performance optimization

## Rendering Layer

- **Plot Engine**: Basic plot rendering
- **Drawing Engine**: Object drawing
- **Renderer**: Final visual output
- **Layout Manager**: Visual element arrangement

## Strategy Layer

- **Strategy Engine**: Order and position management
- **Backtest Engine**: Historical strategy testing
- **Performance Calculator**: Metrics calculation
- **Report Generator**: Result reporting

## Extensibility Layer

- **Plugin Registry**: Plugin management
- **Interface Validator**: Plugin interface validation
- **Dependency Resolver**: Plugin dependency handling
- **Version Manager**: Plugin version compatibility
