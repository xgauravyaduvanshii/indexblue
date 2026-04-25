import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  Blocks,
  BrainCircuit,
  Cable,
  Code2,
  Compass,
  FileStack,
  Orbit,
  Radar,
  Rocket,
  Settings2,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SciraLogo } from '@/components/logos/scira-logo';

const builderLoop = [
  {
    title: 'Observe',
    description: 'Read the page, pull signals from the web, and collect the context that should steer the next move.',
    icon: Radar,
  },
  {
    title: 'Route',
    description: 'Pick the right model, search provider, and automation path for the job instead of forcing one default.',
    icon: Orbit,
  },
  {
    title: 'Ship',
    description: 'Connect tools, apply changes, and keep the workspace stateful so your next iteration starts ahead.',
    icon: Rocket,
  },
];

const workspaceSurfaces = [
  {
    eyebrow: 'Models',
    title: 'Shape how the AI builder thinks',
    description:
      'Builder settings now group your general controls, models and providers, context, and integrations into a single operational workspace.',
    image: '/vercel-featured.png',
    imageAlt: 'Indexblue builder workspace preview',
  },
  {
    eyebrow: 'Context',
    title: 'Keep files, memories, and prompts in the same loop',
    description:
      'Use stored memories, uploaded files, and custom instructions as durable builder context instead of re-explaining your workspace every time.',
    image: '/lookout-promo.png',
    imageAlt: 'Indexblue context and automation preview',
  },
];

const controlPlanes = [
  {
    title: 'General',
    description: 'Theme, custom instructions, location metadata, and chat-open behavior.',
    icon: Settings2,
  },
  {
    title: 'Models & Providers',
    description: 'Search provider, extreme model, auto router, preferred models, and mode ordering.',
    icon: BrainCircuit,
  },
  {
    title: 'Skills & Context',
    description: 'Memories, uploads, and reusable guidance that keep the builder grounded.',
    icon: FileStack,
  },
  {
    title: 'Plugins & Integrations',
    description: 'Connectors, MCP servers, and external systems that expand what Builder can act on.',
    icon: Cable,
  },
];

const productHighlights = [
  {
    title: 'Built for the web',
    description: 'A workspace that feels closer to a live product cockpit than a plain configuration page.',
    icon: Compass,
  },
  {
    title: 'AI that adapts',
    description: 'Model routing, preferred model curation, and provider selection help Builder fit the task at hand.',
    icon: WandSparkles,
  },
  {
    title: 'Context that sticks',
    description: 'Memories, uploads, instructions, and integrations give the agent continuity across sessions.',
    icon: Blocks,
  },
];

export default function BuilderPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0">
          <Image
            src="/og-bg.png"
            alt=""
            fill
            priority
            className="object-cover opacity-20 dark:opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/80 to-background" />
        </div>

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-10 sm:px-8 lg:py-14">
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
                <SciraLogo className="size-4" />
                <span className="font-pixel text-[10px] uppercase tracking-[0.16em]">Indexblue Builder</span>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-light tracking-tight text-foreground sm:text-5xl">
                  The builder workspace for models, context, and web-native AI flow
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Inspired by the way Stagewise blends an operational settings shell with a product-grade workspace,
                  Builder now acts as the control plane for how Indexblue sees, routes, remembers, and integrates.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild size="lg" className="gap-2">
                  <Link href="/settings?tab=builder">
                    Open Builder Settings
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="gap-2">
                  <Link href="/apps">
                    Browse Integrations
                    <Cable className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="gap-2">
                  <Link href="/lookout">
                    Launch Lookout
                    <Sparkles className="size-4" />
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {productHighlights.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-border/60 bg-background/70 p-4 backdrop-blur">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-border/60 bg-accent/40">
                      <item.icon className="size-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-background/85 shadow-[0_20px_80px_rgba(0,0,0,0.12)] backdrop-blur">
                <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
                  <div>
                    <p className="font-pixel text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                      Live Workspace
                    </p>
                    <h2 className="mt-1 text-base font-semibold">Builder control plane</h2>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/50 px-3 py-1 text-xs text-muted-foreground">
                    <WandSparkles className="size-3.5" />
                    AI active
                  </div>
                </div>

                <div className="grid gap-4 p-5">
                  <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/30">
                    <Image
                      src="/vercel-featured.png"
                      alt="Builder workspace preview"
                      width={1200}
                      height={720}
                      className="h-auto w-full object-cover"
                      priority
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/60 bg-card/30 p-4">
                      <div className="mb-3 flex items-center gap-2 text-foreground">
                        <Code2 className="size-4" />
                        <h3 className="text-sm font-semibold">Model routing</h3>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Switch providers, choose preferred models, and tune auto-router behavior from one place.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card/30 p-4">
                      <div className="mb-3 flex items-center gap-2 text-foreground">
                        <Cable className="size-4" />
                        <h3 className="text-sm font-semibold">Integrations</h3>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Connect MCP servers and third-party services so Builder can act across your real stack.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-8 lg:py-14">
        <div className="mb-8 max-w-2xl">
          <p className="font-pixel text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">How it works</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            A tighter loop between what you see, what the AI decides, and what it can do
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {builderLoop.map((item, index) => (
            <div key={item.title} className="rounded-2xl border border-border/60 bg-card/20 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-xl border border-border/60 bg-accent/40">
                  <item.icon className="size-5" />
                </div>
                <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-muted-foreground/50">
                  0{index + 1}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-4 sm:px-8 lg:py-6">
        <div className="flex flex-col gap-6">
          {workspaceSurfaces.map((surface, index) => (
            <div
              key={surface.title}
              className="grid gap-6 rounded-[28px] border border-border/60 bg-card/20 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)] lg:items-center"
            >
              <div className={index % 2 === 1 ? 'lg:order-2' : ''}>
                <p className="font-pixel text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                  {surface.eyebrow}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{surface.title}</h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">{surface.description}</p>
                <div className="mt-5">
                  <Button asChild variant="outline" className="gap-2">
                    <Link href={index === 0 ? '/settings?tab=builder' : '/settings?tab=uploads'}>
                      {index === 0 ? 'Open Builder controls' : 'Open context surfaces'}
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>

              <div className={index % 2 === 1 ? 'lg:order-1' : ''}>
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/70">
                  <Image
                    src={surface.image}
                    alt={surface.imageAlt}
                    width={1400}
                    height={900}
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-8 lg:py-14">
        <div className="mb-8 max-w-2xl">
          <p className="font-pixel text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">Control Planes</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Everything the Builder tab now controls
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {controlPlanes.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border/60 bg-card/20 p-5">
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border/60 bg-accent/40">
                <item.icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[28px] border border-border/60 bg-card/20 p-6 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-pixel text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                Builder Settings
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Open the new Stagewise-inspired settings shell inside Indexblue
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                The Builder tab in settings now groups your AI controls into General, Models & Providers, Skills &
                Context, and Plugins & Integrations with a denser, more operational UI.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <Link href="/settings?tab=builder">
                  Open Settings
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link href="/apps">
                  Open Apps Catalog
                  <Sparkles className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
