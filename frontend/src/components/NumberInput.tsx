import { useState, useEffect, type InputHTMLAttributes } from 'react';

/** Text input that accepts numeric keystrokes but shows empty while editing.
 *
 *  Unlike `type="number"`, the browser never locks the field — you can delete
 *  the last digit freely. The numeric value is only committed on blur, so the
 *  field stays empty while you're typing.
 */
export function NumberInput({ value, onChange, style, ...rest }: {
  value: number;
  onChange: (v: number) => void;
  style?: React.CSSProperties;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [display, setDisplay] = useState(() => value === 0 ? '' : String(value));

  useEffect(() => {
    setDisplay(value === 0 ? '' : String(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => setDisplay(e.target.value)}
      onBlur={() => {
        const trimmed = display.trim();
        if (trimmed === '') {
          onChange(0);
          return;
        }
        const parsed = Number(trimmed);
        if (!isNaN(parsed)) {
          onChange(parsed);
        } else {
          setDisplay(value === 0 ? '' : String(value));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', ...style }}
      {...rest}
    />
  );
}
