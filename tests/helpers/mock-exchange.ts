/**
 * Mock Exchange for testing Pine Script strategies without blockchain interaction.
 * Records orders and tracks positions without executing real transactions.
 */

export interface Order {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  action: 'entry' | 'close';
  quantity: number;
  price: number;
  timestamp: number;
  barIndex: number;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  entryTimestamp: number;
  entryBarIndex: number;
}

export interface TradeResult {
  orderId: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  entryTimestamp: number;
  exitTimestamp: number;
  entryBarIndex: number;
  exitBarIndex: number;
}

export interface TestReport {
  totalOrders: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  initialEquity: number;
  finalEquity: number;
  orders: Order[];
  trades: TradeResult[];
}

export class MockExchange {
  private orders: Order[] = [];
  private currentPosition: Position | null = null;
  private completedTrades: TradeResult[] = [];
  private initialEquity: number;
  private currentEquity: number;
  private orderCounter = 0;

  constructor(initialEquity: number = 10000) {
    this.initialEquity = initialEquity;
    this.currentEquity = initialEquity;
  }

  /**
   * Place an order without blockchain interaction
   */
  placeOrder(
    symbol: string,
    side: 'long' | 'short',
    action: 'entry' | 'close',
    quantity: number,
    price: number,
    timestamp: number,
    barIndex: number,
  ): Order {
    const order: Order = {
      id: `ORDER_${++this.orderCounter}`,
      symbol,
      side,
      action,
      quantity,
      price,
      timestamp,
      barIndex,
    };

    this.orders.push(order);
    return order;
  }

  /**
   * Open a position
   */
  openPosition(
    symbol: string,
    side: 'long' | 'short',
    quantity: number,
    price: number,
    timestamp: number,
    barIndex: number,
  ): void {
    if (this.currentPosition) {
      throw new Error('Cannot open position: already in a position');
    }

    this.currentPosition = {
      symbol,
      side,
      quantity,
      entryPrice: price,
      entryTimestamp: timestamp,
      entryBarIndex: barIndex,
    };
  }

  /**
   * Close the current position
   */
  closePosition(exitPrice: number, timestamp: number, barIndex: number): TradeResult | null {
    if (!this.currentPosition) {
      return null;
    }

    const { symbol, side, quantity, entryPrice, entryTimestamp, entryBarIndex } =
      this.currentPosition;

    // Calculate P&L
    let pnl: number;
    if (side === 'long') {
      pnl = (exitPrice - entryPrice) * quantity;
    } else {
      pnl = (entryPrice - exitPrice) * quantity;
    }

    const trade: TradeResult = {
      orderId: `TRADE_${this.completedTrades.length + 1}`,
      symbol,
      side,
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      entryTimestamp,
      exitTimestamp: timestamp,
      entryBarIndex,
      exitBarIndex: barIndex,
    };

    this.completedTrades.push(trade);
    this.currentEquity += pnl;
    this.currentPosition = null;

    return trade;
  }

  /**
   * Calculate position size based on equity percentage
   */
  calculatePositionSize(percentOfEquity: number, price: number): number {
    const equity = this.getEquity();
    const notionalValue = (equity * percentOfEquity) / 100;
    return notionalValue / price;
  }

  /**
   * Get current equity
   */
  getEquity(): number {
    return this.currentEquity;
  }

  /**
   * Get initial equity
   */
  getInitialEquity(): number {
    return this.initialEquity;
  }

  /**
   * Get current position
   */
  getPosition(): Position | null {
    return this.currentPosition;
  }

  /**
   * Check if currently in a position
   */
  isInPosition(): boolean {
    return this.currentPosition !== null;
  }

  /**
   * Get all orders
   */
  getOrders(): Order[] {
    return [...this.orders];
  }

  /**
   * Get completed trades
   */
  getTrades(): TradeResult[] {
    return [...this.completedTrades];
  }

  /**
   * Generate test report
   */
  generateReport(): TestReport {
    const totalOrders = this.orders.length;
    const totalTrades = this.completedTrades.length;
    const winningTrades = this.completedTrades.filter((t) => t.pnl > 0).length;
    const losingTrades = this.completedTrades.filter((t) => t.pnl < 0).length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const totalPnl = this.completedTrades.reduce((sum, t) => sum + t.pnl, 0);

    return {
      totalOrders,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnl,
      initialEquity: this.initialEquity,
      finalEquity: this.currentEquity,
      orders: [...this.orders],
      trades: [...this.completedTrades],
    };
  }

  /**
   * Reset the exchange
   */
  reset(): void {
    this.orders = [];
    this.currentPosition = null;
    this.completedTrades = [];
    this.currentEquity = this.initialEquity;
    this.orderCounter = 0;
  }
}
