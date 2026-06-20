import { AlertSystem, resetAlertIdCounter } from '../../src/strategy/alert-system.js';

describe('AlertSystem', () => {
  beforeEach(() => {
    resetAlertIdCounter();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const system = new AlertSystem();
      expect(system).toBeDefined();
      expect(system.getConditions()).toEqual([]);
      expect(system.getEvents()).toEqual([]);
    });

    it('should create with custom config', () => {
      const system = new AlertSystem({
        maxAlertsPerBar: 5,
        cooldownPeriod: 1000,
      });
      expect(system).toBeDefined();
    });
  });

  describe('alertcondition', () => {
    it('should create an alert condition', () => {
      const system = new AlertSystem();

      const id = system.alertcondition(true, 'Price above 100');
      expect(id).toBeDefined();
      expect(system.getConditions().length).toBe(1);
    });

    it('should create condition with custom options', () => {
      const system = new AlertSystem();

      const id = system.alertcondition(true, 'Custom alert', '1H', 'webhook', {
        webhookUrl: 'https://example.com',
        oncePerBar: true,
      });

      expect(id).toBeDefined();
      const condition = system.getConditions()[0];
      expect(condition!.timeframe).toBe('1H');
      expect(condition!.destination).toBe('webhook');
      expect(condition!.webhookUrl).toBe('https://example.com');
      expect(condition!.oncePerBar).toBe(true);
    });
  });

  describe('alert', () => {
    it('should trigger an alert immediately', () => {
      const system = new AlertSystem();

      const id = system.alert('Immediate alert');
      expect(id).toBeDefined();
      expect(system.getEvents().length).toBe(1);
      expect(system.getEvents()[0]!.message).toBe('Immediate alert');
    });

    it('should trigger alert with custom destination', () => {
      const system = new AlertSystem();

      const id = system.alert('Webhook alert', 'webhook', {
        webhookUrl: 'https://example.com',
      });

      const event = system.getEvents()[0];
      expect(event!.destination).toBe('webhook');
      expect(event!.webhookUrl).toBe('https://example.com');
    });
  });

  describe('updateBar', () => {
    it('should evaluate conditions on bar update', () => {
      const system = new AlertSystem();

      system.alertcondition(true, 'Always alert');
      system.updateBar(0, 1000);

      expect(system.getEvents().length).toBe(1);
    });

    it('should not trigger when condition is false', () => {
      const system = new AlertSystem();

      system.alertcondition(false, 'Never alert');
      system.updateBar(0, 1000);

      expect(system.getEvents().length).toBe(0);
    });

    it('should not trigger when condition is 0', () => {
      const system = new AlertSystem();

      system.alertcondition(0, 'Zero alert');
      system.updateBar(0, 1000);

      expect(system.getEvents().length).toBe(0);
    });

    it('should trigger when condition is non-zero', () => {
      const system = new AlertSystem();

      system.alertcondition(1, 'Non-zero alert');
      system.updateBar(0, 1000);

      expect(system.getEvents().length).toBe(1);
    });
  });

  describe('oncePerBar', () => {
    it('should trigger only once per bar', () => {
      const system = new AlertSystem();

      system.alertcondition(true, 'Once per bar', '1D', 'log', {
        oncePerBar: true,
      });

      system.updateBar(0, 1000);
      expect(system.getEvents().length).toBe(1);

      system.updateBar(0, 1001);
      expect(system.getEvents().length).toBe(1);

      system.updateBar(1, 1002);
      expect(system.getEvents().length).toBe(2);
    });
  });

  describe('cooldown', () => {
    it('should respect cooldown period', () => {
      const system = new AlertSystem({ cooldownPeriod: 100 });

      system.alertcondition(true, 'Cooldown alert');

      system.updateBar(0, 1000);
      expect(system.getEvents().length).toBe(1);

      system.updateBar(1, 1050);
      expect(system.getEvents().length).toBe(1);

      system.updateBar(2, 1150);
      expect(system.getEvents().length).toBe(2);
    });
  });

  describe('maxAlertsPerBar', () => {
    it('should limit alerts per bar', () => {
      const system = new AlertSystem({ maxAlertsPerBar: 2 });

      system.alertcondition(true, 'Limited alert');

      system.updateBar(0, 1000);
      expect(system.getEvents().length).toBe(1);

      system.updateBar(0, 1001);
      expect(system.getEvents().length).toBe(2);

      system.updateBar(0, 1002);
      expect(system.getEvents().length).toBe(2);
    });
  });

  describe('getEventsForCondition', () => {
    it('should return events for specific condition', () => {
      const system = new AlertSystem();

      const id1 = system.alertcondition(true, 'Alert 1');
      const id2 = system.alertcondition(true, 'Alert 2');

      system.updateBar(0, 1000);

      const events1 = system.getEventsForCondition(id1);
      const events2 = system.getEventsForCondition(id2);

      expect(events1.length).toBe(1);
      expect(events2.length).toBe(1);
    });
  });

  describe('getEventsInTimeRange', () => {
    it('should return events in time range', () => {
      const system = new AlertSystem();

      system.alertcondition(true, 'Alert');
      system.updateBar(0, 1000);
      system.updateBar(1, 2000);
      system.updateBar(2, 3000);

      const events = system.getEventsInTimeRange(1500, 2500);
      expect(events.length).toBe(1);
    });
  });

  describe('removeCondition', () => {
    it('should remove a condition', () => {
      const system = new AlertSystem();

      const id = system.alertcondition(true, 'To remove');
      expect(system.getConditions().length).toBe(1);

      const removed = system.removeCondition(id);
      expect(removed).toBe(true);
      expect(system.getConditions().length).toBe(0);
    });

    it('should return false for non-existent condition', () => {
      const system = new AlertSystem();
      const removed = system.removeCondition('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all conditions and events', () => {
      const system = new AlertSystem();

      system.alertcondition(true, 'Alert 1');
      system.alertcondition(true, 'Alert 2');
      system.updateBar(0, 1000);

      system.clear();

      expect(system.getConditions()).toEqual([]);
      expect(system.getEvents()).toEqual([]);
    });
  });

  describe('message formatting', () => {
    it('should format message with placeholders', () => {
      const system = new AlertSystem();

      system.alertcondition(true, 'Time: {time}, Bar: {bar_index}');
      system.updateBar(5, 1234567890);

      const event = system.getEvents()[0];
      expect(event!.message).toContain('Bar: 5');
      expect(event!.message).toContain('Time:');
    });
  });
});
