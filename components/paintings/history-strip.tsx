'use client';

import { Copy, Loader2, Play, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface PaintingHistoryRun {
  id: string;
  provider: string;
  model: string;
  operation: string;
  prompt: string;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  requestPayload?: Record<string, unknown>;
  inputs?: Array<{
    id: string;
    storageUrl: string;
    mimeType: string;
  }>;
  outputs: Array<{
    id: string;
    storageUrl: string;
    mimeType: string;
  }>;
}

interface HistoryStripProps {
  runs: PaintingHistoryRun[];
  selectedRunId: string | null;
  isLoading: boolean;
  query: string;
  statusFilter: 'all' | 'running' | 'completed' | 'error';
  providerFilter: string;
  providers: string[];
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: 'all' | 'running' | 'completed' | 'error') => void;
  onProviderFilterChange: (value: string) => void;
  onSelect: (runId: string) => void;
  onRerun: (runId: string) => void;
  onDuplicate: (runId: string) => void;
  onDelete: (runId: string) => void;
}

function formatRunTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Recent' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function HistoryStrip({
  runs,
  selectedRunId,
  isLoading,
  query,
  statusFilter,
  providerFilter,
  providers,
  onQueryChange,
  onStatusFilterChange,
  onProviderFilterChange,
  onSelect,
  onRerun,
  onDuplicate,
  onDelete,
}: HistoryStripProps) {
  return (
    <Card className="h-fit w-full gap-0 py-0 xl:max-w-[264px]">
      <CardHeader className="border-b px-4 py-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold">History</CardTitle>
            <Badge variant="outline">{runs.length}</Badge>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Filter prompts..." className="pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as HistoryStripProps['statusFilter'])}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="completed">Done</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={onProviderFilterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {providers.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No matching runs yet</div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => {
              const thumbnail = run.outputs[0]?.storageUrl ?? null;
              const selected = run.id === selectedRunId;

              return (
                <div
                  key={run.id}
                  className={`w-full rounded-3xl border p-3 text-left transition ${
                    selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <button type="button" onClick={() => onSelect(run.id)} className="block w-full text-left">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted">
                        {thumbnail ? (
                          <img src={thumbnail} alt={run.model} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-muted-foreground">
                            {run.status}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="truncate text-[10px]">
                            {run.provider}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{formatRunTime(run.createdAt)}</span>
                        </div>
                        <div>
                          <p className="truncate text-sm font-medium">{run.model}</p>
                          <p className="truncate text-xs text-muted-foreground">{run.operation}</p>
                        </div>
                        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{run.prompt}</p>
                      </div>
                    </div>
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Badge variant={run.status === 'error' ? 'destructive' : 'secondary'} className="rounded-full text-[10px]">
                      {run.status}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={(event) => { event.stopPropagation(); onDuplicate(run.id); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={(event) => { event.stopPropagation(); onRerun(run.id); }}>
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={(event) => { event.stopPropagation(); onDelete(run.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
