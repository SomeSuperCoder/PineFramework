export type OrderDirection = 'long' | 'short';
export type OrderAction = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop-limit';
export type PositionDirection = 'long' | 'short' | 'flat';
export type QtyType = 'contracts' | 'percent_of_equity' | 'cash';
export type CommissionType = 'percent' | 'fixed' | 'per_contract' | 'per_order';

import type {
  CommissionCalculator,
  CommissionConfig,
  CommissionMethodId,
  CommissionMethodSettings,
} from './commission-calculator.js';
import {
  getCommissionCalculator,
  isLongOnlyEnforced,
  buildTradeContextFromFill,
} from './commission-calculator.js';

export interface Account {
  initialCapital: number;
  balance: number;
  equity: number;
  marginUsed: number;
  freeMargin: number;
}

export interface Order {
  id: string;
  symbol: string;
  direction: OrderDirection;
  action: OrderAction;
  type: OrderType;
  quantity: number;
  price: number;
  stopPrice?: number;
  limitPrice?: number;
  entryName: string;
  timestamp: number;
  barIndex: number;
  slippage: number;
  commission: number;
  ocaGroup?: string;
}

export interface FilledOrder extends Order {
  fillPrice: number;
  fillTime: number;
  fillBarIndex: number;
}

export interface Position {
  symbol: string;
  direction: PositionDirection;
  quantity: number;
  avgPrice: number;
  entryTime: number;
  entryBarIndex: number;
  entryName: string;
  pnl: number;
  pnlPercent: number;
  commission: number;
  unrealizedPnl: number;
}

export interface Trade {
  id: string;
  symbol: string;
  direction: OrderDirection;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  entryBarIndex: number;
  exitBarIndex: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  commission: number;
  entryName: string;
  exitName: string;
  mae: number;
  mfe: number;
  barsHeld: number;
}

export interface StrategyMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageTradeDuration: number;
  commission: number;
}

export interface StrategyConfig {
  initialCapital: number;
  commission: number;
  slippage: number;
  commissionType: CommissionType;
  slippageType: 'percent' | 'ticks' | 'points';
  defaultQty: number;
  defaultQtyType: QtyType;
  pyramiding: number;
  calcOnOrderFills: boolean;
  calcOnEveryTick: boolean;
  processOrdersOnClose: boolean;
  maxBarsBack: number;
  marginLong: number;
  marginShort: number;
  currency: string;
  /** Pluggable commission method ID. When set, overrides legacy commissionType/commission. */
  commissionMethod?: CommissionMethodId;
  /** Settings for the pluggable commission method. */
  commissionMethodSettings?: CommissionMethodSettings;
  /**
   * Trading pair symbol (e.g. "SOLUSDT", "BTCUSDT").
   * Used for auto-detecting Jupiter fee tiers from the token pair.
   * Optional — only relevant when using Jupiter Ultra commission method.
   */
  symbol?: string;
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  initialCapital: 10000,
  commission: 0,
  slippage: 0,
  commissionType: 'percent',
  slippageType: 'ticks',
  defaultQty: 100,
  defaultQtyType: 'percent_of_equity',
  pyramiding: 0,
  calcOnOrderFills: true,
  calcOnEveryTick: false,
  processOrdersOnClose: false,
  maxBarsBack: 0,
  marginLong: 0,
  marginShort: 0,
  currency: 'USD',
};

export interface StrategyMarker {
  type: 'entry' | 'exit' | 'order' | 'close' | 'close_all' | 'cancel' | 'cancel_all';
  orderId: string;
  name: string;
  direction: OrderDirection;
  action: OrderAction;
  quantity: number;
  price: number;
  barIndex: number;
  timestamp: number;
  color: string;
  comment?: string;
}

export class StrategyEngine {
  private config: StrategyConfig;
  private position: Position;
  private pendingOrders: Order[];
  private filledOrders: FilledOrder[];
  private trades: Trade[];
  private markers: StrategyMarker[];
  private equity: number;
  private peakEquity: number;
  private maxDrawdown: number;
  private barIndex: number;
  private timestamp: number;
  private currentPrice: number;
  private high: number;
  private low: number;
  private entries: number;
  private commissionCalculator: CommissionCalculator | undefined;
  private commissionConfig: CommissionConfig | undefined;
  private _lastMarkerCount: number = 0;
  private _nextOrderId: number = 0;

