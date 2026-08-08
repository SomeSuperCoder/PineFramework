import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface StrategyConflictDialogProps {
  isOpen: boolean;
  existingName: string;
  incomingName: string;
  onReplace: () => void;
  onCancel: () => void;
}

export function StrategyConflictDialog({ isOpen, existingName, incomingName, onReplace, onCancel }: StrategyConflictDialogProps) {
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent className="max-w-[380px] gap-4 p-5">
        <AlertDialogHeader className="gap-2">
          <AlertDialogTitle className="text-sm text-[var(--pf-semantic-warning)]">
            Strategy Conflict
          </AlertDialogTitle>
          <AlertDialogDescription className="flex flex-col gap-1 text-[13px] leading-5 text-foreground">
            <span>A strategy is already running on the chart:</span>
            <span className="font-semibold text-[var(--pf-semantic-warning)]">{existingName}</span>
            <span className="mt-1">You are trying to add:</span>
            <span className="font-semibold text-[var(--pf-brand-blue-hover)]">{incomingName}</span>
            <span className="mt-1 text-xs text-muted-foreground">
              Only one strategy can run at a time. Replace the existing strategy?
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} className="rounded-full">Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onReplace} className="rounded-full">
            Replace
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}