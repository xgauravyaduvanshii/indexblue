'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { toPng } from 'html-to-image';
import { Rnd } from 'react-rnd';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import {
  Bot,
  Camera,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  GripVertical,
  Hand,
  Info,
  LayoutTemplate,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Palette,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  appendBuilderCanvasFrameVersion,
  applyBuilderCanvasFrameVersion,
  BUILDER_CANVAS_THEMES,
  createBuilderCanvasDeletedFrame,
  createBuilderCanvasFrameVersion,
  getBuilderCanvasTheme,
  normalizeBuilderCanvasFrame,
  normalizeBuilderCanvasState,
  parseBuilderCanvasThemeColors,
  type BuilderCanvasDeletedFrame,
  type BuilderCanvasFrame,
  type BuilderCanvasFrameVersion,
  type BuilderCanvasFrameVersionOrigin,
  type BuilderCanvasState,
  wrapBuilderCanvasHtml,
} from '@/lib/builder/canvas';

type ToolMode = 'select' | 'hand';
type HistoryTab = 'versions' | 'deleted';

const FRAME_WIDTH = 420;
const FRAME_HEIGHT = 860;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createFramePosition(index: number) {
  return {
    x: 88 + index * 460,
    y: 84,
  };
}

function formatCanvasTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function getVersionLabel(version: BuilderCanvasFrameVersion, index: number, total: number) {
  if (version.createdBy === 'ai-regenerate') return `AI Regenerate ${total - index}`;
  if (version.createdBy === 'ai-create') return 'AI Original';
  if (version.createdBy === 'duplicate') return 'Duplicate Snapshot';
  if (version.createdBy === 'import') return version.kind === 'preview' ? 'Imported Preview' : 'Imported HTML';
  return index === total - 1 ? 'Base Version' : `Manual Version ${total - index}`;
}