  constructor(config: Partial<StrategyConfig> = {}) {
    this.config = { ...DEFAULT_STRATEGY_CONFIG, ...config };

    // Initialize pluggable commission calculator if method is specified
    if (this.config.commissionMethod) {
      this.commissionCalculator = getCommissionCalculator(this.config.commissionMethod);
      this.commissionConfig = {
        method: this.config.commissionMethod,
        settings: this.config.commissionMethodSettings ?? null,
      };

      // Warn if both pluggable and legacy commission are configured
      if (this.config.commission !== 0) {
        console.warn(
          `[StrategyEngine] Both commissionMethod ('${this.config.commissionMethod}') and legacy commission (${this.config.commission}) are configured. The pluggable commissionMethod takes precedence and legacy commission will be ignored.`,
        );
      }
    }
    this.position = {
      symbol: '',
      direction: 'flat',
      quantity: 0,
      avgPrice: 0,
      entryTime: 0,
      entryBarIndex: 0,
      entryName: '',
      pnl: 0,
      pnlPercent: 0,
      commission: 0,
      unrealizedPnl: 0,
    };
    this.pendingOrders = [];
    this.filledOrders = [];
    this.trades = [];
    this.markers = [];
    this.equity = this.config.initialCapital;
    this.peakEquity = this.equity;
    this.maxDrawdown = 0;
    this.barIndex = 0;
    this.timestamp = 0;
    this.currentPrice = 0;
    this.high = 0;
    this.low = 0;
    this.entries = 0;
  }

  entry(
    name: string,
    direction: OrderDirection,
    quantity?: number,
    price: number = 0,
    stopPrice?: number,
    limitPrice?: number,
    comment?: string,
  ): Order | undefined {
    const hasStop = stopPrice !== undefined && stopPrice > 0;
    const hasLimit = limitPrice !== undefined && limitPrice > 0;
    const orderType: OrderType =
      hasStop && hasLimit ? 'stop-limit' : hasStop ? 'stop' : hasLimit ? 'limit' : 'market';

    if (orderType === 'market' && price === 0) {
      price = this.currentPrice;
    }

    if (quantity === undefined) {
      quantity = this.calculateQty(direction);
    }

    // Long-only enforcement: reject short entries when commission method requires it.
    // Close any existing long position first (the strategy intended a reversal).
    if (
      this.config.commissionMethod &&
      isLongOnlyEnforced(this.config.commissionMethod) &&
      direction === 'short'
    ) {
      if (this.position.direction === 'long') {
        this.close(this.position.entryName || name, 'reverse');
      }
      return undefined;
    }

    if (!this.canOpenPosition(direction, quantity)) {
      if (this.position.direction !== 'flat' && this.position.direction !== direction) {
        this.close(this.position.entryName || name, 'reverse');
      } else {
        console.log(
          `[StrategyEngine] entry REJECTED: name=${name} dir=${direction} qty=${quantity} price=${this.currentPrice} pos=${this.position.direction} entries=${this.entries} pyramiding=${this.config.pyramiding}`,
        );
        return undefined;
      }
    }

    const order: Order = {
      id: this.generateOrderId(),
      symbol: '',
      direction,
      action: direction === 'long' ? 'buy' : 'sell',
      type: orderType,
      quantity,
      price,
      stopPrice,
      limitPrice,
      entryName: name,
      timestamp: this.timestamp,
      barIndex: this.barIndex,
      slippage: this.config.slippage,
      commission: this.config.commission,
    };

    this.pendingOrders.push(order);
    this.entries++;
    console.log(
      `[StrategyEngine] entry CREATED: name=${name} dir=${direction} qty=${quantity} price=${this.currentPrice} orderId=${order.id}`,
    );

    this.markers.push({
      type: 'entry',
      orderId: order.id,
      name: name || (direction === 'long' ? 'Long' : 'Short'),
      direction,
      action: order.action,
      quantity,
      price,
      barIndex: this.barIndex,
      timestamp: this.timestamp,
      color: direction === 'long' ? '#00FF00' : '#FF0000',
      comment,
    });

    return order;
  }

