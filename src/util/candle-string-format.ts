export interface CandleFormatContext {
  ticker?: string;
  interval?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  time?: number;
  bar_index?: number;
  timestamp?: number;
}

export function formatCandleString(template: string, context: CandleFormatContext): string {
  let result = template;

  if (result.includes('{{open}}') && context.open !== undefined)
    result = result.replace(/\{\{open\}\}/g, String(context.open));
  if (result.includes('{{high}}') && context.high !== undefined)
    result = result.replace(/\{\{high\}\}/g, String(context.high));
  if (result.includes('{{low}}') && context.low !== undefined)
    result = result.replace(/\{\{low\}\}/g, String(context.low));
  if (result.includes('{{close}}') && context.close !== undefined)
    result = result.replace(/\{\{close\}\}/g, String(context.close));
  if (result.includes('{{volume}}') && context.volume !== undefined)
    result = result.replace(/\{\{volume\}\}/g, String(context.volume));
  if (result.includes('{{time}}') && context.time !== undefined)
    result = result.replace(/\{\{time\}\}/g, new Date(context.time).toISOString());
  if (result.includes('{{interval}}') && context.interval !== undefined)
    result = result.replace(/\{\{interval\}\}/g, context.interval);
  if (result.includes('{{ticker}}') && context.ticker !== undefined)
    result = result.replace(/\{\{ticker\}\}/g, context.ticker);
  if (result.includes('{{bar_index}}') && context.bar_index !== undefined)
    result = result.replace(/\{\{bar_index\}\}/g, String(context.bar_index));
  if (result.includes('{{timestamp}}') && context.timestamp !== undefined)
    result = result.replace(/\{\{timestamp\}\}/g, String(context.timestamp));

  if (result.includes('{time}') && context.time !== undefined)
    result = result.replace(/\{time\}/g, new Date(context.time).toISOString());
  if (result.includes('{bar_index}') && context.bar_index !== undefined)
    result = result.replace(/\{bar_index\}/g, String(context.bar_index));
  if (result.includes('{timestamp}') && context.timestamp !== undefined)
    result = result.replace(/\{timestamp\}/g, String(context.timestamp));

  return result;
}
