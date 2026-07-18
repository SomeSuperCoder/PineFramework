import type { SourceSpan } from '../../../common/source-location.js';

export type ScriptKind = 'indicator' | 'strategy' | 'library';

export interface ProgramNode {
  kind: 'Program';
  span: SourceSpan;
  version: number;
  scriptKind: ScriptKind;
  scriptName: string;
  scriptArgs: ArgumentNode[];
  body: StatementNode[];
}

export interface ArgumentNode {
  kind: 'Argument';
  span: SourceSpan;
  name: string;
  value: ExpressionNode;
}

export type StatementNode =
  | VariableDeclarationNode
  | AssignmentNode
  | ExpressionStatementNode
  | IfStatementNode
  | ForStatementNode
  | WhileStatementNode
  | SwitchStatementNode
  | TypeDeclarationNode
  | ImportStatementNode
  | ExportStatementNode
  | ReturnStatementNode
  | BreakStatementNode
  | ContinueStatementNode;

export interface VariableDeclarationNode {
  kind: 'VariableDeclaration';
  span: SourceSpan;
  name: string;
  typeAnnotation?: TypeAnnotationNode;
  initializer?: ExpressionNode;
  isVar: boolean;
  isVarip: boolean;
  isConst: boolean;
}

export interface AssignmentNode {
  kind: 'Assignment';
  span: SourceSpan;
  target: ExpressionNode;
  operator: ':=' | '=' | '+=' | '-=' | '*=' | '/=';
  value: ExpressionNode;
}

export interface ExpressionStatementNode {
  kind: 'ExpressionStatement';
  span: SourceSpan;
  expression: ExpressionNode;
}

export interface IfStatementNode {
  kind: 'IfStatement';
  span: SourceSpan;
  condition: ExpressionNode;
  thenBranch: StatementNode[];
  elseBranch?: StatementNode[];
}

export interface ForStatementNode {
  kind: 'ForStatement';
  span: SourceSpan;
  variable: string;
  start?: ExpressionNode;
  end?: ExpressionNode;
  step?: ExpressionNode;
  iterable?: ExpressionNode;
  isForIn?: boolean;
  body: StatementNode[];
}

export interface WhileStatementNode {
  kind: 'WhileStatement';
  span: SourceSpan;
  condition: ExpressionNode;
  body: StatementNode[];
}

export interface SwitchCaseNode {
  kind: 'SwitchCase';
  span: SourceSpan;
  value?: ExpressionNode;
  body: StatementNode[];
}

export interface SwitchStatementNode {
  kind: 'SwitchStatement';
  span: SourceSpan;
  expression: ExpressionNode;
  cases: SwitchCaseNode[];
  defaultCase?: StatementNode[];
}

export interface SwitchExpressionCaseNode {
  kind: 'SwitchExpressionCase';
  span: SourceSpan;
  value?: ExpressionNode;
  result: ExpressionNode;
}

export interface SwitchExpressionNode {
  kind: 'SwitchExpression';
  span: SourceSpan;
  expression: ExpressionNode;
  cases: SwitchExpressionCaseNode[];
}

export interface TypeDeclarationNode {
  kind: 'TypeDeclaration';
  span: SourceSpan;
  name: string;
  fields: TypeFieldNode[];
}

export interface TypeFieldNode {
  kind: 'TypeField';
  span: SourceSpan;
  name: string;
  typeAnnotation: TypeAnnotationNode;
  defaultValue?: ExpressionNode;
}

export interface ImportStatementNode {
  kind: 'ImportStatement';
  span: SourceSpan;
  path: string;
  alias?: string;
}

export interface ExportStatementNode {
  kind: 'ExportStatement';
  span: SourceSpan;
  name: string;
}

export interface ReturnStatementNode {
  kind: 'ReturnStatement';
  span: SourceSpan;
  value?: ExpressionNode;
}

export interface BreakStatementNode {
  kind: 'BreakStatement';
  span: SourceSpan;
}

export interface ContinueStatementNode {
  kind: 'ContinueStatement';
  span: SourceSpan;
}

export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | BinaryExpressionNode
  | UnaryExpressionNode
  | TernaryExpressionNode
  | CallExpressionNode
  | MemberExpressionNode
  | IndexExpressionNode
  | ArrayExpressionNode
  | MapExpressionNode
  | FunctionExpressionNode
  | ParenthesizedExpressionNode
  | SwitchExpressionNode;

export type LiteralNode =
  | NumberLiteralNode
  | StringLiteralNode
  | BooleanLiteralNode
  | ColorLiteralNode
  | NaLiteralNode;

export interface NumberLiteralNode {
  kind: 'NumberLiteral';
  span: SourceSpan;
  value: number;
  isFloat: boolean;
}

export interface StringLiteralNode {
  kind: 'StringLiteral';
  span: SourceSpan;
  value: string;
}

export interface BooleanLiteralNode {
  kind: 'BooleanLiteral';
  span: SourceSpan;
  value: boolean;
}

export interface ColorLiteralNode {
  kind: 'ColorLiteral';
  span: SourceSpan;
  value: string;
}

export interface NaLiteralNode {
  kind: 'NaLiteral';
  span: SourceSpan;
}

export interface IdentifierNode {
  kind: 'Identifier';
  span: SourceSpan;
  name: string;
}

export interface BinaryExpressionNode {
  kind: 'BinaryExpression';
  span: SourceSpan;
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryExpressionNode {
  kind: 'UnaryExpression';
  span: SourceSpan;
  operator: string;
  operand: ExpressionNode;
  prefix: boolean;
}

export interface TernaryExpressionNode {
  kind: 'TernaryExpression';
  span: SourceSpan;
  condition: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
}

export interface CallExpressionNode {
  kind: 'CallExpression';
  span: SourceSpan;
  callee: ExpressionNode;
  arguments: ExpressionNode[];
  namedArguments: ArgumentNode[];
  callId: number;
}

export interface MemberExpressionNode {
  kind: 'MemberExpression';
  span: SourceSpan;
  object: ExpressionNode;
  property: string;
  typeArguments?: TypeAnnotationNode[];
}

export interface IndexExpressionNode {
  kind: 'IndexExpression';
  span: SourceSpan;
  object: ExpressionNode;
  index: ExpressionNode;
}

export interface ArrayExpressionNode {
  kind: 'ArrayExpression';
  span: SourceSpan;
  elements: ExpressionNode[];
}

export interface MapEntryNode {
  kind: 'MapEntry';
  span: SourceSpan;
  key: ExpressionNode;
  value: ExpressionNode;
}

export interface MapExpressionNode {
  kind: 'MapExpression';
  span: SourceSpan;
  entries: MapEntryNode[];
}

export interface ParameterNode {
  kind: 'Parameter';
  span: SourceSpan;
  name: string;
  typeAnnotation?: TypeAnnotationNode;
  defaultValue?: ExpressionNode;
}

export interface FunctionExpressionNode {
  kind: 'FunctionExpression';
  span: SourceSpan;
  name?: string;
  parameters: ParameterNode[];
  returnType?: TypeAnnotationNode;
  body: StatementNode[];
}

export interface ParenthesizedExpressionNode {
  kind: 'ParenthesizedExpression';
  span: SourceSpan;
  expression: ExpressionNode;
}

export interface TypeAnnotationNode {
  kind: 'TypeAnnotation';
  span: SourceSpan;
  name: string;
  typeArguments?: TypeAnnotationNode[];
  isSeries: boolean;
  isArray: boolean;
  isMap: boolean;
}