  order(
    name: string,
    direction: OrderDirection,
    quantity?: number,
    price: number = 0,
    stopPrice?: number,
    limitPrice?: number,
  ): Order | undefined {
    if (quantity === undefined) {
      quantity = this.calculateQty(direction);
    }

    // Long-only enforcement: reject short orders when commission method requires it.
    // Allow sell orders that close an existing long position.
    if (
      this.config.commissionMethod &&
      isLongOnlyEnforced(this.config.commissionMethod) &&
      direction === 'short'
    ) {
      if (this.position.direction !== 'long') {
        return undefined;
      }
    }

    const hasStop = stopPrice !== undefined && stopPrice > 0;
    const hasLimit = limitPrice !== undefined && limitPrice > 0;
    const orderType: OrderType =
      hasStop && hasLimit ? 'stop-limit' : hasStop ? 'stop' : hasLimit ? 'limit' : 'market';

    if (orderType === 'market' && price === 0) {
      price = this.currentPrice;
    }

    const order: Order = {
      id: this.generateOrderId(),
      symbol: '',
      direction,
      action: direction === 'long' ? 'buy' : 'sell',
      type: orderType,
      quantity,
      price,
      stopPrice,
      limitPrice,
      entryName: name,
      timestamp: this.timestamp,
      barIndex: this.barIndex,
      slippage: this.config.slippage,
      commission: this.config.commission,
    };

    this.pendingOrders.push(order);

    this.markers.push({
      type: 'order',
      orderId: order.id,
      name,
      direction,
      action: order.action,
      quantity,
      price,
      barIndex: this.barIndex,
      timestamp: this.timestamp,
      color: '#FFFF00',
    });

    return order;
  }

  exit(
    name: string,
    quantity: number = this.position.quantity,
    price: number = 0,
    stopPrice?: number,
    limitPrice?: number,
    comment?: string,
  ): Order | undefined {
    let exitDirection: OrderDirection;
    let exitQuantity: number;
    let exitAction: 'buy' | 'sell';

    if (this.position.direction !== 'flat' && this.position.quantity > 0) {
      exitDirection = this.position.direction;
      exitQuantity = Math.min(quantity, this.position.quantity);
      exitAction = this.position.direction === 'long' ? 'sell' : 'buy';
    } else {
      const pendingEntry = this.pendingOrders.find((o) => o.type === 'market');
      if (!pendingEntry) return undefined;
      exitDirection = pendingEntry.direction;
      exitQuantity = quantity || pendingEntry.quantity;
      exitAction = pendingEntry.action === 'buy' ? 'sell' : 'buy';
    }

    const hasStop = stopPrice !== undefined && stopPrice > 0;
    const hasLimit = limitPrice !== undefined && limitPrice > 0;
    const orderType: OrderType =
      hasStop && hasLimit ? 'stop-limit' : hasStop ? 'stop' : hasLimit ? 'limit' : 'market';

    if (orderType === 'market' && price === 0) {
      price = this.currentPrice;
    }

    const order: Order = {
      id: this.generateOrderId(),
      symbol: this.position.symbol,
      direction: exitDirection,
      action: exitAction,
      type: orderType,
      quantity: exitQuantity,
      price,
      stopPrice,
      limitPrice,
      entryName: name,
      timestamp: this.timestamp,
      barIndex: this.barIndex,
      slippage: this.config.slippage,
      commission: this.config.commission,
    };

    if (orderType === 'market') {
      this.fillOrder(order, price);
    } else {
      this.pendingOrders.push(order);
    }

    this.markers.push({
      type: 'exit',
      orderId: order.id,
      name: `Exit ${name}`,
      direction: order.direction,
      action: order.action,
      quantity: order.quantity,
      price,
      barIndex: this.barIndex,
      timestamp: this.timestamp,
      color: order.direction === 'long' ? '#FF6600' : '#FF6600',
      comment,
    });

    return order;
  }

  close(name: string = 'close', comment?: string): Order | undefined {
    if (this.position.direction === 'flat' || this.position.quantity === 0) {
      return undefined;
    }

    const price = this.currentPrice;
    const order: Order = {
      id: this.generateOrderId(),
      symbol: this.position.symbol,
      direction: this.position.direction === 'long' ? 'long' : 'short',
      action: this.position.direction === 'long' ? 'sell' : 'buy',
      type: 'market',
      quantity: this.position.quantity,
      price,
      entryName: name,
      timestamp: this.timestamp,
      barIndex: this.barIndex,
      slippage: this.config.slippage,
      commission: this.config.commission,
    };

    this.pendingOrders.push(order);

    this.markers.push({
      type: 'close',
      orderId: order.id,
      name: `Exit ${name}`,
      direction: order.direction,
      action: order.action,
      quantity: order.quantity,
      price,
      barIndex: this.barIndex,
      timestamp: this.timestamp,
      color: '#FF0000',
      comment,
    });

    return order;
  }

