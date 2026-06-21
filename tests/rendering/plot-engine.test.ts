import {
  PlotEngine,
  resetPlotIdCounter,
  ChartPointFactory,
} from '../../src/rendering/plot-engine.js';

describe('PlotEngine', () => {
  let engine: PlotEngine;

  beforeEach(() => {
    resetPlotIdCounter();
    engine = new PlotEngine();
  });

  describe('plot', () => {
    it('should create a plot with default options', () => {
      engine.setBarIndex(0);
      engine.plot(100);

      const output = engine.getOutput();
      expect(output.plots.size).toBe(1);
      const plot = output.plots.get('plot_0')!;
      expect(plot).toBeDefined();
      expect(plot.values).toEqual([100]);
      expect(plot.style).toBe('line');
      expect(plot.linewidth).toBe(1);
    });

    it('should create a plot with custom title', () => {
      engine.setBarIndex(0);
      engine.plot(100, { title: 'Close Price' });

      const output = engine.getOutput();
      expect(output.plots.has('Close Price')).toBe(true);
    });

    it('should create a plot with custom color', () => {
      engine.setBarIndex(0);
      engine.plot(100, { color: '#FF0000' });

      const output = engine.getOutput();
      const plot = output.plots.get('plot_0')!;
      expect(plot.color.r).toBe(255);
      expect(plot.color.g).toBe(0);
      expect(plot.color.b).toBe(0);
    });

    it('should create a plot with custom style', () => {
      engine.setBarIndex(0);
      engine.plot(100, { style: 'area' });

      const output = engine.getOutput();
      const plot = output.plots.get('plot_0')!;
      expect(plot.style).toBe('area');
    });

    it('should create a plot with custom linewidth', () => {
      engine.setBarIndex(0);
      engine.plot(100, { linewidth: 3 });

      const output = engine.getOutput();
      const plot = output.plots.get('plot_0')!;
      expect(plot.linewidth).toBe(3);
    });

    it('should append values on multiple calls', () => {
      engine.setBarIndex(0);
      engine.plot(100, { title: 'Close' });
      engine.setBarIndex(1);
      engine.plot(200, { title: 'Close' });
      engine.setBarIndex(2);
      engine.plot(300, { title: 'Close' });

      const output = engine.getOutput();
      const plot = output.plots.get('Close')!;
      expect(plot.values).toEqual([100, 200, 300]);
    });

    it('should handle na values', () => {
      engine.setBarIndex(0);
      engine.plot(null);

      const output = engine.getOutput();
      const plot = output.plots.get('plot_0')!;
      expect(plot.values).toEqual([null]);
    });

    it('should support multiple plots with different titles', () => {
      engine.setBarIndex(0);
      engine.plot(100, { title: 'Plot A' });
      engine.plot(200, { title: 'Plot B' });

      const output = engine.getOutput();
      expect(output.plots.size).toBe(2);
      expect(output.plots.has('Plot A')).toBe(true);
      expect(output.plots.has('Plot B')).toBe(true);
    });

    it('should support trackprice option', () => {
      engine.setBarIndex(0);
      engine.plot(100, { trackprice: true });

      const output = engine.getOutput();
      const plot = output.plots.get('plot_0')!;
      expect(plot.trackprice).toBe(true);
    });

    it('should support offset option', () => {
      engine.setBarIndex(0);
      engine.plot(100, { offset: -5 });

      const output = engine.getOutput();
      const plot = output.plots.get('plot_0')!;
      expect(plot.offset).toBe(-5);
    });

    it('should support histbase option', () => {
      engine.setBarIndex(0);
      engine.plot(100, { histbase: 50 });

      const output = engine.getOutput();
      const plot = output.plots.get('plot_0')!;
      expect(plot.histbase).toBe(50);
    });

    it('should support fillgaps option', () => {
      engine.setBarIndex(0);
      engine.plot(100, { fillgaps: false });

      const output = engine.getOutput();
      const plot = output.plots.get('plot_0')!;
      expect(plot.fillgaps).toBe(false);
    });
  });

  describe('plotshape', () => {
    it('should create a shape with default options', () => {
      engine.setBarIndex(10);
      engine.plotshape(true);

      const output = engine.getOutput();
      expect(output.shapes.size).toBe(1);
      const shape = output.shapes.get('shape_0')!;
      expect(shape).toBeDefined();
      expect(shape.barIndex).toEqual([10]);
      expect(shape.style).toBe('circle');
      expect(shape.location).toBe('abovebar');
    });

    it('should create a shape with custom style', () => {
      engine.setBarIndex(10);
      engine.plotshape(true, { style: 'cross' });

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.style).toBe('cross');
    });

    it('should create a shape with custom location', () => {
      engine.setBarIndex(10);
      engine.plotshape(true, { location: 'belowbar' });

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.location).toBe('belowbar');
    });

    it('should not show shape when value is false', () => {
      engine.setBarIndex(10);
      engine.plotshape(false);

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.barIndex).toEqual([-1]);
    });

    it('should not show shape when value is na', () => {
      engine.setBarIndex(10);
      engine.plotshape(null);

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.barIndex).toEqual([-1]);
    });

    it('should create a shape with custom color', () => {
      engine.setBarIndex(10);
      engine.plotshape(true, { color: '#FF0000' });

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.color.r).toBe(255);
      expect(shape.color.g).toBe(0);
      expect(shape.color.b).toBe(0);
    });

    it('should create a shape with custom text', () => {
      engine.setBarIndex(10);
      engine.plotshape(true, { text: 'Buy' });

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.text).toBe('Buy');
    });

    it('should create a shape with custom textcolor', () => {
      engine.setBarIndex(10);
      engine.plotshape(true, { textcolor: '#00FF00' });

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.textcolor.r).toBe(0);
      expect(shape.textcolor.g).toBe(255);
      expect(shape.textcolor.b).toBe(0);
    });

    it('should create a shape with custom size', () => {
      engine.setBarIndex(10);
      engine.plotshape(true, { size: 'large' });

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.size).toBe('large');
    });

    it('should create a shape with offset', () => {
      engine.setBarIndex(10);
      engine.plotshape(true, { offset: 5 });

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.barIndex).toEqual([15]);
    });

    it('should support custom title', () => {
      engine.setBarIndex(10);
      engine.plotshape(true, {}, 'Buy Signal');

      const output = engine.getOutput();
      expect(output.shapes.has('Buy Signal')).toBe(true);
    });
  });

  describe('plotchar', () => {
    it('should create a char with default options', () => {
      engine.setBarIndex(10);
      engine.plotchar(true);

      const output = engine.getOutput();
      expect(output.chars.size).toBe(1);
      const char = output.chars.get('char_0')!;
      expect(char).toBeDefined();
      expect(char.char).toBe('●');
      expect(char.location).toBe('abovebar');
      expect(char.barIndex).toEqual([10]);
    });

    it('should create a char with custom character', () => {
      engine.setBarIndex(10);
      engine.plotchar(true, { char: '★' });

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.char).toBe('★');
    });

    it('should create a char with custom location', () => {
      engine.setBarIndex(10);
      engine.plotchar(true, { location: 'belowbar' });

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.location).toBe('belowbar');
    });

    it('should not show char when value is false', () => {
      engine.setBarIndex(10);
      engine.plotchar(false);

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.barIndex).toEqual([-1]);
    });

    it('should not show char when value is na', () => {
      engine.setBarIndex(10);
      engine.plotchar(null);

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.barIndex).toEqual([-1]);
    });

    it('should create a char with custom color', () => {
      engine.setBarIndex(10);
      engine.plotchar(true, { color: '#0000FF' });

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.color.r).toBe(0);
      expect(char.color.g).toBe(0);
      expect(char.color.b).toBe(255);
    });

    it('should create a char with custom text', () => {
      engine.setBarIndex(10);
      engine.plotchar(true, { text: 'Signal' });

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.text).toBe('Signal');
    });

    it('should create a char with custom textcolor', () => {
      engine.setBarIndex(10);
      engine.plotchar(true, { textcolor: '#FF00FF' });

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.textcolor.r).toBe(255);
      expect(char.textcolor.g).toBe(0);
      expect(char.textcolor.b).toBe(255);
    });

    it('should create a char with custom size', () => {
      engine.setBarIndex(10);
      engine.plotchar(true, { size: 'huge' });

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.size).toBe('huge');
    });

    it('should create a char with custom font', () => {
      engine.setBarIndex(10);
      engine.plotchar(true, { font: 'Courier' });

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.font).toBe('Courier');
    });

    it('should create a char with offset', () => {
      engine.setBarIndex(10);
      engine.plotchar(true, { offset: -3 });

      const output = engine.getOutput();
      const char = output.chars.get('char_0')!;
      expect(char.barIndex).toEqual([7]);
    });

    it('should support custom title', () => {
      engine.setBarIndex(10);
      engine.plotchar(true, {}, 'MyChar');

      const output = engine.getOutput();
      expect(output.chars.has('MyChar')).toBe(true);
    });
  });

  describe('plotarrow', () => {
    it('should create an arrow with default options', () => {
      engine.setBarIndex(0);
      engine.plotarrow(1);

      const output = engine.getOutput();
      expect(output.arrows.size).toBe(1);
      const arrow = output.arrows.get('arrow_0')!;
      expect(arrow).toBeDefined();
      expect(arrow.series).toEqual([1]);
      expect(arrow.barIndex).toEqual([0]);
      expect(arrow.style).toBe('directional');
    });

    it('should create an arrow with negative value', () => {
      engine.setBarIndex(0);
      engine.plotarrow(-1);

      const output = engine.getOutput();
      const arrow = output.arrows.get('arrow_0')!;
      expect(arrow.series).toEqual([-1]);
    });

    it('should create an arrow with custom color', () => {
      engine.setBarIndex(0);
      engine.plotarrow(1, { color: '#00FF00' });

      const output = engine.getOutput();
      const arrow = output.arrows.get('arrow_0')!;
      expect(arrow.color.r).toBe(0);
      expect(arrow.color.g).toBe(255);
      expect(arrow.color.b).toBe(0);
    });

    it('should create an arrow with custom style', () => {
      engine.setBarIndex(0);
      engine.plotarrow(1, { style: 'shapes' });

      const output = engine.getOutput();
      const arrow = output.arrows.get('arrow_0')!;
      expect(arrow.style).toBe('shapes');
    });

    it('should create an arrow with offset', () => {
      engine.setBarIndex(10);
      engine.plotarrow(1, { offset: 5 });

      const output = engine.getOutput();
      const arrow = output.arrows.get('arrow_0')!;
      expect(arrow.offset).toBe(5);
    });

    it('should append values on multiple calls', () => {
      engine.setBarIndex(0);
      engine.plotarrow(1, {}, 'Signal');
      engine.setBarIndex(1);
      engine.plotarrow(-1, {}, 'Signal');
      engine.setBarIndex(2);
      engine.plotarrow(0, {}, 'Signal');

      const output = engine.getOutput();
      const arrow = output.arrows.get('Signal')!;
      expect(arrow.series).toEqual([1, -1, 0]);
      expect(arrow.barIndex).toEqual([0, 1, 2]);
    });

    it('should handle na values', () => {
      engine.setBarIndex(0);
      engine.plotarrow(null);

      const output = engine.getOutput();
      const arrow = output.arrows.get('arrow_0')!;
      expect(arrow.series).toEqual([0]);
    });

    it('should support custom title', () => {
      engine.setBarIndex(0);
      engine.plotarrow(1, {}, 'MyArrow');

      const output = engine.getOutput();
      expect(output.arrows.has('MyArrow')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all plots, shapes, chars, and arrows', () => {
      engine.setBarIndex(0);
      engine.plot(100);
      engine.plotshape(true);
      engine.plotchar(true);
      engine.plotarrow(1);

      engine.clear();

      const output = engine.getOutput();
      expect(output.plots.size).toBe(0);
      expect(output.shapes.size).toBe(0);
      expect(output.chars.size).toBe(0);
      expect(output.arrows.size).toBe(0);
    });
  });

  describe('setBarIndex', () => {
    it('should update the current bar index', () => {
      engine.setBarIndex(5);
      engine.plot(100);

      engine.setBarIndex(10);
      engine.plotshape(true);

      const output = engine.getOutput();
      const shape = output.shapes.get('shape_0')!;
      expect(shape.barIndex).toEqual([10]);
    });
  });

  describe('hline', () => {
    it('should create a horizontal line with default options', () => {
      engine.hline(100);

      const output = engine.getOutput();
      expect(output.hlines.size).toBe(1);
      const hline = output.hlines.get('hline_0')!;
      expect(hline).toBeDefined();
      expect(hline.price).toBe(100);
      expect(hline.linestyle).toBe('solid');
      expect(hline.linewidth).toBe(1);
      expect(hline.editable).toBe(true);
    });

    it('should create a horizontal line with custom options', () => {
      engine.hline(200, {
        title: 'Resistance',
        color: '#FF0000',
        linewidth: 2,
        linestyle: 'dashed',
        editable: false,
      });

      const output = engine.getOutput();
      const hline = output.hlines.get('Resistance')!;
      expect(hline.price).toBe(200);
      expect(hline.color.r).toBe(255);
      expect(hline.linewidth).toBe(2);
      expect(hline.linestyle).toBe('dashed');
      expect(hline.editable).toBe(false);
    });

    it('should handle na values', () => {
      engine.hline(null);

      const output = engine.getOutput();
      const hline = output.hlines.get('hline_0')!;
      expect(hline.price).toBe(0);
    });
  });

  describe('bgcolor', () => {
    it('should set background color', () => {
      engine.bgcolor('#FF0000');

      const output = engine.getOutput();
      expect(output.bgcolor).toBeDefined();
      expect(output.bgcolor!.color.r).toBe(255);
      expect(output.bgcolor!.color.g).toBe(0);
      expect(output.bgcolor!.color.b).toBe(0);
    });

    it('should update background color on multiple calls', () => {
      engine.bgcolor('#FF0000');
      engine.bgcolor('#00FF00');

      const output = engine.getOutput();
      expect(output.bgcolor!.color.r).toBe(0);
      expect(output.bgcolor!.color.g).toBe(255);
      expect(output.bgcolor!.color.b).toBe(0);
      expect(output.bgcolor!.barColors.length).toBe(2);
    });
  });

  describe('barcolor', () => {
    it('should set bar color', () => {
      engine.barcolor('#0000FF');

      const output = engine.getOutput();
      expect(output.barcolor).toBeDefined();
      expect(output.barcolor!.color.r).toBe(0);
      expect(output.barcolor!.color.g).toBe(0);
      expect(output.barcolor!.color.b).toBe(255);
    });

    it('should update bar color on multiple calls', () => {
      engine.barcolor('#FF0000');
      engine.barcolor('#00FF00');

      const output = engine.getOutput();
      expect(output.barcolor!.color.r).toBe(0);
      expect(output.barcolor!.color.g).toBe(255);
      expect(output.barcolor!.color.b).toBe(0);
    });
  });

  describe('fill', () => {
    it('should create a fill between two plots', () => {
      engine.setBarIndex(0);
      engine.plot(100, { title: 'Upper' });
      engine.plot(50, { title: 'Lower' });
      engine.fill('Upper', 'Lower');

      const output = engine.getOutput();
      expect(output.fills.size).toBe(1);
      const fill = output.fills.get('fill_Upper_Lower')!;
      expect(fill).toBeDefined();
      expect(fill.plot1Title).toBe('Upper');
      expect(fill.plot2Title).toBe('Lower');
    });

    it('should create a fill with custom color', () => {
      engine.setBarIndex(0);
      engine.plot(100, { title: 'A' });
      engine.plot(50, { title: 'B' });
      engine.fill('A', 'B', { color: '#FF0000' });

      const output = engine.getOutput();
      const fill = output.fills.get('fill_A_B')!;
      expect(fill.color.r).toBe(255);
      expect(fill.color.g).toBe(0);
      expect(fill.color.b).toBe(0);
    });

    it('should create a fill with custom title', () => {
      engine.setBarIndex(0);
      engine.plot(100, { title: 'X' });
      engine.plot(50, { title: 'Y' });
      engine.fill('X', 'Y', { title: 'My Fill' });

      const output = engine.getOutput();
      expect(output.fills.has('My Fill')).toBe(true);
    });
  });

  describe('ChartPointFactory', () => {
    it('should create a chart point with new()', () => {
      const point = ChartPointFactory.new(10, 150);
      expect(point.barIndex).toBe(10);
      expect(point.price).toBe(150);
    });

    it('should create a chart point with now()', () => {
      const point = ChartPointFactory.now(200);
      expect(point.price).toBe(200);
    });

    it('should create a chart point with fromIndex()', () => {
      const point = ChartPointFactory.fromIndex(5, 100);
      expect(point.barIndex).toBe(5);
      expect(point.price).toBe(100);
    });

    it('should create a chart point with fromTime()', () => {
      const point = ChartPointFactory.fromTime(60000, 150);
      expect(point.barIndex).toBe(1);
      expect(point.price).toBe(150);
    });

    it('should copy a chart point', () => {
      const original = { barIndex: 10, price: 150 };
      const copy = ChartPointFactory.copy(original);
      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
    });

    it('should handle na values', () => {
      const point = ChartPointFactory.new(null, null);
      expect(point.barIndex).toBe(0);
      expect(point.price).toBe(0);
    });
  });
});
