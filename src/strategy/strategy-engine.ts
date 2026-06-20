export type OrderDirection = 'long' | 'short';
export type OrderAction = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type PositionDirection = 'long' | 'short' | 'flat';

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
  pnl: number;
  pnlPercent: number;
  commission: number;
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
  commissionType: 'percent' | 'fixed';
  slippageType: 'percent' | 'ticks';
  defaultQty: number;
  pyramiding: number;
  calcOnOrderFills: boolean;
  calcOnEveryTick: boolean;
  processOrdersOnClose: boolean;
  maxBarsBack: number;
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  initialCapital: 10000,
  commission: 0,
  slippage: 0,
  commissionType: 'percent',
  slippageType: 'ticks',
  defaultQty: 1,
  pyramiding: 0,
  calcOnOrderFills: true,
  calcOnEveryTick: false,
  processOrdersOnClose: false,
  maxBarsBack: 0,
};

let orderIdCounter = 0;

function generateOrderId(): string {
  return `order_${++orderIdCounter}`;
}

export function resetOrderIdCounter(): void {
  orderIdCounter = 0;
}

export class StrategyEngine {
  private config: StrategyConfig;
  private position: Position;
  private pendingOrders: Order[];
  private filledOrders: FilledOrder[];
  private trades: Trade[];
  private equity: number;
  private peakEquity: number;
  private maxDrawdown: number;
  private barIndex: number;
  private timestamp: number;
  private currentPrice: number;

  constructor(config: Partial<StrategyConfig> = {}) {
    this.config = { ...DEFAULT_STRATEGY_CONFIG, ...config };
    this.position = {
      symbol: '',
      direction: 'flat',
      quantity: 0,
      avgPrice: 0,
      entryTime: 0,
      entryBarIndex: 0,
      pnl: 0,
      pnlPercent: 0,
      commission: 0,
    };
    this.pendingOrders = [];
    this.filledOrders = [];
    this.trades = [];
    this.equity = this.config.initialCapital;
    this.peakEquity = this.equity;
    this.maxDrawdown = 0;
    this.barIndex = 0;
    this.timestamp = 0;
    this.currentPrice = 0;
  }

