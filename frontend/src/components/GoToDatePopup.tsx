import { useState, useEffect, useRef } from 'react';
import { formatDate, formatTime, parseMsk, now } from 'pine-framework/utils/time';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface GoToDatePopupProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToDate: (timestampSeconds: number, dateStr: string, timeStr: string) => void;
  lastTeleport?: { date: string; time: string };
}

export function GoToDatePopup({ isOpen, onClose, onGoToDate, lastTeleport }: GoToDatePopupProps) {
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const nowSec = now();
      // Use last teleport if available, otherwise current time
      setDateStr(lastTeleport?.date || formatDate(nowSec));
      setTimeStr(lastTeleport?.time || formatTime(nowSec));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, lastTeleport]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const utc = parseMsk(dateStr, timeStr);
    if (isNaN(utc)) return;
    onGoToDate(utc, dateStr, timeStr);
    onClose();
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none fixed top-1/2 left-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2" aria-hidden="true" />
      </PopoverAnchor>
      <PopoverContent align="center" sideOffset={0} className="w-[300px] rounded-xl p-4">
        <div className="mb-4 text-sm font-semibold text-foreground">
          Go to Date
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="goto-date" className="text-[13px] text-[var(--pf-steel-muted)]">
              Date
            </Label>
            <Input
              id="goto-date"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="goto-time" className="text-[13px] text-[var(--pf-steel-muted)]">
              Time (MSK, HH:MM)
            </Label>
            <Input
              ref={inputRef}
              id="goto-time"
              type="text"
              placeholder="HH:MM"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="h-11 text-center font-mono"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-[var(--pf-brand-blue)] text-white hover:bg-[var(--pf-brand-blue-hover)]">
              Go
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}