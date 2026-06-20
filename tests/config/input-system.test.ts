import { InputSystem } from '../../src/config/input-system.js';

describe('InputSystem', () => {
  let inputSystem: InputSystem;

  beforeEach(() => {
    inputSystem = new InputSystem();
  });

  describe('inputInt', () => {
    it('should create integer input with default value', () => {
      const value = inputSystem.inputInt('Length', 14);
      expect(value).toBe(14);
    });

    it('should respect min/max constraints', () => {
      inputSystem.inputInt('Length', 14, { min: 1, max: 100 });

      expect(inputSystem.setValue('length', 0)).toBe(false);
      expect(inputSystem.setValue('length', 101)).toBe(false);
      expect(inputSystem.setValue('length', 50)).toBe(true);
    });

    it('should validate integer type', () => {
      inputSystem.inputInt('Length', 14);

      expect(inputSystem.setValue('length', 3.5)).toBe(false);
      expect(inputSystem.setValue('length', 20)).toBe(true);
    });
  });

  describe('inputFloat', () => {
    it('should create float input with default value', () => {
      const value = inputSystem.inputFloat('Multiplier', 2.0);
      expect(value).toBe(2.0);
    });

    it('should respect min/max constraints', () => {
      inputSystem.inputFloat('Multiplier', 2.0, { min: 0.1, max: 10.0 });

      expect(inputSystem.setValue('multiplier', 0.05)).toBe(false);
      expect(inputSystem.setValue('multiplier', 10.5)).toBe(false);
      expect(inputSystem.setValue('multiplier', 5.0)).toBe(true);
    });
  });

  describe('inputBool', () => {
    it('should create boolean input with default value', () => {
      const value = inputSystem.inputBool('Show Signal', true);
      expect(value).toBe(true);
    });

    it('should validate boolean type', () => {
      inputSystem.inputBool('Show Signal', true);

      expect(inputSystem.setValue('show_signal', 'yes')).toBe(false);
      expect(inputSystem.setValue('show_signal', false)).toBe(true);
    });
  });

  describe('inputString', () => {
    it('should create string input with default value', () => {
      const value = inputSystem.inputString('Title', 'My Indicator');
      expect(value).toBe('My Indicator');
    });

    it('should validate against options', () => {
      inputSystem.inputString('Type', 'SMA', { options: ['SMA', 'EMA', 'WMA'] });

      expect(inputSystem.setValue('type', 'INVALID')).toBe(false);
      expect(inputSystem.setValue('type', 'EMA')).toBe(true);
    });
  });

  describe('inputColor', () => {
    it('should create color input with default value', () => {
      const value = inputSystem.inputColor('Line Color', '#FF0000');
      expect(value).toBe('#FF0000');
    });
  });

  describe('inputSymbol', () => {
    it('should create symbol input with default value', () => {
      const value = inputSystem.inputSymbol('Symbol', 'AAPL');
      expect(value).toBe('AAPL');
    });
  });

  describe('inputTimeframe', () => {
    it('should create timeframe input with default value', () => {
      const value = inputSystem.inputTimeframe('Timeframe', 'D');
      expect(value).toBe('D');
    });
  });

  describe('inputSource', () => {
    it('should create source input with default value', () => {
      const value = inputSystem.inputSource('Source', 'close');
      expect(value).toBe('close');
    });
  });

  describe('inputSession', () => {
    it('should create session input with default value', () => {
      const value = inputSystem.inputSession('Session', '0930-1600');
      expect(value).toBe('0930-1600');
    });
  });

  describe('setValue and getValue', () => {
    it('should set and get value', () => {
      inputSystem.inputInt('Length', 14);

      inputSystem.setValue('length', 20);
      expect(inputSystem.getValue('length')).toBe(20);
    });

    it('should return default for undefined input', () => {
      expect(inputSystem.getValue('nonexistent')).toBe('');
    });
  });

  describe('onChange', () => {
    it('should notify listeners on value change', () => {
      inputSystem.inputInt('Length', 14);

      let receivedValue: number | boolean | string | undefined;
      const callback = (value: number | boolean | string) => {
        receivedValue = value;
      };
      inputSystem.onChange('length', callback);

      inputSystem.setValue('length', 20);
      expect(receivedValue).toBe(20);
    });

    it('should support multiple listeners', () => {
      inputSystem.inputInt('Length', 14);

      let receivedValue1: number | boolean | string | undefined;
      let receivedValue2: number | boolean | string | undefined;
      const callback1 = (value: number | boolean | string) => {
        receivedValue1 = value;
      };
      const callback2 = (value: number | boolean | string) => {
        receivedValue2 = value;
      };
      inputSystem.onChange('length', callback1);
      inputSystem.onChange('length', callback2);

      inputSystem.setValue('length', 20);
      expect(receivedValue1).toBe(20);
      expect(receivedValue2).toBe(20);
    });
  });

  describe('getDefinition', () => {
    it('should return input definition', () => {
      inputSystem.inputInt('Length', 14, { min: 1, max: 100 });

      const definition = inputSystem.getDefinition('length');
      expect(definition).toBeDefined();
      expect(definition?.type).toBe('int');
      expect(definition?.title).toBe('Length');
    });

    it('should return undefined for non-existent input', () => {
      expect(inputSystem.getDefinition('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllDefinitions', () => {
    it('should return all definitions', () => {
      inputSystem.inputInt('Length', 14);
      inputSystem.inputFloat('Multiplier', 2.0);
      inputSystem.inputBool('Show Signal', true);

      const definitions = inputSystem.getAllDefinitions();
      expect(definitions).toHaveLength(3);
    });
  });

  describe('getDefinitionsByGroup', () => {
    it('should return definitions by group', () => {
      inputSystem.inputInt('Length', 14, { group: 'Settings' });
      inputSystem.inputFloat('Multiplier', 2.0, { group: 'Settings' });
      inputSystem.inputBool('Show Signal', true, { group: 'Display' });

      const settingsDefs = inputSystem.getDefinitionsByGroup('Settings');
      expect(settingsDefs).toHaveLength(2);

      const displayDefs = inputSystem.getDefinitionsByGroup('Display');
      expect(displayDefs).toHaveLength(1);
    });
  });

  describe('getGroups', () => {
    it('should return unique groups', () => {
      inputSystem.inputInt('Length', 14, { group: 'Settings' });
      inputSystem.inputFloat('Multiplier', 2.0, { group: 'Settings' });
      inputSystem.inputBool('Show Signal', true, { group: 'Display' });

      const groups = inputSystem.getGroups();
      expect(groups).toHaveLength(2);
      expect(groups).toContain('Settings');
      expect(groups).toContain('Display');
    });
  });

  describe('getAllValues', () => {
    it('should return all values', () => {
      inputSystem.inputInt('Length', 14);
      inputSystem.inputFloat('Multiplier', 2.0);
      inputSystem.inputBool('Show Signal', true);

      const values = inputSystem.getAllValues();
      expect(values.size).toBe(3);
      expect(values.get('length')).toBe(14);
      expect(values.get('multiplier')).toBe(2.0);
      expect(values.get('show_signal')).toBe(true);
    });
  });

  describe('setValues', () => {
    it('should set multiple values', () => {
      inputSystem.inputInt('Length', 14);
      inputSystem.inputFloat('Multiplier', 2.0);

      const values = new Map<string, number | boolean | string>();
      values.set('length', 20);
      values.set('multiplier', 3.0);

      inputSystem.setValues(values);

      expect(inputSystem.getValue('length')).toBe(20);
      expect(inputSystem.getValue('multiplier')).toBe(3.0);
    });
  });

  describe('clear', () => {
    it('should clear all inputs', () => {
      inputSystem.inputInt('Length', 14);
      inputSystem.inputFloat('Multiplier', 2.0);

      inputSystem.clear();

      expect(inputSystem.getAllDefinitions()).toHaveLength(0);
      expect(inputSystem.getAllValues().size).toBe(0);
    });
  });
});