  entry(
    name: string,
    direction: OrderDirection,
    quantity: number = this.config.defaultQty,
    price: number = 0,
    stopPrice?: number,
    limitPrice?: number,
  ): Order | undefined {
    const orderType: OrderType = stopPrice !== undefined ? 'stop' : limitPrice !== undefined ? 'limit' : 'market';

    if (orderType === 'market' && price === 0) {
      price = this.currentPrice;
    }

    if (!this.canOpenPosition(direction, quantity)) {
      return undefined;
    }

    const order: Order = {
      id: generateOrderId(),
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

    if (orderType === 'market') {
      this.fillOrder(order, price);
    } else {
      this.pendingOrders.push(order);
    }

    return order;
  }

  exit(
    name: string,
    quantity: number = this.position.quantity,
    price: number = 0,
    stopPrice?: number,
    limitPrice?: number,
  ): Order | undefined {
    if (this.position.direction === 'flat' || this.position.quantity === 0) {
      return undefined;
    }

    const orderType: OrderType = stopPrice !== undefined ? 'stop' : limitPrice !== undefined ? 'limit' : 'market';

    if (orderType === 'market' && price === 0) {
      price = this.currentPrice;
    }

    const order: Order = {
      id: generateOrderId(),
      symbol: this.position.symbol,
      direction: this.position.direction === 'long' ? 'long' : 'short',
      action: this.position.direction === 'long' ? 'sell' : 'buy',
      type: orderType,
      quantity: Math.min(quantity, this.position.quantity),
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

    return order;
  }

  close(name: string = 'close'): Order | undefined {
    return this.exit(name, this.position.quantity);
  }

  cancel(orderId: string): boolean {
    const index = this.pendingOrders.findIndex((o) => o.id === orderId);
    if (index >= 0) {
      this.pendingOrders.splice(index, 1);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    this.pendingOrders = [];
  }

  private canOpenPosition(direction: OrderDirection, _quantity: number): boolean {
    if (this.position.direction === 'flat') {
      return true;
    }

    if (this.position.direction === direction) {
      const currentPyramiding = this.position.quantity / this.config.defaultQty;
      return currentPyramiding < this.config.pyramiding + 1;
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
        this.openOrAddPosition('long', order.quantity, adjustedPrice, commission);
      } else {
        this.closeOrReducePosition(order.quantity, adjustedPrice, commission, order.entryName);
      }
    } else {
      if (isFlat) {
        this.openOrAddPosition('short', order.quantity, adjustedPrice, commission);
      } else {
        this.closeOrReducePosition(order.quantity, adjustedPrice, commission, order.entryName);
      }
    }

    this.equity -= commission;
    this.position.commission += commission;
  }

  private calculateSlippage(_order: Order, price: number): number {
    if (this.config.slippage === 0) return 0;

    if (this.config.slippageType === 'ticks') {
      return this.config.slippage;
    }

    return price * (this.config.slippage / 100);
  }

  private calculateCommission(order: Order, price: number): number {
    if (this.config.commission === 0) return 0;

    if (this.config.commissionType === 'fixed') {
      return this.config.commission;
    }

    return price * order.quantity * (this.config.commission / 100);
  }

  private openOrAddPosition(
    direction: OrderDirection,
    quantity: number,
    price: number,
    commission: number,
  ): void {
    if (this.position.direction === 'flat') {
      this.position = {
        symbol: '',
        direction,
        quantity,
        avgPrice: price,
        entryTime: this.timestamp,
        entryBarIndex: this.barIndex,
        pnl: 0,
        pnlPercent: 0,
        commission,
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
    const pnl = this.position.direction === 'long'
      ? (price - this.position.avgPrice) * closeQuantity
      : (this.position.avgPrice - price) * closeQuantity;

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
      pnlPercent: this.position.avgPrice > 0
        ? ((price - this.position.avgPrice) / this.position.avgPrice) * 100 * (this.position.direction === 'long' ? 1 : -1)
        : 0,
      commission,
      entryName: '',
      exitName,
    };

    this.trades.push(trade);
    this.equity += pnl - commission;

    this.position.quantity -= closeQuantity;
    if (this.position.quantity <= 0) {
      this.position = {
        symbol: '',
        direction: 'flat',
        quantity: 0,
        avgPrice: 0,
        entryTime: 0,
        entryBarIndex: 0,
        pnl: 0,
        pnlPercent: 0,
        commission: 0,
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
    _open: number,
    high: number,
    low: number,
    close: number,
    _volume: number,
  ): void {
    this.barIndex = barIndex;
    this.timestamp = timestamp;
    this.currentPrice = close;

    this.processPendingOrders(high, low);
    this.updatePositionPnL(close);
  }

  private processPendingOrders(high: number, low: number): void {
    const ordersToFill: Order[] = [];

    this.pendingOrders = this.pendingOrders.filter((order) => {
      if (order.type === 'limit') {
        const limitHit = order.action === 'buy'
          ? low <= (order.limitPrice ?? order.price)
          : high >= (order.limitPrice ?? order.price);
        if (limitHit) {
          ordersToFill.push(order);
          return false;
        }
      } else if (order.type === 'stop') {
        const stopHit = order.action === 'buy'
          ? high >= (order.stopPrice ?? order.price)
          : low <= (order.stopPrice ?? order.price);
        if (stopHit) {
          ordersToFill.push(order);
          return false;
        }
      }
      return true;
    });

    for (const order of ordersToFill) {
      const fillPrice = order.type === 'limit'
        ? (order.limitPrice ?? order.price)
        : (order.stopPrice ?? order.price);
      this.fillOrder(order, fillPrice);
    }
  }

  private updatePositionPnL(currentPrice: number): void {
    if (this.position.direction === 'flat') return;

    this.position.pnl = this.position.direction === 'long'
      ? (currentPrice - this.position.avgPrice) * this.position.quantity
      : (this.position.avgPrice - currentPrice) * this.position.quantity;

    this.position.pnlPercent = this.position.avgPrice > 0
      ? ((currentPrice - this.position.avgPrice) / this.position.avgPrice) * 100 * (this.position.direction === 'long' ? 1 : -1)
      : 0;

    const totalEquity = this.equity + this.position.pnl;
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

  getEquity(): number {
    return this.equity;
  }

  getPeakEquity(): number {
    return this.peakEquity;
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
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 0;

    const downsideReturns = returns.filter((r) => r < 0);
    const downsideDev = downsideReturns.length > 1
      ? Math.sqrt(downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length)
      : 0;

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      totalPnl,
      totalPnlPercent: this.config.initialCapital > 0
        ? (totalPnl / this.config.initialCapital) * 100
        : 0,
      maxDrawdown: this.maxDrawdown,
      maxDrawdownPercent: this.peakEquity > 0
        ? (this.maxDrawdown / this.peakEquity) * 100
        : 0,
      sharpeRatio: stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0,
      sortinoRatio: downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0,
      averageWin: avgWin,
      averageLoss: avgLoss,
      largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.pnl)) : 0,
      largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.pnl)) : 0,
      averageTradeDuration: trades.length > 0
        ? trades.reduce((sum, t) => sum + (t.exitBarIndex - t.entryBarIndex), 0) / trades.length
        : 0,
      commission: totalCommission,
    };
  }

  reset(): void {
    resetOrderIdCounter();
    this.position = {
      symbol: '',
      direction: 'flat',
      quantity: 0,
      avgPrice: 0,
      entryTime: 0,
      entryBarIndex: 0,
      pnl: 0,
      pnlPercent: 0,
      commission: 0,
    };
    this.pendingOrders = [];
    this.filledOrders = [];
    this.trades = [];
    this.equity = this.config.initialCapital;
    this.peakEquity = this.equity;
    this.maxDrawdown = 0;
  }
}
