import { useState, useEffect, useCallback, useId } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
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

interface ScriptEntry {
  id: string;
  name: string;
  source: string;
  scriptType: 'strategy' | 'indicator';
}

interface BuiltInScript {
  id: string;
  name: string;
  source: string;
  type: 'strategy' | 'indicator';
}

interface MergedStrategy {
  id: string;
  name: string;
  source: string;
  type: 'strategy' | 'indicator';
  isBuiltIn: boolean;
}

interface StrategySelectorProps {
  value: string;
  onChange: (source: string, name: string, id: string) => void;
  /** Optional visible label; renders a real <label htmlFor> when provided (config-bar a11y). */
  label?: string;
  /** Optional search-input placeholder; defaults to the current text. */
  placeholder?: string;
}

export function StrategySelector({ value, onChange, label, placeholder = 'Search strategies...' }: StrategySelectorProps) {
  const inputId = useId();
  const listId = useId();
  const rawPasteId = useId();
  const [strategies, setStrategies] = useState<MergedStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedName, setSelectedName] = useState('');
  const [useRawPaste, setUseRawPaste] = useState(false);
  const [rawSource, setRawSource] = useState(value);

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, builtInRes] = await Promise.all([
        fetch('/api/scripts'),
        fetch('/api/scripts/built-in'),
      ]);
      const listData = await listRes.json();
      const builtInData = await builtInRes.json();

      const userScripts: MergedStrategy[] = (listData.scripts || [])
        .filter((s: ScriptEntry) => s.scriptType === 'strategy')
        .map((s: ScriptEntry) => ({
          id: s.id,
          name: s.name,
          source: s.source,
          type: s.scriptType,
          isBuiltIn: false,
        }));

      const builtInScripts: MergedStrategy[] = (builtInData.scripts || [])
        .filter((s: BuiltInScript) => s.type === 'strategy')
        .map((s: BuiltInScript) => ({
          id: s.id,
          name: s.name,
          source: s.source,
          type: s.type,
          isBuiltIn: true,
        }));

      setStrategies([...userScripts, ...builtInScripts]);
    } catch {
      setError('Could not load strategies. Is the backend running?');
      setStrategies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      if (strategies.length === 0) {
        fetchStrategies();
      }
    }
  }, [isOpen, fetchStrategies, strategies.length]);

  const filtered = strategies.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = useCallback((s: MergedStrategy) => {
    setSelectedName(s.name);
    setSearch(s.name);
    setIsOpen(false);
    onChange(s.source, s.name, s.id);
    setUseRawPaste(false);
  }, [onChange]);

  const sourceLoaded = value.length > 0;
  const sourceLabel = selectedName || (sourceLoaded ? `Source loaded (${value.length} bytes)` : '');

  if (useRawPaste) {
    return (
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label htmlFor={rawPasteId} className="text-[11px] text-muted-foreground">
            Paste Pine Script Strategy Source:
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setUseRawPaste(false);
              setRawSource('');
            }}
            className="h-10 text-xs"
          >
            ← Select from list
          </Button>
        </div>
        <textarea
          id={rawPasteId}
          value={rawSource}
          onChange={(e) => { setRawSource(e.target.value); onChange(e.target.value, '', ''); }}
          placeholder="//@version=5&#10;strategy('My Strategy')&#10;if close > open&#10;  strategy.entry('long', strategy.long)"
          rows={4}
          className="w-full resize-y border border-input bg-background p-1.5 font-mono text-[11px] text-foreground rounded-md"
        />
      </div>
    );
  }

  const triggerContent = selectedName ? (
    <>
      <Check className="size-3.5 text-foreground" />
      {selectedName}
    </>
  ) : sourceLoaded ? (
    <span className="text-muted-foreground">{sourceLabel}</span>
  ) : (
    'Select a strategy...'
  );

  return (
    <div>
      {label !== undefined ? (
        <label
          htmlFor={inputId}
          className="text-[12px] font-semibold mb-1.5 block text-muted-foreground"
        >
          {label}
        </label>
      ) : (
        <div className="text-[12px] font-semibold mb-1.5 text-muted-foreground">
          Strategy
        </div>
      )}

      <Popover
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={listId}
            className={`w-full h-10 justify-between border-input text-[11px] ${
              selectedName ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <span className="inline-flex items-center gap-1.5 truncate">{triggerContent}</span>
            {isOpen ? (
              <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={2}
          className="w-full p-0"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <Command
            className="rounded-md border border-input bg-card"
            shouldFilter={false}
          >
            <CommandInput
              id={inputId}
              placeholder={placeholder}
              value={search}
              onValueChange={(v) => setSearch(v)}
            />
            <CommandList id={listId} className="max-h-[200px] overflow-auto">
              {loading ? (
                <CommandEmpty className="py-3 text-center text-[11px]">
                  Loading strategies...
                </CommandEmpty>
              ) : error ? (
                <div className="p-3">
                  <div className="text-[11px] mb-1.5 text-destructive">
                    {error}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={fetchStrategies}
                    className="h-10 text-xs"
                  >
                    Retry
                  </Button>
                </div>
              ) : filtered.length === 0 ? (
                <CommandEmpty className="py-3 text-center text-[11px]">
                  {search
                    ? `No strategies matching "${search}"`
                    : 'No strategies found. Write one in the editor first.'}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {filtered.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={`${s.id} ${s.name}`}
                      onSelect={() => handleSelect(s)}
                    >
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="flex gap-1 ml-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className={
                            s.type === 'strategy'
                              ? 'h-[14px] px-1 text-[9px] font-semibold bg-primary/10 text-primary'
                              : 'h-[14px] px-1 text-[9px] font-semibold bg-primary/10 text-primary'
                          }
                        >
                          {s.type === 'strategy' ? 'STG' : 'IND'}
                        </Badge>
                        {s.isBuiltIn && (
                          <Badge
                            variant="secondary"
                            className="h-[14px] px-1 text-[9px] font-semibold bg-primary/10 text-primary"
                          >
                            Built-In
                          </Badge>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Paste as fallback */}
      <div className="mt-1.5 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setUseRawPaste(true)}
          className="h-10 px-3 text-[11px] text-muted-foreground"
          title="Paste raw Pine Script code instead"
        >
          Paste raw source
        </Button>
      </div>
    </div>
  );
}