  closeAll(name: string = 'close_all'): Order | undefined {
    return this.close(name);
  }

  cancel(orderId: string): boolean {
    const index = this.pendingOrders.findIndex((o) => o.id === orderId);
    if (index >= 0) {
      const order = this.pendingOrders[index]!;
      this.pendingOrders.splice(index, 1);

      this.markers.push({
        type: 'cancel',
        orderId: order.id,
        name: order.entryName,
        direction: order.direction,
        action: order.action,
        quantity: order.quantity,
        price: order.price,
        barIndex: this.barIndex,
        timestamp: this.timestamp,
        color: '#999999',
      });

      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const order of this.pendingOrders) {
      this.markers.push({
        type: 'cancel_all',
        orderId: order.id,
        name: order.entryName,
        direction: order.direction,
        action: order.action,
        quantity: order.quantity,
        price: order.price,
        barIndex: this.barIndex,
        timestamp: this.timestamp,
        color: '#999999',
      });
    }
    this.pendingOrders = [];
  }

  getMarkers(): StrategyMarker[] {
    return [...this.markers];
  }

  getNewMarkers(): StrategyMarker[] {
    const prev = this._lastMarkerCount || 0;
    const newMarkers = this.markers.slice(prev);
    this._lastMarkerCount = this.markers.length;
    return newMarkers;
  }

  saveState(): object {
    return {
      position: { ...this.position },
      pendingOrders: this.pendingOrders.map((o) => ({ ...o })),
      filledOrders: this.filledOrders.map((o) => ({ ...o })),
      trades: this.trades.map((t) => ({ ...t })),
      markers: this.markers.map((m) => ({ ...m })),
      equity: this.equity,
      peakEquity: this.peakEquity,
      maxDrawdown: this.maxDrawdown,
      entries: this.entries,
    };
  }

  restoreState(state: object): void {
    const s = state as {
      position: Position;
      pendingOrders: Order[];
      filledOrders: FilledOrder[];
      trades: Trade[];
      markers: StrategyMarker[];
      equity: number;
      peakEquity: number;
      maxDrawdown: number;
      entries: number;
    };
    this.position = { ...s.position };
    this.pendingOrders = s.pendingOrders.map((o) => ({ ...o }));
    this.filledOrders = s.filledOrders.map((o) => ({ ...o }));
    this.trades = s.trades.map((t) => ({ ...t }));
    this.markers = s.markers.map((m) => ({ ...m }));
    this.equity = s.equity;
    this.peakEquity = s.peakEquity;
    this.maxDrawdown = s.maxDrawdown;
    this.entries = s.entries;
  }

  private canOpenPosition(direction: OrderDirection, quantity: number): boolean {
    if (this.position.direction === 'flat') {
      const marginRate = direction === 'long' ? this.config.marginLong : this.config.marginShort;
      const marginRequired = this.currentPrice * quantity * marginRate;
      return marginRequired <= this.getAccount().freeMargin;
    }

    if (this.position.direction === direction) {
      if (this.entries >= this.config.pyramiding + 1) return false;
      const marginRate = direction === 'long' ? this.config.marginLong : this.config.marginShort;
      const marginRequired = this.currentPrice * quantity * marginRate;
      return marginRequired <= this.getAccount().freeMargin;
    }

    return false;
  }

  private fillOrder(order: Order, fillPrice: number): void {
    const slippage = this.calculateSlippage(order, fillPrice);
    const commission = this.calculateCommission(order, fillPrice);
    const adjustedPrice = order.action === 'buy' ? fillPrice + slippage : fillPrice - slippage;

    const filledOrder: FilledOrder = {
      ...order,
      fillPrice: adjustedPrice,
      fillTime: this.timestamp,
      fillBarIndex: this.barIndex,
    };

    this.filledOrders.push(filledOrder);

    const isFlat = this.position.direction === 'flat';

    if (order.action === 'buy') {
      if (isFlat) {
        this.openOrAddPosition('long', order.quantity, adjustedPrice, commission, order.entryName);
      } else {
        this.closeOrReducePosition(order.quantity, adjustedPrice, commission, order.entryName);
      }
    } else {
      if (isFlat) {
        this.openOrAddPosition('short', order.quantity, adjustedPrice, commission, order.entryName);
      } else {
        this.closeOrReducePosition(order.quantity, adjustedPrice, commission, order.entryName);
      }
    }

    this.equity -= commission;
    this.position.commission += commission;
  }

