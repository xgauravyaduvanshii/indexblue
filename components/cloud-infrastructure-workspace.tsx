'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Server, ShieldCheck } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export function CloudInfrastructureWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_60%)]" />
        <div className="absolute right-0 top-24 h-[360px] w-[360px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-0 top-52 h-[260px] w-[260px] rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-7xl flex-col p-4 sm:p-6">
        <header className="sticky top-0 z-20 rounded-[28px] border border-border/60 bg-background/80 px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="md:hidden">
                <SidebarTrigger />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl border border-border/60 bg-card/70 shadow-sm">
                  <Server className="h-5 w-5 text-primary" />
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Operational Workspace
                  </div>
                  <h1 className="text-lg font-semibold tracking-tight text-foreground">Cloud Infrastructure</h1>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <WorkspaceLink
                href="/cloud-infrastructure"
                active={pathname === '/cloud-infrastructure' || pathname?.startsWith('/cloud-infrastructure/')}
              >
                <Activity className="h-4 w-4" />
                Console
              </WorkspaceLink>
              <WorkspaceLink href="/settings?tab=platform-api" active={pathname === '/settings'}>
                <ShieldCheck className="h-4 w-4" />
                Platform API Keys
              </WorkspaceLink>
            </div>
          </div>
        </header>

        <main className="relative mt-8 flex-1">{children}</main>
      </div>
    </div>
  );
}

function WorkspaceLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all',
        active
          ? 'border-primary/30 bg-primary text-primary-foreground shadow-[0_12px_32px_rgba(59,130,246,0.25)]'
          : 'border-border/60 bg-card/70 text-foreground hover:bg-muted/60',
      )}
    >
      {children}
    </Link>
  );
}
