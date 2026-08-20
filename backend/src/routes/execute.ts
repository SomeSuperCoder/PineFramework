/**
 * REST /execute route — adapts the engine ExecutionResult to the SHARED wire
 * contract (pine-framework/contracts, B1). The wire SHAPE is the contract's
 * ExecutionResultMessage FULL variant + the REST-only maxLookback field; this
 * file owns the engine→contract mapping and the normalize() backstop.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Bar, PineScriptEngine } from 'pine-framework';
import {
  normalizeExecutionResultMessage,
  type ColorValuesMap,
  type ExecuteResponse,
  type ExecutionResultFullMessage,
  type ExecutionResultMessageInput,
  type LineData,
  type OutputValuesMap,
} from 'pine-framework/contracts';
import type { CancellationRegistry } from '../cancellation-registry.js';

/** Escape HTML entities to prevent XSS in rendered label/shape text. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function pineValueToJSON(v: unknown): number | string | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'symbol') return null;
  if (typeof v === 'number' && !isFinite(v)) return null;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
  return null;
}

/**
 * B2: the execute route is now a FACTORY so the engine and the cancellation
 * registry are injected from the composition root (DI — the module previously
 * held a module-level engine singleton and a module-level router, both
 * implicit dependencies). The registry lets DELETE /api/indicators/:id and WS
 * stop_indicator cancel an in-flight REST computation promptly.
 */