  private checkLiquidation(): void {
    if (this.position.direction === 'flat' || this.position.quantity === 0) return;

    const marginRate =
      this.position.direction === 'long' ? this.config.marginLong : this.config.marginShort;
    if (marginRate <= 0) return;

    const positionValue = this.currentPrice * this.position.quantity;
    const maintenanceMargin = positionValue * marginRate;
    const totalEquity = this.equity + this.position.unrealizedPnl;

    if (totalEquity < maintenanceMargin) {
      this.close('liquidation', 'Margin liquidation');
    }
  }

  private calculateSlippage(_order: Order, price: number): number {
    if (this.config.slippage === 0) return 0;

    if (this.config.slippageType === 'ticks' || this.config.slippageType === 'points') {
      return this.config.slippage;
    }

    return price * (this.config.slippage / 100);
  }

  private calculateCommission(order: Order, price: number): number {
    // Use pluggable commission calculator if configured (takes precedence over legacy)
    if (this.commissionCalculator && this.commissionConfig) {
      const context = buildTradeContextFromFill({
        direction: order.direction,
        fillPrice: price,
        quantity: order.quantity,
        symbol: this.config.symbol,
      });
      return this.commissionCalculator.calculate(context, this.commissionConfig);
    }

    // Legacy commission calculation
    // Note: order.commission field is set at order creation but is NOT used for charging.
    // Commission is calculated fresh at fill time based on current config.
    if (this.config.commission === 0) return 0;

    if (this.config.commissionType === 'fixed' || this.config.commissionType === 'per_order') {
      return this.config.commission;
    }

    if (this.config.commissionType === 'per_contract') {
      return this.config.commission * order.quantity;
    }

    // 'percent' type: commission as percentage of trade value
    return price * order.quantity * (this.config.commission / 100);
  }

  private openOrAddPosition(
    direction: OrderDirection,
    quantity: number,
    price: number,
    commission: number,
    entryName: string = '',
  ): void {
    if (this.position.direction === 'flat') {
      this.position = {
        symbol: '',
        direction,
        quantity,
        avgPrice: price,
        entryTime: this.timestamp,
        entryBarIndex: this.barIndex,
        entryName,
        pnl: 0,
        pnlPercent: 0,
        commission,
        unrealizedPnl: 0,
      };
    } else {
      const totalQuantity = this.position.quantity + quantity;
      this.position.avgPrice =
        (this.position.avgPrice * this.position.quantity + price * quantity) / totalQuantity;
      this.position.quantity = totalQuantity;
      this.position.commission += commission;
    }
  }

  private closeOrReducePosition(
    quantity: number,
    price: number,
    commission: number,
    exitName: string,
  ): void {
    const closeQuantity = Math.min(quantity, this.position.quantity);
    const pnl =
      this.position.direction === 'long'
        ? (price - this.position.avgPrice) * closeQuantity
        : (this.position.avgPrice - price) * closeQuantity;

    // MAE (Maximum Adverse Excursion) and MFE (Maximum Favorable Excursion)
    // For long: adverse = price drops (low), favorable = price rises (high)
    // For short: adverse = price rises (high), favorable = price drops (low)
    const mae =
      this.position.direction === 'long'
        ? ((this.position.avgPrice - this.low) / this.position.avgPrice) * 100
        : ((this.high - this.position.avgPrice) / this.position.avgPrice) * 100;

    const mfe =
      this.position.direction === 'long'
        ? ((this.high - this.position.avgPrice) / this.position.avgPrice) * 100
        : ((this.position.avgPrice - this.low) / this.position.avgPrice) * 100;

    const trade: Trade = {
      id: `trade_${this.trades.length + 1}`,
      symbol: this.position.symbol,
      direction: this.position.direction as OrderDirection,
      entryPrice: this.position.avgPrice,
      exitPrice: price,
      entryTime: this.position.entryTime,
      exitTime: this.timestamp,
      entryBarIndex: this.position.entryBarIndex,
      exitBarIndex: this.barIndex,
      quantity: closeQuantity,
      pnl: pnl - commission,
      pnlPercent:
        this.position.avgPrice > 0
          ? (() => {
              const positionValue = this.position.avgPrice * this.position.quantity;
              const marginRate =
                this.position.direction === 'long'
                  ? this.config.marginLong
                  : this.config.marginShort;
              const capitalAtRisk = marginRate > 0 ? positionValue * marginRate : positionValue;
              return capitalAtRisk > 0 ? (pnl / capitalAtRisk) * 100 : 0;
            })()
          : 0,
      commission,
      entryName: '',
      exitName,
      mae: Math.max(0, mae),
      mfe: Math.max(0, mfe),
      barsHeld: this.barIndex - this.position.entryBarIndex,
    };

    this.trades.push(trade);
    this.equity += pnl - commission;

    this.position.quantity -= closeQuantity;
    if (this.position.quantity <= 0) {
      this.entries = 0;
      this.position = {
        symbol: '',
        direction: 'flat',
        quantity: 0,
        avgPrice: 0,
        entryTime: 0,
        entryBarIndex: 0,
        entryName: '',
        pnl: 0,
        pnlPercent: 0,
        commission: 0,
        unrealizedPnl: 0,
      };
    }

    this.updateDrawdown();
  }

