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

    res.json({
      success: result.success,
      error: result.error,
      outputs,
      shapes,
      fills,
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
