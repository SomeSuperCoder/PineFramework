import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Initial-load placeholder for a settings card. */
export function CardSkeleton() {
  return (
    <Card className="rounded-md border border-border bg-card">
      <CardContent className="flex flex-col gap-3 p-5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
