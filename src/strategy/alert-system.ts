import type { PineValue } from '../language/types/na.js';
import { isNa } from '../language/types/na.js';

export type AlertDestination = 'email' | 'webhook' | 'log' | 'popup' | 'sms';

export interface AlertCondition {
  id: string;
  message: string;
  condition: PineValue;
  timeframe: string;
  destination: AlertDestination;
  webhookUrl?: string;
  email?: string;
  oncePerBar: boolean;
  oncePerBarClose: boolean;
}

export interface AlertEvent {
  id: string;
  conditionId: string;
  message: string;
  timestamp: number;
  barIndex: number;
  timeframe: string;
  destination: AlertDestination;
  webhookUrl?: string;
  email?: string;
}

export interface AlertConfig {
  maxAlertsPerBar: number;
  cooldownPeriod: number;
  enableLogging: boolean;
  logDestination: string;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  maxAlertsPerBar: 10,
  cooldownPeriod: 0,
  enableLogging: true,
  logDestination: 'console',
};

let alertIdCounter = 0;

function generateAlertId(): string {
  return `alert_${++alertIdCounter}`;
}

export function resetAlertIdCounter(): void {
  alertIdCounter = 0;
}

export class AlertSystem {
  private config: AlertConfig;
  private conditions: Map<string, AlertCondition>;
  private events: AlertEvent[];
  private lastAlertTime: Map<string, number>;
  private lastBarIndex: Map<string, number>;
  private currentBarIndex: number;
  private currentTime: number;

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = { ...DEFAULT_ALERT_CONFIG, ...config };
    this.conditions = new Map();
    this.events = [];
    this.lastAlertTime = new Map();
    this.lastBarIndex = new Map();
    this.currentBarIndex = 0;
    this.currentTime = 0;
  }

  alertcondition(
    condition: PineValue,
    message: string = 'Alert triggered',
    timeframe: string = '1D',
    destination: AlertDestination = 'log',
    options: {
      oncePerBar?: boolean;
      oncePerBarClose?: boolean;
      webhookUrl?: string;
      email?: string;
    } = {},
  ): string {
    const id = generateAlertId();

    const alertCondition: AlertCondition = {
      id,
      message,
      condition,
      timeframe,
      destination,
      webhookUrl: options.webhookUrl,
      email: options.email,
      oncePerBar: options.oncePerBar ?? false,
      oncePerBarClose: options.oncePerBarClose ?? false,
    };

    this.conditions.set(id, alertCondition);
    return id;
  }

  alert(
    message: string = 'Alert triggered',
    destination: AlertDestination = 'log',
    options: {
      webhookUrl?: string;
      email?: string;
    } = {},
  ): string {
    const id = generateAlertId();

    const event: AlertEvent = {
      id,
      conditionId: '',
      message,
      timestamp: this.currentTime,
      barIndex: this.currentBarIndex,
      timeframe: '1D',
      destination,
      webhookUrl: options.webhookUrl,
      email: options.email,
    };

    this.events.push(event);
    return id;
  }

  updateBar(barIndex: number, timestamp: number): void {
    this.currentBarIndex = barIndex;
    this.currentTime = timestamp;
    this.evaluateConditions();
  }

  private evaluateConditions(): void {
    for (const [id, condition] of this.conditions) {
      if (this.shouldTriggerAlert(id, condition)) {
        this.triggerAlert(id, condition);
      }
    }
  }

  private shouldTriggerAlert(conditionId: string, condition: AlertCondition): boolean {
    if (isNa(condition.condition)) return false;

    const conditionValue = condition.condition as boolean | number;
    if (typeof conditionValue === 'boolean' && !conditionValue) return false;
    if (typeof conditionValue === 'number' && conditionValue === 0) return false;

    if (condition.oncePerBar || condition.oncePerBarClose) {
      const lastBar = this.lastBarIndex.get(conditionId);
      if (lastBar !== undefined && lastBar === this.currentBarIndex) {
        return false;
      }
    }

    if (this.config.cooldownPeriod > 0) {
      const lastTime = this.lastAlertTime.get(conditionId);
      if (lastTime !== undefined) {
        const elapsed = this.currentTime - lastTime;
        if (elapsed < this.config.cooldownPeriod) {
          return false;
        }
      }
    }

    const recentAlerts = this.events.filter(
      (e) => e.conditionId === conditionId && e.barIndex === this.currentBarIndex,
    );
    if (recentAlerts.length >= this.config.maxAlertsPerBar) {
      return false;
    }

    return true;
  }

  private triggerAlert(conditionId: string, condition: AlertCondition): void {
    const event: AlertEvent = {
      id: generateAlertId(),
      conditionId,
      message: this.formatMessage(condition.message),
      timestamp: this.currentTime,
      barIndex: this.currentBarIndex,
      timeframe: condition.timeframe,
      destination: condition.destination,
      webhookUrl: condition.webhookUrl,
      email: condition.email,
    };

    this.events.push(event);
    this.lastAlertTime.set(conditionId, this.currentTime);
    this.lastBarIndex.set(conditionId, this.currentBarIndex);

    if (this.config.enableLogging) {
      this.logEvent(event);
    }
  }

  private formatMessage(template: string): string {
    return template
      .replace('{time}', new Date(this.currentTime).toISOString())
      .replace('{bar_index}', String(this.currentBarIndex))
      .replace('{timestamp}', String(this.currentTime));
  }

  private logEvent(event: AlertEvent): void {
    if (this.config.logDestination === 'console') {
      console.log(`[ALERT] ${event.message}`);
    }
  }

  getConditions(): AlertCondition[] {
    return Array.from(this.conditions.values());
  }

  getEvents(): AlertEvent[] {
    return [...this.events];
  }

  getEventsForCondition(conditionId: string): AlertEvent[] {
    return this.events.filter((e) => e.conditionId === conditionId);
  }

  getEventsInTimeRange(start: number, end: number): AlertEvent[] {
    return this.events.filter((e) => e.timestamp >= start && e.timestamp <= end);
  }

  removeCondition(conditionId: string): boolean {
    return this.conditions.delete(conditionId);
  }

  clear(): void {
    this.conditions.clear();
    this.events = [];
    this.lastAlertTime.clear();
    this.lastBarIndex.clear();
  }
}
