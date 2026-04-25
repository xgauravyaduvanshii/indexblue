import { Code2, Sparkles } from 'lucide-react';

export default function BuilderPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl border border-border/60 bg-accent/40">
            <Code2 size={22} />
          </div>
          <div>
            <p className="font-pixel text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">Tools</p>
            <h1 className="text-3xl font-light tracking-tight text-foreground">Builder</h1>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
            <div className="mb-4 flex items-center gap-2 text-foreground">
              <Sparkles size={18} />
              <h2 className="text-lg font-medium">Workspace</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              This Builder space is ready for your next feature. It has been added to the left sidebar above Lookout as requested,
              and now has a dedicated route so the navigation is complete and usable.
            </p>
          </div>

          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6">
            <p className="font-pixel text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">Status</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Builder page created successfully. We can turn this into a real tool surface next.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
