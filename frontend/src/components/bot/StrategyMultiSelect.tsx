import { useState, useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useStrategies, type MergedStrategy } from '../../hooks/useStrategies';
import type { SelectedStrategy } from '../../types/multiWorld';

interface StrategyMultiSelectProps {
  selected: SelectedStrategy[];
  onChange: (next: SelectedStrategy[]) => void;
  maxN?: number;
}

function toSelected(s: MergedStrategy): SelectedStrategy {
  return { id: s.id, name: s.name, source: s.source, isBuiltIn: s.isBuiltIn };
}

/**
 * F3 — multi-select strategy picker (the "stg" axis of each world).
 *
 * Accessibility (WCAG AA):
 *  - searchable listbox `role="listbox" aria-multiselectable`, rows `role="option" aria-selected`
 *  - keyboard: ↑/↓ move, Space toggles, Esc closes
 *  - selected strategies render as removable chips with `aria-label="Remove {name}"`
 */
export function StrategyMultiSelect({ selected, onChange, maxN }: StrategyMultiSelectProps) {
  const { strategies, loading, error, fetchStrategies } = useStrategies();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const inputId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setActiveIndex(0);
      if (strategies.length === 0) fetchStrategies();
    }
  }, [isOpen, fetchStrategies, strategies.length]);

  const filtered = strategies.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const isSelected = (s: MergedStrategy) => selected.some((x) => x.id === s.id);

  const toggle = (s: MergedStrategy) => {
    if (isSelected(s)) {
      onChange(selected.filter((x) => x.id !== s.id));
    } else {
      if (maxN && selected.length >= maxN) return;
      onChange([...selected, toSelected(s)]);
    }
  };

  const remove = (id: string) => onChange(selected.filter((x) => x.id !== id));

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === ' ') {
      e.preventDefault();
      const s = filtered[activeIndex];
      if (s) toggle(s);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-[12px] font-semibold text-[var(--color-muted-foreground)]"
      >
        Strategies ({selected.length} selected)
      </label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <ul role="list" className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <li key={s.id}>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)]/40 bg-[rgba(var(--color-primary),0.12)] px-2 py-1 text-[11px] font-medium text-[var(--color-primary)]">
                {s.name}
                {s.isBuiltIn && (
                  <Badge
                    variant="secondary"
                    className="h-[14px] px-1 text-[9px] font-semibold bg-primary/10 text-primary"
                  >
                    Built-In
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  aria-label={`Remove ${s.name}`}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-[rgba(var(--color-primary),0.2)]"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={listId}
            className={`w-full h-10 justify-between border-[var(--color-input)] text-[11px] ${
              selected.length ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]'
            }`}
          >
            <span className="truncate">
              {selected.length ? `${selected.length} strategy${selected.length > 1 ? 's' : ''} selected` : 'Select strategies…'}
            </span>
            {isOpen ? (
              <ChevronUp className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={2}
          className="w-full p-0"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <Command className="rounded-md border border-[var(--color-input)] bg-[var(--color-card)]" shouldFilter={false}>
            <CommandInput
              id={inputId}
              placeholder="Search strategies..."
              value={search}
              onValueChange={(v) => {
                setSearch(v);
                setActiveIndex(0);
              }}
            />
            <CommandList
              id={listId}
              ref={listRef}
              role="listbox"
              aria-multiselectable="true"
              aria-label="Available strategies"
              className="max-h-[220px] overflow-auto"
              onKeyDown={onListKeyDown}
            >
              {loading ? (
                <CommandEmpty className="py-3 text-center text-[11px] text-[var(--color-muted-foreground)]">
                  Loading strategies…
                </CommandEmpty>
              ) : error ? (
                <div className="p-3">
                  <div className="mb-1.5 text-[11px] text-[var(--color-destructive)]">{error}</div>
                  <Button type="button" variant="outline" size="sm" onClick={fetchStrategies} className="h-10 text-xs">
                    Retry
                  </Button>
                </div>
              ) : filtered.length === 0 ? (
                <CommandEmpty className="py-3 text-center text-[11px] text-[var(--color-muted-foreground)]">
                  {search ? `No strategies matching "${search}"` : 'No strategies found. Write one in the editor first.'}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {filtered.map((s, i) => {
                    const sel = isSelected(s);
                    return (
                      <CommandItem
                        key={s.id}
                        value={`${s.id} ${s.name}`}
                        role="option"
                        aria-selected={sel}
                        data-active={i === activeIndex}
                        onSelect={() => toggle(s)}
                        className={i === activeIndex ? 'bg-[var(--color-secondary)]' : ''}
                      >
                        <span
                          className={`mr-2 flex size-4 items-center justify-center rounded border ${
                            sel ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'border-[var(--color-input)]'
                          }`}
                          aria-hidden="true"
                        >
                          {sel && <Check className="size-3" />}
                        </span>
                        <span className="flex-1 truncate">{s.name}</span>
                        {s.isBuiltIn && (
                          <Badge variant="secondary" className="h-[14px] px-1 text-[9px] font-semibold bg-primary/10 text-primary">
                            Built-In
                          </Badge>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length === 0 && (
        <div className="mt-1.5 text-[10px] text-[var(--color-muted-foreground)]">
          Select at least one strategy.
        </div>
      )}
    </div>
  );
}
