import type { ExecutionEngine } from '../execution-engine.js';
import type { TableEntry } from '../execution-types.js';
import { NA, isNa, pineTruthy, type PineValue } from '../../types/na.js';

export function registerOtherBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set(
    'input.int',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? 0;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
        if (typeof na.title === 'string')
          eng.inputs.set(na.title, { type: 'int', default: defaultVal });
      }
      return isNa(defaultVal) ? 0 : defaultVal;
    },
  );

  eng.builtins.set(
    'input.float',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? 0;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
        if (typeof na.title === 'string')
          eng.inputs.set(na.title, { type: 'float', default: defaultVal });
      }
      return isNa(defaultVal) ? 0 : defaultVal;
    },
  );

  eng.builtins.set(
    'input.color',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? '#2196f3';
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? '#2196f3' : defaultVal;
    },
  );

  eng.builtins.set(
    'input.bool',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? false;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? false : defaultVal;
    },
  );

  eng.builtins.set(
    'input.string',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? '';
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? '' : defaultVal;
    },
  );

  eng.builtins.set(
    'input.time',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? 0;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? 0 : defaultVal;
    },
  );

  eng.builtins.set(
    'input.timeframe',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? '';
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? '' : defaultVal;
    },
  );

  eng.builtins.set(
    'input.source',
    (defaultValOrNamed?: PineValue, _namedOrNamed?: PineValue): PineValue => {
      let defaultVal: PineValue = defaultValOrNamed ?? 0;
      if (
        typeof defaultValOrNamed === 'object' &&
        defaultValOrNamed !== null &&
        !Array.isArray(defaultValOrNamed)
      ) {
        const na = defaultValOrNamed as unknown as Record<string, PineValue>;
        if (na.defval !== undefined) defaultVal = na.defval;
      }
      return isNa(defaultVal) ? 0 : defaultVal;
    },
  );

  eng.builtins.set('input', (...args: PineValue[]): PineValue => {
    let defaultVal: PineValue = args[0] ?? 0;
    if (
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0])
    ) {
      const na = args[0] as unknown as Record<string, PineValue>;
      if (na.defval !== undefined) defaultVal = na.defval;
      if (typeof na.title === 'string')
        eng.inputs.set(na.title, { type: 'source', default: defaultVal });
    }
    return isNa(defaultVal) ? 0 : defaultVal;
  });

  eng.builtins.set('na', (value: PineValue): PineValue => {
    return isNa(value);
  });

  // Type cast builtins
  eng.builtins.set('int', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    if (typeof value === 'number') return Math.trunc(value);
    if (typeof value === 'string') {
      const n = Number(value);
      return isNaN(n) ? NA : Math.trunc(n);
    }
    if (typeof value === 'boolean') return value ? 1 : 0;
    return NA;
  });

  eng.builtins.set('float', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      return isNaN(n) ? NA : n;
    }
    if (typeof value === 'boolean') return value ? 1.0 : 0.0;
    return NA;
  });

  eng.builtins.set('bool', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    return NA;
  });

  eng.builtins.set('string', (value: PineValue): PineValue => {
    if (isNa(value)) return NA;
    return String(value);
  });

  // ── Table builtins ─────────────────────────────────────────────────────
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

  // Position namespace builtins (for table position)
  eng.builtins.set('position.top_left', 0);
  eng.builtins.set('position.top_center', 1);
  eng.builtins.set('position.top_right', 2);
  eng.builtins.set('position.middle_left', 3);
  eng.builtins.set('position.middle_center', 4);
  eng.builtins.set('position.middle_right', 5);
  eng.builtins.set('position.bottom_left', 6);
  eng.builtins.set('position.bottom_center', 7);
  eng.builtins.set('position.bottom_right', 8);

  // Size namespace builtins (for table/text size)
  eng.builtins.set('size.auto', 'auto');
  eng.builtins.set('size.tiny', 'tiny');
  eng.builtins.set('size.small', 'small');
  eng.builtins.set('size.normal', 'normal');
  eng.builtins.set('size.large', 'large');
  eng.builtins.set('size.huge', 'huge');

  // Text alignment builtins
  eng.builtins.set('text.align_left', 'left');
  eng.builtins.set('text.align_center', 'center');
  eng.builtins.set('text.align_right', 'right');

  eng.builtins.set('box', (_arg?: PineValue): PineValue => {
    return NA;
  });

  eng.builtins.set(
    'box.new',
    (
      left: PineValue,
      top: PineValue,
      right: PineValue,
      bottom: PineValue,
      namedArgs?: Record<string, PineValue>,
    ): PineValue => {
      if (isNa(left) || isNa(top) || isNa(right) || isNa(bottom)) return NA;
      let borderColor = '#00000000';
      let bgcolor = '#2196f380';
      if (typeof namedArgs === 'object' && namedArgs !== null) {
        if (typeof namedArgs.border_color === 'string') borderColor = namedArgs.border_color;
        if (typeof namedArgs.bgcolor === 'string') bgcolor = namedArgs.bgcolor;
      }
      const id = ++eng.boxIdCounter;
      eng.boxes.set(id, {
        left: left as number,
        top: top as number,
        right: right as number,
        bottom: bottom as number,
        border_color: borderColor,
        bgcolor,
      });
      return id;
    },
  );

  eng.builtins.set('nz', (value: PineValue, fallback?: PineValue): PineValue => {
    if (isNa(value)) return fallback !== undefined ? fallback : 0;
    return value;
  });

  eng.builtins.set('request.security', (...args: PineValue[]): PineValue => {
    return args.length > 2 ? args[2]! : NA;
  });

  eng.builtins.set('array.new_float', (_size: PineValue): PineValue => {
    return [];
  });

  eng.builtins.set('array.new_int', (_size: PineValue): PineValue => {
    return [];
  });

  eng.builtins.set('array.new_line', (_size: PineValue): PineValue => {
    return [];
  });

  // Generic array.new<T>(size) - used as array.new<T>(size)
  eng.builtins.set('array.new', (_size: PineValue): PineValue => {
    return [];
  });

  // array.from(...values) - create array from values
  eng.builtins.set('array.from', (...values: PineValue[]): PineValue => {
    return values;
  });

  eng.builtins.set(
    'line.new',
    (
      x1: PineValue,
      y1: PineValue,
      x2: PineValue,
      y2: PineValue,
      namedArgs?: Record<string, PineValue>,
    ): PineValue => {
      if (isNa(x1) || isNa(y1) || isNa(x2) || isNa(y2)) {
        return 0;
      }
      let colorStr = '#2196f3';
      let styleStr = 'solid';
      let widthNum = 1;
      let xlocStr = 'bar_index';
      if (typeof namedArgs === 'object' && namedArgs !== null) {
        if (typeof namedArgs.color === 'string') colorStr = namedArgs.color;
        if (typeof namedArgs.style === 'string') styleStr = namedArgs.style;
        if (typeof namedArgs.width === 'number') widthNum = namedArgs.width;
        if (typeof namedArgs.xloc === 'string') xlocStr = namedArgs.xloc;
      }
      const id = eng.lineIdCounter++;
      eng.lines.set(id, {
        x1: x1 as number,
        y1: y1 as number,
        x2: x2 as number,
        y2: y2 as number,
        color: colorStr,
        style: styleStr,
        width: widthNum,
        xloc: xlocStr,
      });
      return id;
    },
  );

  eng.builtins.set('line.delete', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number' && eng.lines.has(lineId)) {
      eng.lines.delete(lineId);
    }
    return 0;
  });

  eng.builtins.set('line.get_x2', (lineId: PineValue): PineValue => {
    if (typeof lineId === 'number') {
      const line = eng.lines.get(lineId);
      if (line) return line.x2;
    }
    return 0;
  });

  eng.builtins.set(
    'label.new',
    (
      x: PineValue,
      y: PineValue,
      text: PineValue,
      namedArgs?: Record<string, PineValue>,
    ): PineValue => {
      if (isNa(x) || isNa(y) || isNa(text)) return 0;
      let colorStr = '#2196f3';
      let textcolorStr = '#ffffff';
      let styleStr = 'label.style_label_down';
      let sizeStr = 'size.normal';
      if (typeof namedArgs === 'object' && namedArgs !== null) {
        if (typeof namedArgs.color === 'string') colorStr = namedArgs.color;
        if (typeof namedArgs.textcolor === 'string') textcolorStr = namedArgs.textcolor;
        if (typeof namedArgs.style === 'string') styleStr = namedArgs.style;
        if (typeof namedArgs.size === 'string') sizeStr = namedArgs.size;
      }
      // Member expression resolution strips prefixes: label.style_label_down → style_label_down
      if (!styleStr.startsWith('label.')) styleStr = 'label.' + styleStr;
      if (!sizeStr.startsWith('size.')) sizeStr = 'size.' + sizeStr;
      eng.labels.push({
        time: eng.currentTimestamp,
        price: y as number,
        text: String(text),
        color: colorStr,
        textcolor: textcolorStr,
        style: styleStr,
        size: sizeStr,
      });
      return 0;
    },
  );

  eng.builtins.set('alertcondition', (...args: PineValue[]): PineValue => {
    const namedArgs =
      args.length > 0 &&
      typeof args[args.length - 1] === 'object' &&
      !Array.isArray(args[args.length - 1])
        ? (args[args.length - 1] as unknown as Record<string, PineValue>)
        : {};
    const condition = args[0] ?? NA;
    const titleVal = namedArgs['title'];
    const msgVal = namedArgs['message'];
    const title =
      typeof titleVal === 'string' ? titleVal : `Alert ${eng.alertConditionEntries.length + 1}`;
    const message = typeof msgVal === 'string' ? msgVal : title;
    const existing = eng.alertConditionEntries.find((e: { title: string }) => e.title === title);
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      id = `alert_${eng.alertConditionEntries.length + 1}`;
      eng.alertConditionEntries.push({ id, title, message });
    }
    if (pineTruthy(condition) && eng.currentContext) {
      eng.alertTriggers.push({
        alertId: id,
        barIndex: eng.currentContext.barIndex,
        timestamp: eng.currentContext.timestamp,
      });
      eng.trimAlertArrays();
    }
    return NA;
  });

  eng.builtins.set('alert', (...args: PineValue[]): PineValue => {
    const message = typeof args[0] === 'string' ? args[0] : 'Alert triggered';
    if (eng.currentContext) {
      eng.alertTriggers.push({
        alertId: message,
        barIndex: eng.currentContext.barIndex,
        timestamp: eng.currentContext.timestamp,
      });
      eng.trimAlertArrays();
    }
    return NA;
  });
}
