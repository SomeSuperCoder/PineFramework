import type { ExecutionEngine } from '../execution-engine.js';
import type { TableEntry } from '../execution-types.js';
import { NA, type PineValue } from '../../types/na.js';

export function registerTableBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  // table.new(position, columns, rows, ...namedArgs) → table ID
  eng.builtins.set('table.new', (...args: PineValue[]): PineValue => {
    const namedArgs =
      args.length > 0 &&
      typeof args[args.length - 1] === 'object' &&
      !Array.isArray(args[args.length - 1])
        ? (args[args.length - 1] as unknown as Record<string, PineValue>)
        : {};
    const position = typeof args[0] === 'number' ? args[0] : 0;
    const columns = typeof args[1] === 'number' ? Math.max(1, Math.trunc(args[1] as number)) : 1;
    const rows = typeof args[2] === 'number' ? Math.max(1, Math.trunc(args[2] as number)) : 1;
    const id = ++eng.tableIdCounter;
    const table: TableEntry = {
      position,
      columns,
      rows,
      bgcolor: typeof namedArgs.bgcolor === 'string' ? namedArgs.bgcolor : '#00000000',
      border_color: typeof namedArgs.border_color === 'string' ? namedArgs.border_color : '#00000000',
      border_width: typeof namedArgs.border_width === 'number' ? namedArgs.border_width : 1,
      frame_color: typeof namedArgs.frame_color === 'string' ? namedArgs.frame_color : '#00000000',
      frame_width: typeof namedArgs.frame_width === 'number' ? namedArgs.frame_width : 1,
      cells: {},
    };
    eng.tables.set(id, table);
    return id;
  });

  // table.cell(table_id, column, row, text, ...namedArgs)
  eng.builtins.set('table.cell', (...args: PineValue[]): PineValue => {
    const tableId = typeof args[0] === 'number' ? args[0] : 0;
    const column = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const row = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    const text = typeof args[3] === 'string' ? args[3] : '';
    const namedArgs =
      args.length > 0 &&
      typeof args[args.length - 1] === 'object' &&
      !Array.isArray(args[args.length - 1])
        ? (args[args.length - 1] as unknown as Record<string, PineValue>)
        : {};
    const table = eng.tables.get(tableId);
    if (!table) return NA;
    const key = `${row},${column}`;
    const existing = table.cells[key];
    table.cells[key] = {
      text,
      text_color: typeof namedArgs.text_color === 'string' ? namedArgs.text_color : (existing?.text_color ?? '#000000'),
      text_halign: typeof namedArgs.text_halign === 'string' ? namedArgs.text_halign : (existing?.text_halign ?? 'center'),
      text_valign: typeof namedArgs.text_valign === 'string' ? namedArgs.text_valign : (existing?.text_valign ?? 'center'),
      bgcolor: typeof namedArgs.bgcolor === 'string' ? namedArgs.bgcolor : (existing?.bgcolor ?? '#00000000'),
      width: typeof namedArgs.width === 'number' ? namedArgs.width : (existing?.width ?? 0),
      text_size: typeof namedArgs.text_size === 'string' ? namedArgs.text_size : (existing?.text_size ?? 'normal'),
      tooltip: typeof namedArgs.tooltip === 'string' ? namedArgs.tooltip : '',
    };
    return NA;
  });

  eng.builtins.set('table.get_cell_text', (...args: PineValue[]): PineValue => {
    const tableId = typeof args[0] === 'number' ? args[0] : 0;
    const column = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const row = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    const table = eng.tables.get(tableId);
    if (!table) return '';
    const cell = table.cells[`${row},${column}`];
    return cell ? cell.text : '';
  });

  eng.builtins.set('table.get_cell_text_color', (...args: PineValue[]): PineValue => {
    const tableId = typeof args[0] === 'number' ? args[0] : 0;
    const column = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const row = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    const table = eng.tables.get(tableId);
    if (!table) return '';
    const cell = table.cells[`${row},${column}`];
    return cell ? cell.text_color : '';
  });

  eng.builtins.set('table.get_cell_bgcolor', (...args: PineValue[]): PineValue => {
    const tableId = typeof args[0] === 'number' ? args[0] : 0;
    const column = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const row = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    const table = eng.tables.get(tableId);
    if (!table) return '';
    const cell = table.cells[`${row},${column}`];
    return cell ? cell.bgcolor : '';
  });

  // table.set_cell_text(table_id, column, row, text)
  eng.builtins.set('table.set_cell_text', (...args: PineValue[]): PineValue => {
    const tableId = typeof args[0] === 'number' ? args[0] : 0;
    const column = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const row = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    const text = typeof args[3] === 'string' ? args[3] : '';
    const table = eng.tables.get(tableId);
    if (!table) return NA;
    const key = `${row},${column}`;
    if (!table.cells[key]) {
      table.cells[key] = { text, text_color: '#000000', text_halign: 'center', text_valign: 'center', bgcolor: '#00000000', width: 0, text_size: 'normal', tooltip: '' };
    } else {
      table.cells[key].text = text;
    }
    return NA;
  });

  eng.builtins.set('table.set_cell_text_color', (...args: PineValue[]): PineValue => {
    const tableId = typeof args[0] === 'number' ? args[0] : 0;
    const column = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const row = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    const color = typeof args[3] === 'string' ? args[3] : '#000000';
    const table = eng.tables.get(tableId);
    if (!table) return NA;
    const key = `${row},${column}`;
    if (!table.cells[key]) {
      table.cells[key] = { text: '', text_color: color, text_halign: 'center', text_valign: 'center', bgcolor: '#00000000', width: 0, text_size: 'normal', tooltip: '' };
    } else {
      table.cells[key].text_color = color;
    }
    return NA;
  });

  eng.builtins.set('table.set_cell_bgcolor', (...args: PineValue[]): PineValue => {
    const tableId = typeof args[0] === 'number' ? args[0] : 0;
    const column = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const row = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    const color = typeof args[3] === 'string' ? args[3] : '#00000000';
    const table = eng.tables.get(tableId);
    if (!table) return NA;
    const key = `${row},${column}`;
    if (!table.cells[key]) {
      table.cells[key] = { text: '', text_color: '#000000', text_halign: 'center', text_valign: 'center', bgcolor: color, width: 0, text_size: 'normal', tooltip: '' };
    } else {
      table.cells[key].bgcolor = color;
    }
    return NA;
  });

  eng.builtins.set('table.set_cell_width', (...args: PineValue[]): PineValue => {
    const tableId = typeof args[0] === 'number' ? args[0] : 0;
    const column = typeof args[1] === 'number' ? Math.trunc(args[1] as number) : 0;
    const row = typeof args[2] === 'number' ? Math.trunc(args[2] as number) : 0;
    const width = typeof args[3] === 'number' ? args[3] : 0;
    const table = eng.tables.get(tableId);
    if (!table) return NA;
    const key = `${row},${column}`;
    if (!table.cells[key]) {
      table.cells[key] = { text: '', text_color: '#000000', text_halign: 'center', text_valign: 'center', bgcolor: '#00000000', width, text_size: 'normal', tooltip: '' };
    } else {
      table.cells[key].width = width;
    }
    return NA;
  });
}
