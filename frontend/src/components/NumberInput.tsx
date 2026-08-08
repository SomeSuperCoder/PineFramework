import { useState, useEffect, type InputHTMLAttributes } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** Text input that accepts numeric keystrokes but shows empty while editing.
 *
 *  Unlike `type="number"`, the browser never locks the field — you can delete
 *  the last digit freely. The numeric value is only committed on blur, so the
 *  field stays empty while you're typing.
 *
 *  A ghost stepper column (↑/↓, 44px targets per UX §2.2) adjusts the value
 *  by `step` when present, clamped to `min`/`max` when present. ArrowUp /
 *  ArrowDown on the field trigger the same steppers when focused.
 */
export function NumberInput({
  value,
  onChange,
  style,
  ...rest
}: {
  value: number;
  onChange: (v: number) => void;
  style?: React.CSSProperties;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [display, setDisplay] = useState(() => (value === 0 ? '' : String(value)));

  useEffect(() => {
    setDisplay(value === 0 ? '' : String(value));
  }, [value]);

  const commit = () => {
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
  };

  const commitIfNeeded = (next: number) => {
    onChange(next);
    setDisplay(next === 0 ? '' : String(next));
  };

  const handleStep = (dir: 1 | -1) => {
    const step = rest.step ? Number(rest.step) : 1;
    const base = display.trim() === '' ? 0 : Number(display);
    const raw = isNaN(base) ? value : base;
    let next = raw + dir * step;
    if (rest.min !== undefined) next = Math.max(Number(rest.min), next);
    if (rest.max !== undefined) next = Math.min(Number(rest.max), next);
    commitIfNeeded(next);
  };

  const disabled = rest.disabled;

  return (
    <div className="flex w-full items-stretch gap-0.5" style={style}>
      <Input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => setDisplay(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            handleStep(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            handleStep(-1);
          }
        }}
        className="w-full min-w-0 flex-1"
        {...rest}
      />
      <div className="flex shrink-0 flex-col gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Increase"
          onClick={() => handleStep(1)}
          disabled={disabled}
          className="size-11"
        >
          <ChevronUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Decrease"
          onClick={() => handleStep(-1)}
          disabled={disabled}
          className="size-11"
        >
          <ChevronDown />
        </Button>
      </div>
    </div>
  );
}