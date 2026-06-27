import { Router } from 'express';
import { createPineScriptEngine, type Bar } from 'pine-framework';

const engine = createPineScriptEngine();

function pineValueToJSON(v: unknown): number | string | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'symbol') return null;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
  return null;
}

export const executeRouter = Router();

executeRouter.post('/execute', async (req, res) => {
  try {
    const { source, bars } = req.body as { source: string; bars: Bar[] };

    if (!source || typeof source !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "source" field' });
      return;
    }
    if (!Array.isArray(bars) || bars.length === 0) {
      res.status(400).json({ error: 'Missing or empty "bars" array' });
      return;
    }

    const result = engine.execute(source, bars);

    const outputs: Record<string, (number | string | boolean | null)[]> = {};
    if (result.outputs) {
      for (const [key, series] of result.outputs) {
        outputs[key] = Array.from(series.values).map(pineValueToJSON);
      }
    }

    const plotColors: Record<string, (string | null)[]> = {};
    if (result.plotColors) {
      for (const [key, colors] of result.plotColors) {
        plotColors[key] = Array.from(colors);
      }
    }

    const fillColorData: Record<string, (string | null)[]> = {};
    if (result.fillColorData) {
      for (const [key, colors] of result.fillColorData) {
        fillColorData[key] = Array.from(colors);
      }
    }

    const shapes = (result.shapes || []).map((s) => ({
      style: s.style,
      location: s.location,
      color: s.color,
      time: s.time,
      text: s.text,
    }));

    const fills = (result.fills || []).map((f) => ({
      from: f.from,
      to: f.to,
      color: f.color,
    }));

    const bgcolor = (result.bgcolor || []).map((b) => ({
      time: b.time,
      color: b.color,
    }));

    const strategyMarkers = (result.strategyMarkers || []).map((m) => ({
      type: m.type,
      name: m.name,
      direction: m.direction,
      action: m.action,
      quantity: m.quantity,
      price: m.price,
      barIndex: m.barIndex,
      timestamp: m.timestamp,
      color: m.color,
      comment: m.comment,
    }));

    const barTimestamps = result.barTimestamps ?? [];
    const lines = (result.lines || []).map((l) => ({
      points: [
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x1] ?? l.x1) : l.x1, price: l.y1 },
        { time: l.xloc === 'bar_index' ? (barTimestamps[l.x2] ?? l.x2) : l.x2, price: l.y2 },
      ],
      color: l.color,
      width: l.width,
      style: l.style === 'style_dotted' ? 'dotted' : l.style === 'style_dashed' ? 'dashed' : 'solid',
    }));

    const labels = (result.labels || []).map((l) => ({
      time: l.time,
      price: l.price,
      text: l.text,
      color: l.color,
      textColor: l.textcolor,
      style: l.style,
      size: l.size,
    }));

    res.json({
      success: result.success,
      error: result.error,
      outputs,
      plotColors,
      fillColorData,
      shapes,
      fills,
      bgcolor,
      strategyMarkers,
      lines,
      labels,
    });
  } catch (err) {
    console.error('[Execute] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown execution error';
    const isClientError = message.includes('Parse') || message.includes('Syntax') || message.includes('version');
    res.status(isClientError ? 400 : 500).json({
      success: false,
      error: message,
    });
  }
});