export function createExecuteRouter(
  engine: PineScriptEngine,
  registry: CancellationRegistry,
): Router {
  const router = Router();

  router.post('/execute', async (req, res) => {
    try {
      const {
        source,
        bars,
        offset = 0,
        indicatorId,
      } = req.body as {
        source: string;
        bars: Bar[];
        offset?: number;
        indicatorId?: string;
      };

      if (!source || typeof source !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "source" field' });
        return;
      }
      if (!Array.isArray(bars) || bars.length === 0) {
        res.status(400).json({ error: 'Missing or empty "bars" array' });
        return;
      }

      // B2: key this run's token by the caller's indicator id so DELETE
      // /api/indicators/:id and WS stop_indicator can cancel the computation
      // while it is still in flight (user intent: removal takes effect
      // promptly). No id in the body → a fresh run id (not cancellable by id,
      // but the token-check + cleanup seam stays uniform for every run).
      const runId =
        typeof indicatorId === 'string' && indicatorId.trim() !== '' ? indicatorId : randomUUID();
      const token = registry.create(runId);
      try {
        // B1 made execute ASYNC — the previous non-awaited call returned a
        // Promise that was consumed as if it were the result (cosmetic async:
        // the response raced the computation). Awaiting is mandatory now.
        const result = await engine.execute(source, bars, token);

        // B2: re-check AFTER the run resolves — a cancel that landed between the
        // last yield and this line must not deliver a stale full result. The
        // frontend's stale-result seam drops responses carrying cancelled:true.
        if (token.isCancelled) {
          res.json({ success: false, cancelled: true, error: 'Execution cancelled' });
          return;
        }

        const keepCount = offset > 0 ? Math.max(0, bars.length - offset) : bars.length;

        // Wire SHAPE comes from the contract (SSOT) — these are the contract's
        // element types, not engine types. Wire invariance: same fields, same
        // values, same types as pre-B3 (except isConfirmed added at the end).
        const outputs: OutputValuesMap = {};
        if (result.outputs) {
          for (const [key, series] of result.outputs) {
            const values = Array.from(series.values).map(pineValueToJSON);
            outputs[key] = values.slice(0, keepCount);
          }
        }

        const plotColors: ColorValuesMap = {};
        if (result.plotColors) {
          for (const [key, colors] of result.plotColors) {
            const arr = Array.from(colors);
            plotColors[key] = arr.slice(0, keepCount);
          }
        }

        const fillColorData: ColorValuesMap = {};
        if (result.fillColorData) {
          for (const [key, colors] of result.fillColorData) {
            const arr = Array.from(colors);
            fillColorData[key] = arr.slice(0, keepCount);
          }
        }

        const shapes = (result.shapes || []).map((s) => ({
          style: s.style,
          location: s.location,
          color: s.color,
          time: s.time,
          text: s.text ? escapeHtml(String(s.text)) : s.text,
          price: s.price,
          overlay: s.overlay,
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

        const barColors = (result.barColorData || []).map((b) => ({
          time: b.time,
          bodyColor: b.bodyColor ?? undefined,
          wickColor: b.wickColor ?? undefined,
          borderColor: b.borderColor ?? undefined,
          offset: b.offset ?? undefined,
          // Backward compat: 'color' alias for bodyColor
          color: b.bodyColor ?? undefined,
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
        const lines: LineData[] = (result.lines || []).map((l) => ({
          points: [
            { time: l.xloc === 'bar_index' ? (barTimestamps[l.x1] ?? l.x1) : l.x1, price: l.y1 },
            { time: l.xloc === 'bar_index' ? (barTimestamps[l.x2] ?? l.x2) : l.x2, price: l.y2 },
          ],
          color: l.color,
          width: l.width,
          style:
            l.style === 'style_dotted' ? 'dotted' : l.style === 'style_dashed' ? 'dashed' : 'solid',
          // Engine types extend as `string`, but Pine's extend namespace only
          // yields 'none'|'left'|'right'|'both' (expression-executor.ts:729,
          // drawing-builtins.ts:83-101). The cast narrows to the contract's
          // literal union — the wire value is byte-identical to pre-B3.
          extend: (l.extend || 'none') as LineData['extend'],
        }));

        const labels = (result.labels || []).map((l) => ({
          time: l.time,
          price: l.price,
          text: l.text ? escapeHtml(String(l.text)) : l.text,
          color: l.color,
          textColor: l.textcolor,
          style: l.style,
          size: l.size,
        }));

        const barTimestampsForBoxes = result.barTimestamps ?? [];
        const boxes = (result.boxes || []).map((b) => ({
          startTime:
            b.left < barTimestampsForBoxes.length ? (barTimestampsForBoxes[b.left] ?? 0) : 0,
          startPrice: b.top,
          endTime:
            b.right < barTimestampsForBoxes.length ? (barTimestampsForBoxes[b.right] ?? 0) : 0,
          endPrice: b.bottom,
          borderColor: b.border_color,
          backgroundColor: b.bgcolor,
        }));

        const tables = (result.tables || []).map((t) => ({
          position: t.position,
          columns: t.columns,
          rows: t.rows,
          bgcolor: t.bgcolor,
          border_color: t.border_color,
          border_width: t.border_width,
          frame_color: t.frame_color,
          frame_width: t.frame_width,
          cells: t.cells,
          mergedCells: t.mergedCells,
        }));

        const resultAny = result as unknown as Record<string, unknown>;
        const alertConditions: Array<{ id: string; title: string; message: string }> = [];
        const rawConditions = resultAny.alertConditions as
          | Array<{ id: string; title: string; message: string }>
          | undefined;
        if (rawConditions) {
          for (const ac of rawConditions) {
            alertConditions.push({
              id: ac.id,
              title: ac.title ? escapeHtml(String(ac.title)) : ac.title,
              message: ac.message ? escapeHtml(String(ac.message)) : ac.message,
            });
          }
        }

        const alertTriggers: Array<{ alertId: string; barIndex: number; timestamp: number }> = [];
        const rawTriggers = resultAny.alertTriggers as
          | Array<{ alertId: string; barIndex: number; timestamp: number }>
          | undefined;
        if (rawTriggers) {
          for (const at of rawTriggers) {
            alertTriggers.push({
              alertId: at.alertId,
              barIndex: at.barIndex,
              timestamp: at.timestamp,
            });
          }
        }

        const linefills = (result.linefills || []).map((lf) => ({
          line1: {
            x1: lf.line1.x1,
            y1: lf.line1.y1,
            x2: lf.line1.x2,
            y2: lf.line1.y2,
            color: lf.line1.color,
          },
          line2: {
            x1: lf.line2.x1,
            y1: lf.line2.y1,
            x2: lf.line2.x2,
            y2: lf.line2.y2,
            color: lf.line2.color,
          },
          color: lf.color,
          fillgaps: lf.fillgaps,
        }));

        // ── Assemble the contract-typed wire payload ─────────────────────────────
        // All keys come from the contract's ExecutionResultMessageInput (every
        // collection optional on INPUT; normalize() guarantees the OUTPUT). The
        // mapper already emits every collection as [] ((x || []).map, ?? []) —
        // normalize is the belt-and-suspenders contract backstop.
        const payload: ExecutionResultMessageInput = {
          success: result.success,
          // DRIFT (documented, not normalized this wave — Backend Lead): the
          // engine's ExecutionResult.error is an EngineError OBJECT
          // (message/span/barIndex/stack) that the REST mapper serializes as-is;
          // the contract types error?: string. Wire-format invariance wins — the
          // object stays. Same for version: REST emits `version ?? null` while WS
          // emits `version ?? undefined` — a deliberate, preserved divergence.
          error: result.error as unknown as string | undefined,
          version: result.version ?? null,
          overlay: result.overlay,
          outputs,
          plotColors,
          fillColorData,
          hiddenPlotKeys: result.hiddenPlotKeys ?? [],
          plotOverlayKeys: result.plotOverlayKeys ?? [],
          shapes,
          fills,
          linefills,
          bgcolor,
          barColors,
          strategyMarkers,
          lines,
          labels,
          boxes,
          tables,
          alertConditions,
          alertTriggers,
          barTimestamps: result.barTimestamps ?? [],
          maxLookback: result.maxLookback ?? 0,
          // REST emits the FULL variant — the union discriminant MUST exist on
          // REST for the frontend union migration to work (Backend Lead CRITICAL
          // finding). normalize() defaults a MISSING isConfirmed to false (diff),
          // so set it explicitly BEFORE normalizing.
          isConfirmed: true,
        };

        // Contract backstop: fills any missing required collection with [] and
        // strips unknown keys by construction (returns a fresh object, never
        // mutates the input). REST is a full snapshot, so isConfirmed stays true.
        const normalized = normalizeExecutionResultMessage(payload) as ExecutionResultFullMessage;

        // The REST wire response = the FULL variant + REST-only maxLookback.
        // ExecuteResponse (payload + maxLookback, no isConfirmed) predates B3;
        // the wire now carries the discriminant too, so the response type is the
        // intersection — SSOT field set plus isConfirmed: true (harmless on REST,
        // future-proof for the frontend union migration).
        const response: ExecuteResponse & ExecutionResultFullMessage = {
          ...normalized,
          maxLookback: result.maxLookback ?? 0,
        };

        res.json(response);
      } finally {
        // B2: no leaks — the registry entry lives exactly as long as the run.
        // Removed on success, error, AND cancel (idempotent for the caller who
        // already cancelled it via DELETE/stop_indicator).
        registry.remove(runId);
      }
    } catch (err) {
      console.error('[Execute] Error:', err);
      const message = err instanceof Error ? err.message : 'Unknown execution error';
      const isClientError =
        message.includes('Parse') || message.includes('Syntax') || message.includes('version');
      res.status(isClientError ? 400 : 500).json({
        success: false,
        error: message,
      });
    }
  });

  return router;
}
