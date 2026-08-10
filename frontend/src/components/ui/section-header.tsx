import type { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
}

/** Sub-section heading inside a card: icon + small caps-style title over a hairline. */
export function SectionHeader({ icon: Icon, title }: SectionHeaderProps) {
  return (
    <h3 className="mb-2 flex items-center gap-2 border-b border-border pb-2 text-[13px] font-semibold tracking-tight text-foreground">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {title}
    </h3>
  );
}