  private updateDrawdown(): void {
    if (this.equity > this.peakEquity) {
      this.peakEquity = this.equity;
    }

    const drawdown = this.peakEquity - this.equity;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
  }

  updateBar(
    barIndex: number,
    timestamp: number,
    open: number,
    high: number,
    low: number,
    close: number,
    _volume: number,
  ): void {
    this.barIndex = barIndex;
    this.timestamp = timestamp;
    this.currentPrice = close;
    this.high = high;
    this.low = low;

    this.fillPendingMarketOrders(open);
    this.processPendingOrders(high, low);
    this.updatePositionPnL(close);
    this.checkLiquidation();
  }

  private fillPendingMarketOrders(open: number): void {
    const marketOrders = this.pendingOrders.filter((o) => o.type === 'market');
    this.pendingOrders = this.pendingOrders.filter((o) => o.type !== 'market');

    for (const order of marketOrders) {
      console.log(
        `[StrategyEngine] fillMarketOrder: orderId=${order.id} action=${order.action} qty=${order.quantity} open=${open}`,
      );
      this.fillOrder(order, open);
    }
    if (marketOrders.length > 0) {
      console.log(
        `[StrategyEngine] after fill: pos=${this.position.direction} qty=${this.position.quantity}`,
      );
    }
  }

  private processPendingOrders(high: number, low: number): void {
    const ordersToFill: Order[] = [];
    const stopLimitTriggers: Order[] = [];

    this.pendingOrders = this.pendingOrders.filter((order) => {
      if (order.type === 'limit') {
        const limitHit =
          order.action === 'buy'
            ? low <= (order.limitPrice ?? order.price)
            : high >= (order.limitPrice ?? order.price);
        if (limitHit) {
          ordersToFill.push(order);
          return false;
        }
      } else if (order.type === 'stop') {
        const stopHit =
          order.action === 'buy'
            ? high >= (order.stopPrice ?? order.price)
            : low <= (order.stopPrice ?? order.price);
        if (stopHit) {
          ordersToFill.push(order);
          return false;
        }
      } else if (order.type === 'stop-limit') {
        const stopHit =
          order.action === 'buy'
            ? high >= (order.stopPrice ?? order.price)
            : low <= (order.stopPrice ?? order.price);
        if (stopHit) {
          stopLimitTriggers.push(order);
          return false;
        }
      }
      return true;
    });

    for (const order of ordersToFill) {
      const fillPrice =
        order.type === 'limit'
          ? (order.limitPrice ?? order.price)
          : (order.stopPrice ?? order.price);
      this.fillOrder(order, fillPrice);
    }

    for (const order of stopLimitTriggers) {
      const limitPrice = order.limitPrice ?? order.price;
      const limitHit = order.action === 'buy' ? low <= limitPrice : high >= limitPrice;
      if (limitHit) {
        this.fillOrder(order, limitPrice);
      } else {
        const limitOrder: Order = {
          ...order,
          id: this.generateOrderId(),
          type: 'limit',
          price: limitPrice,
          stopPrice: undefined,
        };
        this.pendingOrders.push(limitOrder);
      }
    }
  }

