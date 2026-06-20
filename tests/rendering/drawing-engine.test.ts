import { DrawingEngine, resetDrawingIdCounter } from '../../src/rendering/drawing-engine.js';

describe('DrawingEngine', () => {
  let engine: DrawingEngine;

  beforeEach(() => {
    resetDrawingIdCounter();
    engine = new DrawingEngine();
  });

  describe('lineNew', () => {
    it('should create a line with default options', () => {
      const line = engine.lineNew(0, 100, 10, 200);

      expect(line).toBeDefined();
      expect(line.x1).toBe(0);
      expect(line.y1).toBe(100);
      expect(line.x2).toBe(10);
      expect(line.y2).toBe(200);
      expect(line.color.r).toBe(0);
      expect(line.color.g).toBe(0);
      expect(line.color.b).toBe(0);
      expect(line.width).toBe(1);
      expect(line.style).toBe('solid');
      expect(line.extend).toBe('none');
      expect(line.xloc).toBe('bar_index');
      expect(line.editable).toBe(true);
      expect(line.fillgaps).toBe(false);
    });

    it('should create a line with custom color', () => {
      const line = engine.lineNew(0, 100, 10, 200, { color: '#FF0000' });

      expect(line.color.r).toBe(255);
      expect(line.color.g).toBe(0);
      expect(line.color.b).toBe(0);
    });

    it('should create a line with custom width', () => {
      const line = engine.lineNew(0, 100, 10, 200, { width: 3 });

      expect(line.width).toBe(3);
    });

    it('should create a line with custom style', () => {
      const line = engine.lineNew(0, 100, 10, 200, { style: 'dashed' });

      expect(line.style).toBe('dashed');
    });

    it('should create a line with custom extend', () => {
      const line = engine.lineNew(0, 100, 10, 200, { extend: 'both' });

      expect(line.extend).toBe('both');
    });

    it('should create a line with custom xloc', () => {
      const line = engine.lineNew(0, 100, 10, 200, { xloc: 'bar_time' });

      expect(line.xloc).toBe('bar_time');
    });

    it('should create a line with custom editable', () => {
      const line = engine.lineNew(0, 100, 10, 200, { editable: false });

      expect(line.editable).toBe(false);
    });

    it('should create a line with custom fillgaps', () => {
      const line = engine.lineNew(0, 100, 10, 200, { fillgaps: true });

      expect(line.fillgaps).toBe(true);
    });

    it('should handle na values', () => {
      const line = engine.lineNew(null, null, null, null);

      expect(line.x1).toBe(0);
      expect(line.y1).toBe(0);
      expect(line.x2).toBe(0);
      expect(line.y2).toBe(0);
    });

    it('should store line in the engine', () => {
      const line = engine.lineNew(0, 100, 10, 200);

      const output = engine.getOutput();
      expect(output.lines.size).toBe(1);
      expect(output.lines.get(line.id)).toBeDefined();
    });
  });

  describe('lineSetLine', () => {
    it('should update line coordinates', () => {
      const line = engine.lineNew(0, 100, 10, 200);

      engine.lineSetLine(line.id, 5, 150, 15, 250);

      expect(line.x1).toBe(5);
      expect(line.y1).toBe(150);
      expect(line.x2).toBe(15);
      expect(line.y2).toBe(250);
    });

    it('should not update with na values', () => {
      const line = engine.lineNew(0, 100, 10, 200);

      engine.lineSetLine(line.id, null, null, null, null);

      expect(line.x1).toBe(0);
      expect(line.y1).toBe(100);
      expect(line.x2).toBe(10);
      expect(line.y2).toBe(200);
    });
  });

  describe('lineDelete', () => {
    it('should delete a line', () => {
      const line = engine.lineNew(0, 100, 10, 200);

      engine.lineDelete(line.id);

      const output = engine.getOutput();
      expect(output.lines.size).toBe(0);
    });
  });

  describe('boxNew', () => {
    it('should create a box with default options', () => {
      const box = engine.boxNew(0, 200, 10, 100);

      expect(box).toBeDefined();
      expect(box.left).toBe(0);
      expect(box.top).toBe(200);
      expect(box.right).toBe(10);
      expect(box.bottom).toBe(100);
      expect(box.border_color.r).toBe(0);
      expect(box.border_color.g).toBe(0);
      expect(box.border_color.b).toBe(0);
      expect(box.border_width).toBe(1);
      expect(box.border_style).toBe('solid');
      expect(box.extend_left).toBe(false);
      expect(box.extend_right).toBe(false);
      expect(box.extend_top).toBe(false);
      expect(box.extend_bottom).toBe(false);
      expect(box.xloc).toBe('bar_index');
      expect(box.text).toBe('');
    });

    it('should create a box with custom colors', () => {
      const box = engine.boxNew(0, 200, 10, 100, {
        border_color: '#FF0000',
        bgcolor: '#00FF00',
      });

      expect(box.border_color.r).toBe(255);
      expect(box.border_color.g).toBe(0);
      expect(box.border_color.b).toBe(0);
      expect(box.bgcolor.r).toBe(0);
      expect(box.bgcolor.g).toBe(255);
      expect(box.bgcolor.b).toBe(0);
    });

    it('should create a box with custom border', () => {
      const box = engine.boxNew(0, 200, 10, 100, {
        border_width: 3,
        border_style: 'dashed',
      });

      expect(box.border_width).toBe(3);
      expect(box.border_style).toBe('dashed');
    });

    it('should create a box with extend options', () => {
      const box = engine.boxNew(0, 200, 10, 100, {
        extend_left: true,
        extend_right: true,
        extend_top: true,
        extend_bottom: true,
      });

      expect(box.extend_left).toBe(true);
      expect(box.extend_right).toBe(true);
      expect(box.extend_top).toBe(true);
      expect(box.extend_bottom).toBe(true);
    });

    it('should create a box with text', () => {
      const box = engine.boxNew(0, 200, 10, 100, {
        text: 'Price Zone',
        text_color: '#FFFFFF',
        text_size: 'large',
        text_halign: 'center',
        text_valign: 'middle',
      });

      expect(box.text).toBe('Price Zone');
      expect(box.text_color.r).toBe(255);
      expect(box.text_color.g).toBe(255);
      expect(box.text_color.b).toBe(255);
      expect(box.text_size).toBe('large');
      expect(box.text_halign).toBe('center');
      expect(box.text_valign).toBe('middle');
    });

    it('should create a box with custom xloc', () => {
      const box = engine.boxNew(0, 200, 10, 100, { xloc: 'bar_time' });

      expect(box.xloc).toBe('bar_time');
    });

    it('should handle na values', () => {
      const box = engine.boxNew(null, null, null, null);

      expect(box.left).toBe(0);
      expect(box.top).toBe(0);
      expect(box.right).toBe(0);
      expect(box.bottom).toBe(0);
    });

    it('should store box in the engine', () => {
      const box = engine.boxNew(0, 200, 10, 100);

      const output = engine.getOutput();
      expect(output.boxes.size).toBe(1);
      expect(output.boxes.get(box.id)).toBeDefined();
    });
  });

  describe('boxDelete', () => {
    it('should delete a box', () => {
      const box = engine.boxNew(0, 200, 10, 100);

      engine.boxDelete(box.id);

      const output = engine.getOutput();
      expect(output.boxes.size).toBe(0);
    });
  });

  describe('labelNew', () => {
    it('should create a label with default options', () => {
      const label = engine.labelNew(5, 150, 'Hello');

      expect(label).toBeDefined();
      expect(label.x).toBe(5);
      expect(label.y).toBe(150);
      expect(label.text).toBe('Hello');
      expect(label.style).toBe('label_down');
      expect(label.size).toBe('normal');
      expect(label.textalign).toBe('center');
      expect(label.xloc).toBe('bar_index');
    });

    it('should create a label with custom style', () => {
      const label = engine.labelNew(5, 150, 'Buy', { style: 'label_up' });

      expect(label.style).toBe('label_up');
    });

    it('should create a label with custom color', () => {
      const label = engine.labelNew(5, 150, 'Alert', {
        color: '#FF0000',
        textcolor: '#00FF00',
      });

      expect(label.color.r).toBe(255);
      expect(label.color.g).toBe(0);
      expect(label.color.b).toBe(0);
      expect(label.textcolor.r).toBe(0);
      expect(label.textcolor.g).toBe(255);
      expect(label.textcolor.b).toBe(0);
    });

    it('should create a label with custom size', () => {
      const label = engine.labelNew(5, 150, 'Large', { size: 'large' });

      expect(label.size).toBe('large');
    });

    it('should create a label with custom textalign', () => {
      const label = engine.labelNew(5, 150, 'Left', { textalign: 'left' });

      expect(label.textalign).toBe('left');
    });

    it('should create a label with custom xloc', () => {
      const label = engine.labelNew(5, 150, 'Time', { xloc: 'bar_time' });

      expect(label.xloc).toBe('bar_time');
    });

    it('should create a label with tooltip', () => {
      const label = engine.labelNew(5, 150, 'Tip', { tooltip: 'Tooltip text' });

      expect(label.tooltip).toBe('Tooltip text');
    });

    it('should handle na values', () => {
      const label = engine.labelNew(null, null, null);

      expect(label.x).toBe(0);
      expect(label.y).toBe(0);
      expect(label.text).toBe('');
    });

    it('should store label in the engine', () => {
      const label = engine.labelNew(5, 150, 'Test');

      const output = engine.getOutput();
      expect(output.labels.size).toBe(1);
      expect(output.labels.get(label.id)).toBeDefined();
    });
  });

  describe('labelSetXY', () => {
    it('should update label coordinates', () => {
      const label = engine.labelNew(5, 150, 'Move');

      engine.labelSetXY(label.id, 10, 200);

      expect(label.x).toBe(10);
      expect(label.y).toBe(200);
    });

    it('should not update with na values', () => {
      const label = engine.labelNew(5, 150, 'Keep');

      engine.labelSetXY(label.id, null, null);

      expect(label.x).toBe(5);
      expect(label.y).toBe(150);
    });
  });

  describe('labelSetText', () => {
    it('should update label text', () => {
      const label = engine.labelNew(5, 150, 'Old');

      engine.labelSetText(label.id, 'New');

      expect(label.text).toBe('New');
    });

    it('should update label textcolor', () => {
      const label = engine.labelNew(5, 150, 'Color');

      engine.labelSetText(label.id, 'Color', '#FF0000');

      expect(label.textcolor.r).toBe(255);
      expect(label.textcolor.g).toBe(0);
      expect(label.textcolor.b).toBe(0);
    });

    it('should update label size', () => {
      const label = engine.labelNew(5, 150, 'Size');

      engine.labelSetText(label.id, 'Size', undefined, 'large');

      expect(label.size).toBe('large');
    });
  });

  describe('labelDelete', () => {
    it('should delete a label', () => {
      const label = engine.labelNew(5, 150, 'Delete');

      engine.labelDelete(label.id);

      const output = engine.getOutput();
      expect(output.labels.size).toBe(0);
    });
  });

  describe('tableNew', () => {
    it('should create a table with default options', () => {
      const table = engine.tableNew('top_right', 3, 2);

      expect(table).toBeDefined();
      expect(table.position).toBe('top_right');
      expect(table.columns).toBe(3);
      expect(table.rows).toBe(2);
      expect(table.border_width).toBe(0);
      expect(table.frame_width).toBe(0);
    });

    it('should create a table with custom colors', () => {
      const table = engine.tableNew('bottom_left', 2, 2, {
        bgcolor: '#FF0000',
        border_color: '#00FF00',
        frame_color: '#0000FF',
      });

      expect(table.bgcolor.r).toBe(255);
      expect(table.bgcolor.g).toBe(0);
      expect(table.bgcolor.b).toBe(0);
      expect(table.border_color.r).toBe(0);
      expect(table.border_color.g).toBe(255);
      expect(table.border_color.b).toBe(0);
      expect(table.frame_color.r).toBe(0);
      expect(table.frame_color.g).toBe(0);
      expect(table.frame_color.b).toBe(255);
    });

    it('should create a table with custom border and frame', () => {
      const table = engine.tableNew('middle_center', 2, 2, {
        border_width: 2,
        frame_width: 3,
      });

      expect(table.border_width).toBe(2);
      expect(table.frame_width).toBe(3);
    });

    it('should handle na values', () => {
      const table = engine.tableNew(null, null, null);

      expect(table.position).toBe('top_right');
      expect(table.columns).toBe(1);
      expect(table.rows).toBe(1);
    });

    it('should store table in the engine', () => {
      const table = engine.tableNew('top_left', 2, 2);

      const output = engine.getOutput();
      expect(output.tables.size).toBe(1);
      expect(output.tables.get(table.id)).toBeDefined();
    });
  });

  describe('tableCellSet', () => {
    it('should set cell text', () => {
      const table = engine.tableNew('top_right', 2, 2);

      engine.tableCellSet(table.id, 0, 0, 'Hello');

      const cell = table.cells.get('0,0');
      expect(cell).toBeDefined();
      expect(cell!.text).toBe('Hello');
    });

    it('should set cell with custom options', () => {
      const table = engine.tableNew('top_right', 2, 2);

      engine.tableCellSet(table.id, 0, 0, 'Styled', {
        text_color: '#FF0000',
        text_halign: 'left',
        text_valign: 'top',
        text_size: 'large',
        bgcolor: '#00FF00',
        tooltip: 'Cell tooltip',
      });

      const cell = table.cells.get('0,0');
      expect(cell).toBeDefined();
      expect(cell!.text).toBe('Styled');
      expect(cell!.text_color.r).toBe(255);
      expect(cell!.text_halign).toBe('left');
      expect(cell!.text_valign).toBe('top');
      expect(cell!.text_size).toBe('large');
      expect(cell!.bgcolor.g).toBe(255);
      expect(cell!.tooltip).toBe('Cell tooltip');
    });

    it('should handle na values', () => {
      const table = engine.tableNew('top_right', 2, 2);

      engine.tableCellSet(table.id, null, null, null);

      const cell = table.cells.get('0,0');
      expect(cell).toBeDefined();
      expect(cell!.text).toBe('');
    });

    it('should set multiple cells', () => {
      const table = engine.tableNew('top_right', 2, 2);

      engine.tableCellSet(table.id, 0, 0, 'A');
      engine.tableCellSet(table.id, 1, 0, 'B');
      engine.tableCellSet(table.id, 0, 1, 'C');
      engine.tableCellSet(table.id, 1, 1, 'D');

      expect(table.cells.size).toBe(4);
      expect(table.cells.get('0,0')!.text).toBe('A');
      expect(table.cells.get('1,0')!.text).toBe('B');
      expect(table.cells.get('0,1')!.text).toBe('C');
      expect(table.cells.get('1,1')!.text).toBe('D');
    });
  });

  describe('tableDelete', () => {
    it('should delete a table', () => {
      const table = engine.tableNew('top_right', 2, 2);

      engine.tableDelete(table.id);

      const output = engine.getOutput();
      expect(output.tables.size).toBe(0);
    });
  });

  describe('linefillNew', () => {
    it('should create a linefill between two lines', () => {
      const line1 = engine.lineNew(0, 100, 10, 200);
      const line2 = engine.lineNew(0, 150, 10, 250);

      const linefill = engine.linefillNew(line1.id, line2.id);

      expect(linefill).toBeDefined();
      expect(linefill!.line1).toBe(line1);
      expect(linefill!.line2).toBe(line2);
      expect(linefill!.color.r).toBe(0);
      expect(linefill!.color.g).toBe(0);
      expect(linefill!.color.b).toBe(255);
      expect(linefill!.fillgaps).toBe(false);
    });

    it('should create a linefill with custom color', () => {
      const line1 = engine.lineNew(0, 100, 10, 200);
      const line2 = engine.lineNew(0, 150, 10, 250);

      const linefill = engine.linefillNew(line1.id, line2.id, { color: '#FF0000' });

      expect(linefill!.color.r).toBe(255);
      expect(linefill!.color.g).toBe(0);
      expect(linefill!.color.b).toBe(0);
    });

    it('should create a linefill with fillgaps', () => {
      const line1 = engine.lineNew(0, 100, 10, 200);
      const line2 = engine.lineNew(0, 150, 10, 250);

      const linefill = engine.linefillNew(line1.id, line2.id, { fillgaps: true });

      expect(linefill!.fillgaps).toBe(true);
    });

    it('should return undefined for invalid line ids', () => {
      const linefill = engine.linefillNew('invalid1', 'invalid2');

      expect(linefill).toBeUndefined();
    });

    it('should store linefill in the engine', () => {
      const line1 = engine.lineNew(0, 100, 10, 200);
      const line2 = engine.lineNew(0, 150, 10, 250);

      const linefill = engine.linefillNew(line1.id, line2.id);

      const output = engine.getOutput();
      expect(output.linefills.size).toBe(1);
      expect(output.linefills.get(linefill!.id)).toBeDefined();
    });
  });

  describe('linefillDelete', () => {
    it('should delete a linefill', () => {
      const line1 = engine.lineNew(0, 100, 10, 200);
      const line2 = engine.lineNew(0, 150, 10, 250);
      const linefill = engine.linefillNew(line1.id, line2.id);

      engine.linefillDelete(linefill!.id);

      const output = engine.getOutput();
      expect(output.linefills.size).toBe(0);
    });
  });

  describe('polylineNew', () => {
    it('should create a polyline with default options', () => {
      const polyline = engine.polylineNew([
        [0, 100],
        [5, 150],
        [10, 200],
      ]);

      expect(polyline).toBeDefined();
      expect(polyline.points).toEqual([
        { barIndex: 0, price: 100 },
        { barIndex: 5, price: 150 },
        { barIndex: 10, price: 200 },
      ]);
      expect(polyline.close).toBe(false);
      expect(polyline.color.r).toBe(0);
      expect(polyline.color.g).toBe(0);
      expect(polyline.color.b).toBe(0);
      expect(polyline.linewidth).toBe(1);
      expect(polyline.style).toBe('solid');
      expect(polyline.join).toBe(true);
    });

    it('should create a polyline with close', () => {
      const polyline = engine.polylineNew(
        [
          [0, 100],
          [5, 150],
          [10, 200],
        ],
        { close: true },
      );

      expect(polyline.close).toBe(true);
    });

    it('should create a polyline with custom color', () => {
      const polyline = engine.polylineNew(
        [
          [0, 100],
          [5, 150],
        ],
        { color: '#FF0000' },
      );

      expect(polyline.color.r).toBe(255);
      expect(polyline.color.g).toBe(0);
      expect(polyline.color.b).toBe(0);
    });

    it('should create a polyline with custom linewidth', () => {
      const polyline = engine.polylineNew(
        [
          [0, 100],
          [5, 150],
        ],
        { linewidth: 3 },
      );

      expect(polyline.linewidth).toBe(3);
    });

    it('should create a polyline with custom style', () => {
      const polyline = engine.polylineNew(
        [
          [0, 100],
          [5, 150],
        ],
        { style: 'dashed' },
      );

      expect(polyline.style).toBe('dashed');
    });

    it('should create a polyline with custom join', () => {
      const polyline = engine.polylineNew(
        [
          [0, 100],
          [5, 150],
        ],
        { join: false },
      );

      expect(polyline.join).toBe(false);
    });

    it('should handle empty points', () => {
      const polyline = engine.polylineNew([]);

      expect(polyline.points).toEqual([]);
    });

    it('should store polyline in the engine', () => {
      const polyline = engine.polylineNew([
        [0, 100],
        [5, 150],
      ]);

      const output = engine.getOutput();
      expect(output.polylines.size).toBe(1);
      expect(output.polylines.get(polyline.id)).toBeDefined();
    });
  });

  describe('polylineDelete', () => {
    it('should delete a polyline', () => {
      const polyline = engine.polylineNew([
        [0, 100],
        [5, 150],
      ]);

      engine.polylineDelete(polyline.id);

      const output = engine.getOutput();
      expect(output.polylines.size).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all drawing objects', () => {
      engine.lineNew(0, 100, 10, 200);
      engine.boxNew(0, 200, 10, 100);
      engine.labelNew(5, 150, 'Test');
      engine.tableNew('top_right', 2, 2);
      const line1 = engine.lineNew(0, 100, 10, 200);
      const line2 = engine.lineNew(0, 150, 10, 250);
      engine.linefillNew(line1.id, line2.id);
      engine.polylineNew([
        [0, 100],
        [5, 150],
      ]);

      engine.clear();

      const output = engine.getOutput();
      expect(output.lines.size).toBe(0);
      expect(output.boxes.size).toBe(0);
      expect(output.labels.size).toBe(0);
      expect(output.tables.size).toBe(0);
      expect(output.linefills.size).toBe(0);
      expect(output.polylines.size).toBe(0);
    });
  });
});
