import {
  parseColor,
  colorToHex,
  colorToRgb,
  colorToRgba,
  colorToNumber,
  addColors,
  subtractColors,
  multiplyColor,
  blendColors,
  withOpacity,
  colorEquals,
  colorToGrayscale,
  invertColor,
  mixColors,
} from '../../src/config/color-system.js';

describe('ColorSystem', () => {
  describe('parseColor', () => {
    it('should parse hex color', () => {
      const color = parseColor('#FF0000');
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
      expect(color.a).toBe(255);
    });

    it('should parse shorthand hex', () => {
      const color = parseColor('#F00');
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });

    it('should parse hex with alpha', () => {
      const color = parseColor('#FF000080');
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
      expect(color.a).toBe(128);
    });

    it('should parse rgb color', () => {
      const color = parseColor('rgb(255, 128, 0)');
      expect(color.r).toBe(255);
      expect(color.g).toBe(128);
      expect(color.b).toBe(0);
      expect(color.a).toBe(255);
    });

    it('should parse rgba color', () => {
      const color = parseColor('rgba(255, 128, 0, 0.5)');
      expect(color.r).toBe(255);
      expect(color.g).toBe(128);
      expect(color.b).toBe(0);
      expect(color.a).toBe(128);
    });

    it('should parse named color', () => {
      const color = parseColor('red');
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
      expect(color.a).toBe(255);
    });

    it('should parse color object', () => {
      const color = parseColor({ r: 100, g: 150, b: 200, a: 128 });
      expect(color.r).toBe(100);
      expect(color.g).toBe(150);
      expect(color.b).toBe(200);
      expect(color.a).toBe(128);
    });

    it('should parse number color', () => {
      const color = parseColor(0xff0000);
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });

    it('should handle transparent', () => {
      const color = parseColor('transparent');
      expect(color.a).toBe(0);
    });

    it('should default to black for invalid input', () => {
      const color = parseColor('invalid');
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });
  });

  describe('colorToHex', () => {
    it('should convert to hex', () => {
      const hex = colorToHex({ r: 255, g: 0, b: 0, a: 255 });
      expect(hex).toBe('#ff0000');
    });

    it('should include alpha when not 255', () => {
      const hex = colorToHex({ r: 255, g: 0, b: 0, a: 128 });
      expect(hex).toBe('#ff000080');
    });
  });

  describe('colorToRgb', () => {
    it('should convert to rgb string', () => {
      const rgb = colorToRgb({ r: 255, g: 128, b: 0, a: 255 });
      expect(rgb).toBe('rgb(255, 128, 0)');
    });
  });

  describe('colorToRgba', () => {
    it('should convert to rgba string', () => {
      const rgba = colorToRgba({ r: 255, g: 128, b: 0, a: 128 });
      expect(rgba).toBe('rgba(255, 128, 0, 0.50)');
    });
  });

  describe('colorToNumber', () => {
    it('should convert to number', () => {
      const num = colorToNumber({ r: 255, g: 0, b: 0, a: 255 });
      expect(num).toBe(0xff0000);
    });
  });

  describe('addColors', () => {
    it('should add two colors', () => {
      const result = addColors('#FF0000', '#00FF00');
      expect(result.r).toBe(255);
      expect(result.g).toBe(255);
      expect(result.b).toBe(0);
    });

    it('should clamp values', () => {
      const result = addColors('#FF0000', '#FF0000');
      expect(result.r).toBe(255);
    });
  });

  describe('subtractColors', () => {
    it('should subtract two colors', () => {
      const result = subtractColors('#FF8000', '#004000');
      expect(result.r).toBe(255);
      expect(result.g).toBe(64);
      expect(result.b).toBe(0);
    });

    it('should clamp values', () => {
      const result = subtractColors('#000000', '#FF0000');
      expect(result.r).toBe(0);
    });
  });

  describe('multiplyColor', () => {
    it('should multiply color by factor', () => {
      const result = multiplyColor('#808080', 2);
      expect(result.r).toBe(255);
      expect(result.g).toBe(255);
      expect(result.b).toBe(255);
    });

    it('should clamp values', () => {
      const result = multiplyColor('#FF0000', 2);
      expect(result.r).toBe(255);
    });
  });

  describe('blendColors', () => {
    it('should blend two colors', () => {
      const result = blendColors('#FF0000', '#00FF00', 0.5);
      expect(result.r).toBe(128);
      expect(result.g).toBe(128);
      expect(result.b).toBe(0);
    });

    it('should handle ratio 0', () => {
      const result = blendColors('#FF0000', '#00FF00', 0);
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
    });

    it('should handle ratio 1', () => {
      const result = blendColors('#FF0000', '#00FF00', 1);
      expect(result.r).toBe(0);
      expect(result.g).toBe(255);
    });
  });

  describe('withOpacity', () => {
    it('should set opacity', () => {
      const result = withOpacity('#FF0000', 0.5);
      expect(result.r).toBe(255);
      expect(result.a).toBe(128);
    });

    it('should clamp opacity', () => {
      const result = withOpacity('#FF0000', 1.5);
      expect(result.a).toBe(255);
    });
  });

  describe('colorEquals', () => {
    it('should return true for equal colors', () => {
      expect(colorEquals('#FF0000', '#FF0000')).toBe(true);
    });

    it('should return false for different colors', () => {
      expect(colorEquals('#FF0000', '#00FF00')).toBe(false);
    });
  });

  describe('colorToGrayscale', () => {
    it('should convert to grayscale', () => {
      const result = colorToGrayscale('#FF0000');
      expect(result.r).toBe(result.g);
      expect(result.g).toBe(result.b);
    });
  });

  describe('invertColor', () => {
    it('should invert color', () => {
      const result = invertColor('#FF0000');
      expect(result.r).toBe(0);
      expect(result.g).toBe(255);
      expect(result.b).toBe(255);
    });
  });

  describe('mixColors', () => {
    it('should mix multiple colors', () => {
      const result = mixColors(['#FF0000', '#00FF00', '#0000FF'], [1, 1, 1]);
      expect(result.r).toBe(85);
      expect(result.g).toBe(85);
      expect(result.b).toBe(85);
    });

    it('should handle single color', () => {
      const result = mixColors(['#FF0000'], [1]);
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('should handle empty array', () => {
      const result = mixColors([], []);
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });
  });
});
