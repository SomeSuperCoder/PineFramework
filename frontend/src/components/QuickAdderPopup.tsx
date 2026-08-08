import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

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

interface QuickAdderPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (scriptId: string, source: string) => void;
}

interface MergedScript {
  id: string;
  name: string;
  source: string;
  type: 'strategy' | 'indicator';
  isBuiltIn: boolean;
}

export function QuickAdderPopup({ isOpen, onClose, onAdd }: QuickAdderPopupProps) {
  const [scripts, setScripts] = useState<MergedScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchScripts = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, builtInRes] = await Promise.all([
        fetch('/api/scripts'),
        fetch('/api/scripts/built-in'),
      ]);
      const listData = await listRes.json();
      const builtInData = await builtInRes.json();

      const userScripts: MergedScript[] = (listData.scripts || []).map((s: ScriptEntry) => ({
        id: s.id,
        name: s.name,
        source: s.source,
        type: s.scriptType,
        isBuiltIn: false,
      }));

      const builtInScripts: MergedScript[] = (builtInData.scripts || []).map((s: BuiltInScript) => ({
        id: s.id,
        name: s.name,
        source: s.source,
        type: s.type,
        isBuiltIn: true,
      }));

      setScripts([...userScripts, ...builtInScripts]);
    } catch {
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      fetchScripts();
    }
  }, [isOpen, fetchScripts]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filtered = scripts.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = useCallback((s: MergedScript) => {
    onAdd(s.id, s.source);
  }, [onAdd]);

  return (
    <Popover open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* Invisible anchor keeps the Radix popover positioned at the top-center
          while the popup opens programmatically from App. */}
      <PopoverAnchor asChild>
        <span className="pointer-events-none fixed top-1/4 left-1/2 h-0 w-0 -translate-x-1/2" aria-hidden="true" />
      </PopoverAnchor>
      <PopoverContent
        align="center"
        sideOffset={0}
        className="w-[440px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder="Search indicators & strategies..."
          />
          <CommandList>
            {loading ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                Loading scripts...
              </div>
            ) : filtered.length === 0 ? (
              <CommandEmpty className="py-6">No scripts found</CommandEmpty>
            ) : (
              filtered.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => handleAdd(s)}
                  className="cursor-pointer gap-2"
                  title={s.name}
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge
                      className={
                        s.type === 'strategy'
                          ? 'bg-[var(--pf-semantic-success-bg)] text-[var(--pf-semantic-success)]'
                          : 'bg-[var(--pf-semantic-warning-bg)] text-[var(--pf-semantic-warning)]'
                      }
                    >
                      {s.type === 'strategy' ? 'STG' : 'IND'}
                    </Badge>
                    {s.isBuiltIn && (
                      <Badge variant="outline" className="border-border text-[var(--pf-ink-2)]">
                        Built-In
                      </Badge>
                    )}
                  </span>
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}