  private updatePositionPnL(currentPrice: number): void {
    if (this.position.direction === 'flat') return;

    this.position.unrealizedPnl =
      this.position.direction === 'long'
        ? (currentPrice - this.position.avgPrice) * this.position.quantity
        : (this.position.avgPrice - currentPrice) * this.position.quantity;

    this.position.pnl = this.position.unrealizedPnl;

    this.position.pnlPercent =
      this.position.avgPrice > 0
        ? ((currentPrice - this.position.avgPrice) / this.position.avgPrice) *
          100 *
          (this.position.direction === 'long' ? 1 : -1)
        : 0;

    const totalEquity = this.equity + this.position.unrealizedPnl;
    if (totalEquity > this.peakEquity) {
      this.peakEquity = totalEquity;
    }

    const drawdown = this.peakEquity - totalEquity;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
  }

  getPosition(): Position {
    return { ...this.position };
  }

  getConfig(): Readonly<StrategyConfig> {
    return this.config;
  }

  getEquity(): number {
    return this.equity;
  }

  getPeakEquity(): number {
    return this.peakEquity;
  }

  private generateOrderId(): string {
    return `order_${++this._nextOrderId}`;
  }

  getMaxDrawdown(): number {
    return this.maxDrawdown;
  }

  getPendingOrders(): Order[] {
    return [...this.pendingOrders];
  }

  getFilledOrders(): FilledOrder[] {
    return [...this.filledOrders];
  }

  getTrades(): Trade[] {
    return [...this.trades];
  }

  getAccount(): Account {
    const marginRate =
      this.position.direction === 'long' ? this.config.marginLong : this.config.marginShort;
    const positionValue = this.currentPrice * this.position.quantity;
    const marginUsed = this.position.direction !== 'flat' ? positionValue * marginRate : 0;
    const totalEquity = this.equity + this.position.unrealizedPnl;

    return {
      initialCapital: this.config.initialCapital,
      balance: this.equity,
      equity: totalEquity,
      marginUsed,
      freeMargin: totalEquity - marginUsed,
    };
  }

  calculateQty(_direction: OrderDirection): number {
    switch (this.config.defaultQtyType) {
      case 'percent_of_equity': {
        const account = this.getAccount();
        const cashAmount = account.equity * (this.config.defaultQty / 100);
        return this.currentPrice > 0 ? cashAmount / this.currentPrice : 0;
      }
      case 'cash': {
        return this.currentPrice > 0 ? this.config.defaultQty / this.currentPrice : 0;
      }
      default:
        return this.config.defaultQty;
    }
  }

  getMetrics(): StrategyMetrics {
    const trades = this.trades;
    const winningTrades = trades.filter((t) => t.pnl > 0);
    const losingTrades = trades.filter((t) => t.pnl <= 0);

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalCommission = trades.reduce((sum, t) => sum + t.commission, 0);

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

    const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

    const returns = trades.map((t) => t.pnlPercent / 100);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn =
      returns.length > 1
        ? Math.sqrt(
            returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1),
          )
        : 0;

    const downsideReturns = returns.filter((r) => r < 0);
    const downsideDev =
      downsideReturns.length > 1
        ? Math.sqrt(
            downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length,
          )
        : 0;

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      totalPnl,
      totalPnlPercent:
        this.config.initialCapital > 0 ? (totalPnl / this.config.initialCapital) * 100 : 0,
      maxDrawdown: this.maxDrawdown,
      maxDrawdownPercent: this.peakEquity > 0 ? (this.maxDrawdown / this.peakEquity) * 100 : 0,
      sharpeRatio: stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0,
      sortinoRatio: downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0,
      averageWin: avgWin,
      averageLoss: avgLoss,
      largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.pnl)) : 0,
      largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.pnl)) : 0,
      averageTradeDuration:
        trades.length > 0
          ? trades.reduce((sum, t) => sum + (t.exitBarIndex - t.entryBarIndex), 0) / trades.length
          : 0,
      commission: totalCommission,
    };
  }

  reset(): void {
    this._nextOrderId = 0;
    this.position = {
      symbol: '',
      direction: 'flat',
      quantity: 0,
      avgPrice: 0,
      entryTime: 0,
      entryBarIndex: 0,
      entryName: '',
      pnl: 0,
      pnlPercent: 0,
      commission: 0,
      unrealizedPnl: 0,
    };
    this.pendingOrders = [];
    this.filledOrders = [];
    this.trades = [];
    this.markers = [];
    this._lastMarkerCount = 0;
    this.equity = this.config.initialCapital;
    this.peakEquity = this.equity;
    this.maxDrawdown = 0;
  }
}
