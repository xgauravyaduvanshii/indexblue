'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SciraLogo } from '@/components/logos/scira-logo';
import { cn } from '@/lib/utils';

type BuilderPageHeaderProps = {
  active?: 'builder' | 'projects';
  className?: string;
};

export function BuilderPageHeader({ active, className }: BuilderPageHeaderProps) {
  const pathname = usePathname();
  const resolvedActive =
    active ?? (pathname === '/builder/projects' || pathname?.startsWith('/builder/projects/') ? 'projects' : 'builder');

  return (
    <header className={cn('flex w-full items-center justify-between gap-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/builder"
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-2 transition-colors hover:bg-muted/40"
        >
          <SciraLogo className="size-6 shrink-0 sm:size-7" />
          <span className="truncate font-pixel text-sm tracking-[0.24em] text-foreground sm:text-base">Builder</span>
        </Link>

        <div className="inline-flex items-center rounded-full border border-border/60 bg-card/60 p-1 shadow-[0_14px_44px_rgba(0,0,0,0.16)] backdrop-blur">
          <NavPill href="/builder" active={resolvedActive === 'builder'}>
            Builder
          </NavPill>
          <NavPill href="/builder/projects" active={resolvedActive === 'projects'}>
            Projects
          </NavPill>
        </div>
      </div>
    </header>
  );
}

function NavPill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full px-4 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-foreground text-background shadow-[0_10px_30px_rgba(0,0,0,0.18)]'
          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}
