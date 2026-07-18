import fs from 'fs';
import { parse } from '../src/language/parser/parser.js';
import { compile } from '../src/language/compiler/compiler.js';
import { ExecutionEngine, type ExecutionContext } from '../src/language/runtime/execution-engine.js';
import { createSeries } from '../src/language/runtime/series.js';

// Simulate the exact frontend flow: engine -> buildScriptResult -> ChartComponent -> PineChart
async function fetchBybitBars(symbol: string, interval: string, endTime: number, limit: number) {
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&endTime=${endTime}&limit=${limit}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.retCode !== 0) throw new Error(`Bybit API error: ${data.retMsg}`);
  return data.result.list.reverse().map((k: any) => ({
    timestamp: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

test('Full frontend flow debug for Q-Trend', async () => {
  const targetTime = Date.UTC(2026, 5, 17, 22, 0, 0);
  const bars = await fetchBybitBars('BTCUSDT', '60', Date.UTC(2026, 5, 17, 22, 0, 0), 600);
  
  const scriptContent = fs.readFileSync('./test_indicators/q-trend.pine', 'utf-8');
  const parseResult = parse(scriptContent);
  const compileResult = compile(parseResult.ast);
  const engine = new ExecutionEngine(compileResult);
  
  const contexts = bars.map((bar, i) => ({
    barIndex: i,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
    high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
    low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
    close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
    volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
  }));
  
  const result = engine.executeBars(contexts);
  
  // Simulate ChartComponent's buildScriptResult
  const allResults: Array<{ result: typeof result }> = [{ result }];
  const indicatorResults = new Map(); // no additional indicators
  
  // Build shape markers exactly like ChartComponent does
  const data = bars.map(b => ({
    time: b.timestamp,
    open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume
  }));
  
  const allShapeMarkers: any[] = [];
  const ohlcvMap = new Map<number, any>();
  for (let i = 0; i < data.length; i++) {
    ohlcvMap.set(data[i].time, data[i]);
  }
  
  for (const { result: res } of allResults) {
    // Find pane index for this result
    const resultPaneIndex = Array.from([]).findIndex(([, v]) => v === res); // indicatorResults is empty
    const paneIndex = resultPaneIndex >= 0 ? resultPaneIndex : 0;
    
    console.log(`Result: overlay=${res.overlay}, paneIndex=${paneIndex}`);
    
    for (const s of (res.shapes || [])) {
      const candle = ohlcvMap.get(s.time);
      let barIdx = -1;
      if (candle) {
        for (let i = 0; i < data.length; i++) {
          if (data[i] === candle) { barIdx = i; break; }
        }
      }
      const marker = {
        time: s.time,
        position: (s.location || 'abovebar'),
        shape: s.style || s.type,
        color: s.color || '#2196f3',
        text: s.text || undefined,
        textcolor: s.textcolor,
        barIndex: barIdx >= 0 ? barIdx : undefined,
        price: s.price,
        overlay: s.overlay,
        paneIndex,
      };
      console.log(`  ShapeMarker: "${marker.text}" overlay=${marker.overlay} paneIndex=${marker.paneIndex} pos=${marker.position} shape=${marker.shape}`);
    }
  }
  
  // Now simulate PineChart rendering
  console.log('\n=== PineChart rendering ===');
  console.log('Main chart overlay shapes:');
  const overlayShapes = result.shapes.filter(s => s.overlay !== false);
  console.log(`  Count: ${overlayShapes.length}`);
  for (const s of overlayShapes.slice(0, 10)) {
    console.log(`  "${s.text}" overlay=${s.overlay} time=${new Date(s.time).toISOString()}`);
  }
  
  console.log('\nNon-overlay shapes (should be in indicator panes):');
  const nonOverlayShapes = result.shapes.filter(s => s.overlay === false);
  console.log(`  Count: ${nonOverlayShapes.length}`);
  
  expect(true).toBe(true);
}, 120000);