function createCanvasFrame(
  partial: Pick<BuilderCanvasFrame, 'title' | 'kind' | 'source'> &
    Partial<BuilderCanvasFrame> & {
      prompt?: string | null;
      themeId?: string | null;
      versionOrigin?: BuilderCanvasFrameVersionOrigin;
    },
  index: number,
): BuilderCanvasFrame {
  const position = createFramePosition(index);
  const now = partial.createdAt ?? Date.now();
  const initialVersion =
    partial.versions?.[partial.versions.length - 1] ??
    createBuilderCanvasFrameVersion({
      title: partial.title,
      kind: partial.kind,
      source: partial.source,
      prompt: partial.prompt ?? null,
      createdAt: now,
      createdBy: partial.versionOrigin ?? 'manual',
      themeId: partial.themeId ?? null,
    });

  return normalizeBuilderCanvasFrame({
    id: partial.id ?? `canvas-frame-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: partial.title,
    kind: partial.kind,
    source: partial.source,
    route: partial.route ?? null,
    width: partial.width ?? FRAME_WIDTH,
    height: partial.height ?? FRAME_HEIGHT,
    x: partial.x ?? position.x,
    y: partial.y ?? position.y,
    createdAt: now,
    updatedAt: partial.updatedAt ?? now,
    activeVersionId: partial.activeVersionId ?? initialVersion.id,
    versions: partial.versions ?? [initialVersion],
    lastPrompt: partial.lastPrompt ?? partial.prompt ?? null,
  });
}

function getFrameDoc(frame: BuilderCanvasFrame, themeStyle: string) {
  return frame.kind === 'html' ? wrapBuilderCanvasHtml(frame.source, frame.title, themeStyle, frame.id) : undefined;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ThemePicker({ themeId, onSelect }: { themeId: string; onSelect: (themeId: string) => void }) {
  const currentTheme = useMemo(() => getBuilderCanvasTheme(themeId), [themeId]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex max-w-[168px] items-center gap-1 rounded-full px-1.5 py-0.5 text-left transition hover:bg-black/5 dark:hover:bg-white/7"
        >
          <Palette className="size-3 text-black/60 dark:text-white/60" />
          <div className="hidden items-center gap-0.5 md:flex">
            {BUILDER_CANVAS_THEMES.slice(0, 4).map((canvasTheme) => {
              const colors = parseBuilderCanvasThemeColors(canvasTheme.style);
              return (
                <span
                  key={canvasTheme.id}
                  className={cn(
                    'size-3.5 rounded-full border transition',
                    canvasTheme.id === themeId
                      ? 'border-black/80 ring-2 ring-black/10 dark:border-white dark:ring-white/15'
                      : 'border-black/8 dark:border-white/10',
                  )}
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
                  }}
                />
              );
            })}
          </div>
          <div className="hidden min-w-0 md:block">
            <div className="truncate text-[10px] font-medium text-black/75 dark:text-white/78">{currentTheme.name}</div>
          </div>
          <ChevronDown className="size-3 text-black/45 dark:text-white/40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-[298px] rounded-[22px] border border-black/8 bg-white/96 p-1.5 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#111318]/96"
      >
        <div className="px-1.5 pb-1.5 pt-1">
          <div className="text-[13px] font-semibold text-black/84 dark:text-white/88">Canvas themes</div>
          <div className="text-[10px] leading-4 text-black/50 dark:text-white/40">
            Swap the mood of generated frames with a fuller palette panel instead of quick dots only.
          </div>
        </div>
        <ScrollArea className="max-h-[274px] pr-1">
          <div className="space-y-1.5 px-1 pb-1">
            {BUILDER_CANVAS_THEMES.map((canvasTheme) => {
              const colors = parseBuilderCanvasThemeColors(canvasTheme.style);
              const isSelected = canvasTheme.id === themeId;

              return (
                <button
                  key={canvasTheme.id}
                  type="button"
                  onClick={() => onSelect(canvasTheme.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[18px] border p-2 text-left transition',
                    isSelected
                      ? 'border-black/70 bg-black/[0.03] shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:border-white/70 dark:bg-white/[0.04]'
                      : 'border-black/8 hover:border-black/16 hover:bg-black/[0.025] dark:border-white/10 dark:hover:border-white/18 dark:hover:bg-white/[0.03]',
                  )}
                >
                  <div
                    className="flex h-9 w-12 shrink-0 flex-col justify-between rounded-[14px] border border-black/6 p-1.5 dark:border-white/10"
                    style={{
                      background: `linear-gradient(155deg, ${colors.background}, ${colors.muted})`,
                    }}
                  >
                    <span className="h-2 w-6 rounded-full" style={{ background: colors.primary }} />
                    <span className="h-2 w-8 rounded-full" style={{ background: colors.accent }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-medium text-black/82 dark:text-white/85">
                        {canvasTheme.name}
                      </span>
                      {isSelected ? (
                        <span className="inline-flex size-4 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-4 text-black/48 dark:text-white/38">
                      {canvasTheme.description}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1">
                      {[colors.primary, colors.secondary, colors.accent, colors.muted].map((color, index) => (
                        <span
                          key={`${canvasTheme.id}-color-${index}`}
                          className="size-3.5 rounded-full border border-black/8 dark:border-white/10"
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function FrameMiniToolbar({
  frame,
  scale,
  isDownloading,
  isRegenerating,
  generationError,
  onInspect,
  onDownload,
  onOpenHistory,
  onRegenerate,
  onDuplicate,
  onDelete,
}: {
  frame: BuilderCanvasFrame;
  scale: number;
  isDownloading: boolean;
  isRegenerating: boolean;
  generationError: string | null;
  onInspect: () => void;
  onDownload: () => void;
  onOpenHistory: () => void;
  onRegenerate: (prompt: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [promptValue, setPromptValue] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleRegenerate = () => {
    const nextPrompt = promptValue.trim();
    if (!nextPrompt) return;
    onRegenerate(nextPrompt);
    setPromptValue('');
    setIsPopoverOpen(false);
  };

  return (
    <div
      className="absolute left-1/2 top-0 z-30"
      style={{
        transform: `translate(-50%, calc(-100% - 14px)) scale(${scale})`,
        transformOrigin: 'center bottom',
      }}
    >
      <div className="flex h-8 min-w-[266px] items-center gap-0.5 rounded-full border border-black/10 bg-white/96 pl-1 pr-1 shadow-[0_14px_32px_rgba(15,23,42,0.15)] backdrop-blur dark:border-white/10 dark:bg-[#121318]/96">
        <div className="flex min-w-0 flex-1 items-center gap-1 px-1">
          <GripVertical className="size-2.5 text-black/35 dark:text-white/35" />
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-black/82 dark:text-white/88">{frame.title}</div>
          </div>
          <span className="rounded-full border border-black/8 bg-black/[0.04] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em] text-black/48 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/42">
            {frame.kind}
          </span>
        </div>

        <div className="h-3.5 w-px bg-black/8 dark:bg-white/10" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-xs" variant="ghost" className="rounded-full" onClick={onInspect}>
              {frame.kind === 'preview' ? <ExternalLink className="size-3" /> : <Code2 className="size-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{frame.kind === 'preview' ? 'Open preview' : 'View HTML'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              className="rounded-full"
              onClick={onDownload}
              disabled={isDownloading}
            >
              {isDownloading ? <Save className="size-3 animate-pulse" /> : <Camera className="size-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download frame</TooltipContent>
        </Tooltip>

        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button size="icon-xs" variant="ghost" className="rounded-full" disabled={isRegenerating}>
                  {isRegenerating ? <Save className="size-3 animate-pulse" /> : <Wand2 className="size-3" />}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>AI regenerate</TooltipContent>
          </Tooltip>
          <PopoverContent
            align="center"
            className="w-[320px] rounded-[22px] border border-black/8 bg-white/98 p-2 shadow-xl dark:border-white/10 dark:bg-[#121318]/98"
          >
            <div className="space-y-2 rounded-[18px] border border-black/8 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2 text-sm font-medium text-black/82 dark:text-white/85">
                <Wand2 className="size-4 text-fuchsia-500" />
                Regenerate this frame
              </div>
              <textarea
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                placeholder="Describe the changes you want to make..."
                className="min-h-[110px] w-full resize-none rounded-[18px] border border-black/8 bg-white px-3 py-3 text-sm leading-6 text-black outline-none placeholder:text-black/28 dark:border-white/10 dark:bg-[#0d0f13] dark:text-white dark:placeholder:text-white/24"
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    handleRegenerate();
                  }
                }}
              />
              {generationError ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
                  {generationError}
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] leading-5 text-black/45 dark:text-white/35">
                  A new version is added to frame history every time you regenerate.
                </div>
                <Button
                  size="sm"
                  className="rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-white hover:from-fuchsia-400 hover:to-indigo-500"
                  onClick={handleRegenerate}
                  disabled={!promptValue.trim() || isRegenerating}
                >
                  {isRegenerating ? <Save className="size-4 animate-pulse" /> : <Sparkles className="size-4" />}
                  Regenerate
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-xs" variant="ghost" className="rounded-full" onClick={onOpenHistory}>
              <Clock3 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open versions</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button size="icon-xs" variant="ghost" className="rounded-full">
                  <MoreHorizontal className="size-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>More options</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function HistoryPanel({
  selectedFrame,
  deletedFrames,
  activeTab,
  onTabChange,
  onSwitchVersion,
  onRestoreDeletedFrame,
}: {
  selectedFrame: BuilderCanvasFrame | null;
  deletedFrames: BuilderCanvasDeletedFrame[];
  activeTab: HistoryTab;
  onTabChange: (tab: HistoryTab) => void;
  onSwitchVersion: (versionId: string) => void;
  onRestoreDeletedFrame: (deletedFrameId: string) => void;
}) {
  const versions = useMemo(
    () => [...(selectedFrame?.versions ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [selectedFrame],
  );
  const trash = useMemo(() => [...deletedFrames].sort((a, b) => b.deletedAt - a.deletedAt), [deletedFrames]);

  return (
    <div className="absolute right-4 top-24 z-20 w-[330px] rounded-[28px] border border-black/8 bg-white/94 p-2 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#111318]/94">
      <div className="px-2 pb-2 pt-1">
        <div className="text-sm font-semibold text-black/84 dark:text-white/88">Canvas history</div>
        <div className="text-xs leading-5 text-black/48 dark:text-white/38">
          Switch versions for the selected frame or restore deleted frames kept in canvas history.
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as HistoryTab)} className="gap-0">
        <TabsList className="grid h-10 w-full grid-cols-2 rounded-2xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
          <TabsTrigger value="versions" className="rounded-[14px] text-xs">
            Versions
          </TabsTrigger>
          <TabsTrigger value="deleted" className="rounded-[14px] text-xs">
            Deleted
          </TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="mt-2">
          {!selectedFrame ? (
            <div className="rounded-[22px] border border-dashed border-black/10 px-4 py-8 text-center text-sm text-black/45 dark:border-white/12 dark:text-white/38">
              Select a frame to browse its AI regeneration history.
            </div>
          ) : (
            <ScrollArea className="max-h-[430px] pr-1">
              <div className="space-y-2">
                <div className="rounded-[22px] border border-black/8 bg-black/[0.025] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="truncate text-sm font-medium text-black/82 dark:text-white/86">
                    {selectedFrame.title}
                  </div>
                  <div className="text-[11px] text-black/45 dark:text-white/34">
                    {selectedFrame.versions?.length ?? 1} saved versions
                  </div>
                </div>

                {versions.map((version, index) => {
                  const isActive = version.id === selectedFrame.activeVersionId;

                  return (
                    <div
                      key={version.id}
                      className={cn(
                        'rounded-[22px] border p-3 transition',
                        isActive
                          ? 'border-black/70 bg-black/[0.04] shadow-[0_14px_32px_rgba(15,23,42,0.08)] dark:border-white/70 dark:bg-white/[0.05]'
                          : 'border-black/8 bg-white dark:border-white/10 dark:bg-[#15171c]',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-black/82 dark:text-white/86">
                            {getVersionLabel(version, index, versions.length)}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-black/45 dark:text-white/34">
                            <span>{formatCanvasTimestamp(version.createdAt)}</span>
                            <span>•</span>
                            <span className="uppercase tracking-[0.18em]">{version.kind}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={isActive ? 'default' : 'outline'}
                          className={cn(
                            'rounded-full',
                            isActive && 'bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black',
                          )}
                          onClick={() => onSwitchVersion(version.id)}
                          disabled={isActive}
                        >
                          {isActive ? 'Current' : 'Switch'}
                        </Button>
                      </div>
                      {version.prompt ? (
                        <div className="mt-2 rounded-[18px] border border-black/8 bg-black/[0.03] px-3 py-2 text-xs leading-5 text-black/58 dark:border-white/8 dark:bg-white/[0.03] dark:text-white/44">
                          {version.prompt}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="deleted" className="mt-2">
          {trash.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-black/10 px-4 py-8 text-center text-sm text-black/45 dark:border-white/12 dark:text-white/38">
              Deleted frames are kept here so they can be restored later.
            </div>
          ) : (
            <ScrollArea className="max-h-[430px] pr-1">
              <div className="space-y-2">
                {trash.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-[22px] border border-black/8 bg-white p-3 dark:border-white/10 dark:bg-[#15171c]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-black/82 dark:text-white/86">
                          {entry.frame.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-black/45 dark:text-white/34">
                          <span>{formatCanvasTimestamp(entry.deletedAt)}</span>
                          <span>•</span>
                          <span>{entry.frame.versions?.length ?? 1} versions</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => onRestoreDeletedFrame(entry.id)}
                      >
                        <Undo2 className="size-3.5" />
                        Restore
                      </Button>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-black/55 dark:text-white/42">
                      {entry.reason === 'replace'
                        ? 'Removed during version replacement.'
                        : 'Deleted from the canvas workspace.'}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CanvasInfoButton({
  framesCount,
  projectName,
  deletedCount,
  isSaving,
  saveError,
}: {
  framesCount: number;
  projectName: string;
  deletedCount: number;
  isSaving: boolean;
  saveError: string | null;
}) {
  const statusLabel = isSaving ? 'Saving canvas' : saveError ? 'Save issue' : 'Canvas saved';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/92 px-2 py-1 text-[10px] font-medium text-black/65 shadow-lg backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-[#111214]/92 dark:text-white/62 dark:hover:bg-[#17191d]"
        >
          <Info className="size-3" />
          <span>Info</span>
          <span
            className={cn(
              'size-1.5 rounded-full',
              isSaving ? 'bg-amber-400' : saveError ? 'bg-red-400' : 'bg-emerald-400',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-[250px] rounded-[20px] border border-black/8 bg-white/96 p-2 shadow-[0_20px_60px_rgba(15,23,42,0.15)] backdrop-blur dark:border-white/10 dark:bg-[#111214]/96"
      >
        <div className="rounded-[16px] border border-black/8 bg-black/[0.025] p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-black/84 dark:text-white/88">Canvas info</div>
            <div className="inline-flex items-center gap-1 text-[10px] text-black/48 dark:text-white/38">
              {isSaving ? <Save className="size-3 animate-pulse" /> : <Save className="size-3" />}
              {statusLabel}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-[14px] border border-black/8 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-[#17191d]">
              <div className="text-[9px] uppercase tracking-[0.14em] text-black/40 dark:text-white/33">Frames</div>
              <div className="mt-1 text-[12px] font-semibold text-black/84 dark:text-white/88">{framesCount}</div>
            </div>
            <div className="rounded-[14px] border border-black/8 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-[#17191d]">
              <div className="text-[9px] uppercase tracking-[0.14em] text-black/40 dark:text-white/33">Deleted</div>
              <div className="mt-1 text-[12px] font-semibold text-black/84 dark:text-white/88">{deletedCount}</div>
            </div>
            <div className="rounded-[14px] border border-black/8 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-[#17191d]">
              <div className="text-[9px] uppercase tracking-[0.14em] text-black/40 dark:text-white/33">Project</div>
              <div className="mt-1 truncate text-[12px] font-semibold text-black/84 dark:text-white/88">
                {projectName}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function BuilderCanvas({
  projectId,
  projectName,
  initialState,
  livePreviewUrl,
  selectedFilePath,
  selectedFileContent,
  onPersist,
}: {
  projectId: string;
  projectName: string;
  initialState?: BuilderCanvasState | null;
  livePreviewUrl?: string;
  selectedFilePath?: string | null;
  selectedFileContent?: string;
  onPersist: (state: BuilderCanvasState) => Promise<void>;
}) {
  const initialCanvasState = useMemo(() => normalizeBuilderCanvasState(initialState), [initialState]);
  const [frames, setFrames] = useState<BuilderCanvasFrame[]>(initialCanvasState.frames ?? []);
  const [deletedFrames, setDeletedFrames] = useState<BuilderCanvasDeletedFrame[]>(
    initialCanvasState.deletedFrames ?? [],
  );
  const [themeId, setThemeId] = useState<string>(initialCanvasState.themeId ?? BUILDER_CANVAS_THEMES[0].id);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(initialCanvasState.frames?.[0]?.id ?? null);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [zoomPercent, setZoomPercent] = useState(53);
  const [currentScale, setCurrentScale] = useState(0.53);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inspectingFrameId, setInspectingFrameId] = useState<string | null>(null);
  const [isFrameDownloading, setIsFrameDownloading] = useState<string | null>(null);
  const [canvasPrompt, setCanvasPrompt] = useState('');
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [generationState, setGenerationState] = useState<{
    mode: 'create' | 'regenerate';
    frameId: string | null;
  } | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationErrorTarget, setGenerationErrorTarget] = useState<'create' | string | null>(null);
  const [historyTab, setHistoryTab] = useState<HistoryTab>(
    initialCanvasState.deletedFrames?.length ? 'deleted' : 'versions',
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const saveTimerRef = useRef<number | null>(null);
  const frameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hydratedProjectRef = useRef<string | null>(null);

  const theme = useMemo(() => getBuilderCanvasTheme(themeId), [themeId]);
  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? null,
    [frames, selectedFrameId],
  );
  const inspectingFrame = useMemo(
    () => frames.find((frame) => frame.id === inspectingFrameId) ?? null,
    [frames, inspectingFrameId],
  );
  const canAddPreview = Boolean(livePreviewUrl);
  const canAddHtml = Boolean(selectedFilePath && /\.(html?|xhtml)$/i.test(selectedFilePath) && selectedFileContent);
  const toolbarScale = clamp(1 / currentScale, 0.88, 1.48);
  const isCreating = generationState?.mode === 'create';
  const themeColors = useMemo(() => parseBuilderCanvasThemeColors(theme.style), [theme.style]);

  useEffect(() => {
    if (hydratedProjectRef.current === projectId) return;
    hydratedProjectRef.current = projectId;
    const nextState = normalizeBuilderCanvasState(initialState);
    setFrames(nextState.frames ?? []);
    setDeletedFrames(nextState.deletedFrames ?? []);
    setThemeId(nextState.themeId ?? BUILDER_CANVAS_THEMES[0].id);
    setSelectedFrameId(nextState.frames?.[0]?.id ?? null);
    setHistoryTab(nextState.deletedFrames?.length ? 'deleted' : 'versions');
  }, [initialState, projectId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'BUILDER_CANVAS_FRAME_HEIGHT' || typeof event.data?.frameId !== 'string') return;
      const frameId = event.data.frameId;
      const height = typeof event.data.height === 'number' ? event.data.height : null;
      if (!height) return;

      setFrames((current) =>
        current.map((frame) =>
          frame.id === frameId
            ? {
                ...frame,
                height: Math.max(800, Math.min(2200, height + 8)),
              }
            : frame,
        ),
      );
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const persistState = useCallback(
    async (nextState: BuilderCanvasState) => {
      setIsSaving(true);
      setSaveError(null);
      try {
        await onPersist(nextState);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Failed to save canvas.');
      } finally {
        setIsSaving(false);
      }
    },
    [onPersist],
  );

  useEffect(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistState(
        normalizeBuilderCanvasState({
          themeId,
          frames,
          deletedFrames,
        }),
      );
    }, 350);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [deletedFrames, frames, persistState, themeId]);

  const updateFrame = useCallback((frameId: string, patch: Partial<BuilderCanvasFrame>) => {
    setFrames((current) =>
      current.map((frame) =>
        frame.id === frameId ? normalizeBuilderCanvasFrame({ ...frame, ...patch, updatedAt: Date.now() }) : frame,
      ),
    );
  }, []);

  const addPreviewFrame = useCallback(() => {
    if (!livePreviewUrl) return;
    const nextFrame = createCanvasFrame(
      {
        title: frames.length === 0 ? 'Live Preview' : `Preview ${frames.length + 1}`,
        kind: 'preview',
        source: livePreviewUrl,
        versionOrigin: 'import',
      },
      frames.length,
    );
    setFrames((current) => [...current, nextFrame]);
    setSelectedFrameId(nextFrame.id);
    setHistoryTab('versions');
  }, [frames.length, livePreviewUrl]);

  const addHtmlFrame = useCallback(() => {
    if (!selectedFilePath || !selectedFileContent) return;
    const nextFrame = createCanvasFrame(
      {
        title: selectedFilePath.split('/').pop() || `Screen ${frames.length + 1}`,
        kind: 'html',
        source: selectedFileContent,
        prompt: `Imported from ${selectedFilePath}`,
        themeId,
        versionOrigin: 'import',
      },
      frames.length,
    );
    setFrames((current) => [...current, nextFrame]);
    setSelectedFrameId(nextFrame.id);
    setHistoryTab('versions');
  }, [frames.length, selectedFileContent, selectedFilePath, themeId]);

  const duplicateFrame = useCallback(
    (frameId: string) => {
      const sourceFrame = frames.find((frame) => frame.id === frameId);
      if (!sourceFrame) return;

      const nextFrame = createCanvasFrame(
        {
          title: `${sourceFrame.title} Copy`,
          kind: sourceFrame.kind,
          source: sourceFrame.source,
          x: sourceFrame.x + 36,
          y: sourceFrame.y + 36,
          width: sourceFrame.width,
          height: sourceFrame.height,
          prompt: sourceFrame.lastPrompt ?? null,
          themeId,
          versionOrigin: 'duplicate',
        },
        frames.length,
      );

      setFrames((current) => [...current, nextFrame]);
      setSelectedFrameId(nextFrame.id);
      setHistoryTab('versions');
    },
    [frames, themeId],
  );

  const deleteFrame = useCallback(
    (frameId: string) => {
      const targetFrame = frames.find((frame) => frame.id === frameId);
      if (!targetFrame) return;

      setDeletedFrames((current) => [createBuilderCanvasDeletedFrame(targetFrame), ...current]);
      setFrames((current) => {
        const next = current.filter((frame) => frame.id !== frameId);
        return next;
      });
      setSelectedFrameId((current) => {
        if (current !== frameId) return current;
        return frames.find((frame) => frame.id !== frameId)?.id ?? null;
      });
      setHistoryTab('deleted');
      setIsHistoryOpen(true);
    },
    [frames],
  );

  const restoreDeletedFrame = useCallback(
    (deletedFrameId: string) => {
      const target = deletedFrames.find((entry) => entry.id === deletedFrameId);
      if (!target) return;

      const restoredFrame = normalizeBuilderCanvasFrame({
        ...target.frame,
        x: target.frame.x + 32,
        y: target.frame.y + 32,
        updatedAt: Date.now(),
      });

      setDeletedFrames((current) => current.filter((entry) => entry.id !== deletedFrameId));
      setFrames((current) => [...current, restoredFrame]);
      setSelectedFrameId(restoredFrame.id);
      setHistoryTab('versions');
      setIsHistoryOpen(true);
    },
    [deletedFrames],
  );

  const switchVersion = useCallback((frameId: string, versionId: string) => {
    setFrames((current) =>
      current.map((frame) => (frame.id === frameId ? applyBuilderCanvasFrameVersion(frame, versionId) : frame)),
    );
    setSelectedFrameId(frameId);
  }, []);

  const openFrame = useCallback(
    (frameId: string) => {
      const targetFrame = frames.find((frame) => frame.id === frameId);
      if (!targetFrame) return;

      if (targetFrame.kind === 'preview') {
        window.open(targetFrame.source, '_blank', 'noopener,noreferrer');
        return;
      }

      setInspectingFrameId(targetFrame.id);
    },
    [frames],
  );

  const downloadFrame = useCallback(
    async (frameId: string) => {
      const targetFrame = frames.find((frame) => frame.id === frameId);
      if (!targetFrame) return;

      if (targetFrame.kind === 'html') {
        downloadTextFile(`${targetFrame.title.replace(/\s+/g, '-').toLowerCase() || 'frame'}.html`, targetFrame.source);
        return;
      }

      const target = frameRefs.current[targetFrame.id];
      if (!target) return;

      try {
        setIsFrameDownloading(targetFrame.id);
        const dataUrl = await toPng(target, {
          cacheBust: true,
          pixelRatio: 2,
        });
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${targetFrame.title.replace(/\s+/g, '-').toLowerCase() || 'frame'}.png`;
        link.click();
      } catch {
        downloadTextFile(
          `${targetFrame.title.replace(/\s+/g, '-').toLowerCase() || 'frame'}.url.txt`,
          targetFrame.source,
        );
      } finally {
        setIsFrameDownloading(null);
      }
    },
    [frames],
  );

  const generateWithAi = useCallback(
    async ({ mode, prompt, frameId }: { mode: 'create' | 'regenerate'; prompt: string; frameId?: string | null }) => {
      const nextPrompt = prompt.trim();
      if (!nextPrompt || generationState) return;

      const targetFrame = frameId ? (frames.find((frame) => frame.id === frameId) ?? null) : null;
      if (mode === 'regenerate' && !targetFrame) return;

      setGenerationState({
        mode,
        frameId: targetFrame?.id ?? null,
      });
      setGenerationError(null);
      setGenerationErrorTarget(mode === 'create' ? 'create' : (targetFrame?.id ?? null));

      try {
        const response = await fetch(`/api/builder/projects/${projectId}/canvas`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: nextPrompt,
            mode,
            themeId,
            selectedFilePath: selectedFilePath ?? null,
            selectedFileContent: selectedFileContent ?? null,
            selectedFrame: targetFrame
              ? {
                  id: targetFrame.id,
                  title: targetFrame.title,
                  kind: targetFrame.kind,
                  source: targetFrame.source,
                }
              : null,
          }),
        });

        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          title?: string;
          html?: string;
        } | null;
        if (!response.ok || !payload?.html) {
          throw new Error(payload?.error || 'Failed to generate canvas frame.');
        }

        const generatedHtml = payload.html;
        const generatedTitle = payload.title;

        if (mode === 'regenerate' && targetFrame) {
          const createdAt = Date.now();
          setFrames((current) =>
            current.map((frame) =>
              frame.id === targetFrame.id
                ? appendBuilderCanvasFrameVersion(frame, {
                    title: generatedTitle || frame.title,
                    kind: 'html',
                    source: generatedHtml,
                    prompt: nextPrompt,
                    createdAt,
                    createdBy: 'ai-regenerate',
                    themeId,
                  })
                : frame,
            ),
          );
          setSelectedFrameId(targetFrame.id);
          setHistoryTab('versions');
          setIsHistoryOpen(true);
        } else {
          const nextFrame = createCanvasFrame(
            {
              title: generatedTitle || `Screen ${frames.length + 1}`,
              kind: 'html',
              source: generatedHtml,
              prompt: nextPrompt,
              themeId,
              versionOrigin: 'ai-create',
            },
            frames.length,
          );

          setFrames((current) => [...current, nextFrame]);
          setSelectedFrameId(nextFrame.id);
          setCanvasPrompt('');
          setIsPromptOpen(false);
          setHistoryTab('versions');
          setIsHistoryOpen(true);
        }
      } catch (error) {
        setGenerationError(error instanceof Error ? error.message : 'Failed to generate canvas frame.');
      } finally {
        setGenerationState(null);
      }
    },
    [frames, generationState, projectId, selectedFileContent, selectedFilePath, themeId],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#ececea] dark:bg-[#242423]">
      <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-black/10 bg-white/96 px-1 py-1 shadow-[0_12px_32px_rgba(15,23,42,0.13)] backdrop-blur dark:border-white/10 dark:bg-[#101114]/96">
        <Popover open={isPromptOpen} onOpenChange={setIsPromptOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon-xs"
              className="rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-white shadow-[0_10px_20px_rgba(99,102,241,0.24)] hover:from-fuchsia-400 hover:to-indigo-500"
            >
              <Wand2 className="size-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[360px] rounded-[26px] border-black/10 p-2.5 shadow-xl">
            <div className="rounded-[22px] border border-black/8 bg-white p-2 dark:border-white/10 dark:bg-[#121317]">
              <div className="mb-2 flex items-center gap-2 px-1">
                <Bot className="size-4 text-fuchsia-500" />
                <div className="text-sm font-medium text-black/80 dark:text-white/85">Canvas AI</div>
              </div>
              <textarea
                value={canvasPrompt}
                onChange={(event) => setCanvasPrompt(event.target.value)}
                placeholder="Describe the screen you want to create for the canvas..."
                className="min-h-[150px] w-full resize-none rounded-2xl border border-black/8 bg-[#fafafa] px-3 py-3 text-sm leading-6 text-black outline-none placeholder:text-black/30 dark:border-white/10 dark:bg-[#0d0f13] dark:text-white dark:placeholder:text-white/25"
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void generateWithAi({
                      mode: 'create',
                      prompt: canvasPrompt,
                    });
                  }
                }}
              />
              {generationError && generationErrorTarget === 'create' ? (
                <div className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {generationError}
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-[11px] text-black/45 dark:text-white/35">
                  Design adds a new frame. Use each frame toolbar for AI regenerate and version history.
                </div>
                <Button
                  size="sm"
                  className="rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-white hover:from-fuchsia-400 hover:to-indigo-500"
                  onClick={() =>
                    void generateWithAi({
                      mode: 'create',
                      prompt: canvasPrompt,
                    })
                  }
                  disabled={!canvasPrompt.trim() || Boolean(generationState)}
                >
                  {isCreating ? <Save className="size-4 animate-pulse" /> : <Sparkles className="size-4" />}
                  Design
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          size="xs"
          className="h-6 rounded-full px-2 text-[10px] bg-gradient-to-r from-sky-500 to-cyan-500 text-white hover:from-sky-400 hover:to-cyan-400"
          onClick={addPreviewFrame}
          disabled={!canAddPreview}
        >
          <Eye className="size-3" />
          Add Preview
        </Button>
        <Button
          size="xs"
          variant="outline"
          className="h-6 rounded-full px-2 text-[10px]"
          onClick={addHtmlFrame}
          disabled={!canAddHtml}
        >
          <LayoutTemplate className="size-3" />
          Add HTML
        </Button>

        <div className="mx-0.5 h-3.5 w-px bg-black/10 dark:bg-white/10" />
        <ThemePicker themeId={themeId} onSelect={setThemeId} />

        <div className="mx-0.5 h-3.5 w-px bg-black/10 dark:bg-white/10" />
        <Button
          size="xs"
          variant="ghost"
          className={cn('h-6 rounded-full px-2 text-[10px]', isHistoryOpen && 'bg-black/5 dark:bg-white/10')}
          onClick={() => setIsHistoryOpen((current) => !current)}
        >
          <Clock3 className="size-3" />
          History
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className={cn('rounded-full', toolMode === 'select' && 'bg-black/5 dark:bg-white/10')}
          onClick={() => setToolMode('select')}
        >
          <MousePointer2 className="size-3" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className={cn('rounded-full', toolMode === 'hand' && 'bg-black/5 dark:bg-white/10')}
          onClick={() => setToolMode('hand')}
        >
          <Hand className="size-3" />
        </Button>
      </div>

      {isHistoryOpen && (selectedFrame || deletedFrames.length > 0) ? (
        <HistoryPanel
          selectedFrame={selectedFrame}
          deletedFrames={deletedFrames}
          activeTab={historyTab}
          onTabChange={setHistoryTab}
          onSwitchVersion={(versionId) => {
            if (!selectedFrame) return;
            switchVersion(selectedFrame.id, versionId);
          }}
          onRestoreDeletedFrame={restoreDeletedFrame}
        />
      ) : null}

      <TransformWrapper
        initialScale={0.53}
        initialPositionX={40}
        initialPositionY={8}
        minScale={0.15}
        maxScale={2.8}
        wheel={{ step: 0.08 }}
        pinch={{ step: 0.08 }}
        doubleClick={{ disabled: true }}
        limitToBounds={false}
        smooth
        panning={{ disabled: toolMode !== 'hand' }}
        onTransform={(_, state) => {
          setZoomPercent(Math.round(state.scale * 100));
          setCurrentScale(state.scale);
        }}
      >
        {({ zoomIn, zoomOut }) => (
          <>
            <div
              className={cn(
                'absolute inset-0 bg-[#ececea] dark:bg-[#242423]',
                toolMode === 'hand' && 'cursor-grab active:cursor-grabbing',
              )}
              style={{
                backgroundImage: `radial-gradient(circle, ${themeColors.primary} 1px, transparent 1px)`,
                backgroundSize: '20px 20px',
              }}
              onClick={() => {
                if (toolMode === 'select') setSelectedFrameId(null);
              }}
            >
              <TransformComponent
                wrapperStyle={{
                  width: '100%',
                  height: '100%',
                  overflow: 'unset',
                }}
                contentStyle={{
                  width: '100%',
                  height: '100%',
                }}
              >
                <div className="relative h-full w-full">
                  {frames.map((frame) => {
                    const frameDoc = getFrameDoc(frame, theme.style);
                    const isSelected = selectedFrameId === frame.id;
                    const isRegenerating =
                      generationState?.mode === 'regenerate' && generationState.frameId === frame.id;

                    return (
                      <Rnd
                        key={frame.id}
                        default={{
                          x: frame.x,
                          y: frame.y,
                          width: frame.width,
                          height: frame.height,
                        }}
                        position={{ x: frame.x, y: frame.y }}
                        size={{ width: frame.width, height: frame.height }}
                        minWidth={300}
                        minHeight={520}
                        scale={currentScale}
                        disableDragging={toolMode === 'hand'}
                        enableResizing={toolMode === 'select' && isSelected}
                        dragHandleClassName="builder-canvas-frame-handle"
                        onDragStop={(_, data) => updateFrame(frame.id, { x: data.x, y: data.y })}
                        onResizeStop={(_, __, ref, ___, position) =>
                          updateFrame(frame.id, {
                            width: Number.parseInt(ref.style.width, 10),
                            height: Number.parseInt(ref.style.height, 10),
                            x: position.x,
                            y: position.y,
                          })
                        }
                        className={cn(
                          'group rounded-[32px]',
                          isSelected && 'ring-4 ring-sky-400/50 ring-offset-2 ring-offset-transparent',
                          toolMode === 'hand' ? 'cursor-grab active:cursor-grabbing' : 'cursor-move',
                        )}
                        onClick={(event: ReactMouseEvent) => {
                          event.stopPropagation();
                          if (toolMode === 'select') {
                            setSelectedFrameId(frame.id);
                            setHistoryTab('versions');
                          }
                        }}
                      >
                        {isSelected ? (
                          <FrameMiniToolbar
                            frame={frame}
                            scale={toolbarScale}
                            isDownloading={isFrameDownloading === frame.id}
                            isRegenerating={Boolean(isRegenerating)}
                            generationError={generationErrorTarget === frame.id ? generationError : null}
                            onInspect={() => openFrame(frame.id)}
                            onDownload={() => void downloadFrame(frame.id)}
                            onOpenHistory={() => {
                              setHistoryTab('versions');
                              setIsHistoryOpen(true);
                            }}
                            onRegenerate={(prompt) =>
                              void generateWithAi({
                                mode: 'regenerate',
                                prompt,
                                frameId: frame.id,
                              })
                            }
                            onDuplicate={() => duplicateFrame(frame.id)}
                            onDelete={() => deleteFrame(frame.id)}
                          />
                        ) : null}

                        <div
                          ref={(node) => {
                            frameRefs.current[frame.id] = node;
                          }}
                          className="flex h-full w-full flex-col overflow-hidden rounded-[32px] border border-black/10 bg-[#0f1115] shadow-[0_25px_65px_rgba(15,23,42,0.22)]"
                        >
                          <div className="builder-canvas-frame-handle flex items-center justify-between gap-3 border-b border-white/10 bg-[#111318] px-4 py-3 text-white">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{frame.title}</div>
                              <div className="truncate text-[11px] text-white/45">
                                {frame.kind === 'preview' ? frame.source : 'HTML frame'}
                              </div>
                            </div>
                            <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/45">
                              v{frame.versions?.length ?? 1}
                            </div>
                          </div>

                          <div className="flex-1 overflow-hidden bg-white">
                            {frame.kind === 'preview' ? (
                              <iframe title={frame.title} src={frame.source} className="h-full w-full" />
                            ) : (
                              <iframe
                                title={frame.title}
                                srcDoc={frameDoc}
                                sandbox="allow-scripts allow-same-origin"
                                className="h-full w-full"
                              />
                            )}
                          </div>
                        </div>
                      </Rnd>
                    );
                  })}
                </div>
              </TransformComponent>
            </div>

            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-black/10 bg-black/92 px-2.5 py-0.5 text-white shadow-lg">
              <Button
                size="icon-xs"
                variant="ghost"
                className="rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={() => setToolMode('select')}
              >
                <MousePointer2 className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                className="rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={() => setToolMode('hand')}
              >
                <Hand className="size-3" />
              </Button>
              <div className="h-3.5 w-px bg-white/20" />
              <Button
                size="icon-xs"
                variant="ghost"
                className="rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={() => zoomOut()}
              >
                <Minus className="size-3" />
              </Button>
              <div className="min-w-8 text-center text-[10px] font-medium">{zoomPercent}%</div>
              <Button
                size="icon-xs"
                variant="ghost"
                className="rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={() => zoomIn()}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </>
        )}
      </TransformWrapper>

      <div className="absolute bottom-4 right-4 z-20">
        <CanvasInfoButton
          framesCount={frames.length}
          projectName={projectName}
          deletedCount={deletedFrames.length}
          isSaving={isSaving}
          saveError={saveError}
        />
      </div>

      <Dialog open={Boolean(inspectingFrameId)} onOpenChange={(open) => !open && setInspectingFrameId(null)}>
        <DialogContent className="max-h-[92vh] w-[min(92vw,1100px)] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{inspectingFrame?.title ?? 'Canvas frame source'}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[75vh] rounded-xl border border-black/10 bg-[#0f1115]">
            <pre className="whitespace-pre-wrap px-4 py-4 text-xs leading-6 text-white/82">
              <code>
                {inspectingFrame
                  ? wrapBuilderCanvasHtml(inspectingFrame.source, inspectingFrame.title, theme.style)
                  : ''}
              </code>
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
