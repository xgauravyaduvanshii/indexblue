'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { toPng } from 'html-to-image';
import { Rnd } from 'react-rnd';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import {
  ArrowRight,
  Bot,
  Circle,
  Camera,
  Check,
  CheckSquare,
  ChevronDown,
  ClipboardPaste,
  Clock3,
  Code2,
  Copy,
  Diamond,
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
  Pencil,
  Plus,
  Scissors,
  Save,
  Square,
  Sparkles,
  Trash2,
  Triangle,
  Undo2,
  Wand2,
  X,
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
  normalizeBuilderCanvasDrawing,
  normalizeBuilderCanvasFrame,
  normalizeBuilderCanvasState,
  parseBuilderCanvasThemeColors,
  type BuilderCanvasArrowDrawing,
  type BuilderCanvasArrowKind,
  type BuilderCanvasDrawing,
  type BuilderCanvasDeletedFrame,
  type BuilderCanvasFrame,
  type BuilderCanvasPathDrawing,
  type BuilderCanvasPoint,
  type BuilderCanvasShapeDrawing,
  type BuilderCanvasShapeKind,
  type BuilderCanvasFrameVersion,
  type BuilderCanvasFrameVersionOrigin,
  type BuilderCanvasState,
  wrapBuilderCanvasHtml,
} from '@/lib/builder/canvas';

type ToolMode = 'select' | 'hand' | 'shape' | 'arrow' | 'pencil';
type HistoryTab = 'versions' | 'deleted';
type DrawingDraft =
  | {
      kind: 'shape';
      shape: BuilderCanvasShapeKind;
      start: BuilderCanvasPoint;
      current: BuilderCanvasPoint;
    }
  | {
      kind: 'arrow';
      arrow: BuilderCanvasArrowKind;
      start: BuilderCanvasPoint;
      current: BuilderCanvasPoint;
    }
  | {
      kind: 'path';
      points: BuilderCanvasPoint[];
    };
type DrawingInteraction =
  | {
      kind: 'move';
      drawingId: string;
      startPoint: BuilderCanvasPoint;
      snapshot: BuilderCanvasDrawing;
    }
  | {
      kind: 'arrow-endpoint';
      drawingId: string;
      endpoint: 'start' | 'end';
      snapshot: BuilderCanvasArrowDrawing;
    };
type CanvasClipboardEntry =
  | {
      kind: 'frame';
      frame: BuilderCanvasFrame;
    }
  | {
      kind: 'drawing';
      drawing: BuilderCanvasDrawing;
    };
type CanvasContextMenuState = {
  x: number;
  y: number;
  scope: 'canvas' | 'selection';
};

const FRAME_WIDTH = 420;
const FRAME_HEIGHT = 860;
const DEFAULT_DRAW_COLORS = ['#0f172a', '#3b82f6', '#14b8a6', '#f97316', '#ec4899', '#7c3aed', '#ef4444'];

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

const SHAPE_OPTIONS: Array<{
  kind: BuilderCanvasShapeKind;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { kind: 'rectangle', label: 'Rectangle', icon: LayoutTemplate },
  { kind: 'square', label: 'Square', icon: Square },
  { kind: 'circle', label: 'Circle', icon: Circle },
  { kind: 'diamond', label: 'Diamond', icon: Diamond },
  { kind: 'triangle', label: 'Triangle', icon: Triangle },
];

const ARROW_OPTIONS: Array<{ kind: BuilderCanvasArrowKind; label: string }> = [
  { kind: 'line', label: 'Line' },
  { kind: 'double', label: 'Double' },
  { kind: 'dashed', label: 'Dashed' },
  { kind: 'elbow', label: 'Elbow' },
];

function createCanvasDrawingId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampPoint(point: BuilderCanvasPoint) {
  return {
    x: Math.max(0, point.x),
    y: Math.max(0, point.y),
  };
}

function getCanvasPoint(
  event: PointerEvent | ReactPointerEvent,
  boardRect: DOMRect,
  transformState: { x: number; y: number; scale: number },
) {
  return clampPoint({
    x: (event.clientX - boardRect.left - transformState.x) / transformState.scale,
    y: (event.clientY - boardRect.top - transformState.y) / transformState.scale,
  });
}

function normalizeShapeBounds(start: BuilderCanvasPoint, current: BuilderCanvasPoint, lockAspectRatio: boolean) {
  let width = current.x - start.x;
  let height = current.y - start.y;

  if (lockAspectRatio) {
    const size = Math.max(Math.abs(width), Math.abs(height));
    width = Math.sign(width || 1) * size;
    height = Math.sign(height || 1) * size;
  }

  return {
    x: width >= 0 ? start.x : start.x + width,
    y: height >= 0 ? start.y : start.y + height,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function buildShapeDrawing(
  shape: BuilderCanvasShapeKind,
  start: BuilderCanvasPoint,
  current: BuilderCanvasPoint,
  color: string,
): BuilderCanvasShapeDrawing | null {
  const bounds = normalizeShapeBounds(start, current, shape === 'square' || shape === 'circle');
  if (bounds.width < 12 || bounds.height < 12) return null;
  const now = Date.now();

  return normalizeBuilderCanvasDrawing({
    id: createCanvasDrawingId('canvas-shape'),
    kind: 'shape',
    shape,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    color,
    fill: `${color}22`,
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
  }) as BuilderCanvasShapeDrawing;
}

function buildArrowDrawing(
  arrow: BuilderCanvasArrowKind,
  start: BuilderCanvasPoint,
  current: BuilderCanvasPoint,
  color: string,
): BuilderCanvasArrowDrawing | null {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  if (Math.hypot(dx, dy) < 18) return null;
  const now = Date.now();

  return normalizeBuilderCanvasDrawing({
    id: createCanvasDrawingId('canvas-arrow'),
    kind: 'arrow',
    arrow,
    start: clampPoint(start),
    end: clampPoint(current),
    color,
    strokeWidth: 2.5,
    createdAt: now,
    updatedAt: now,
  }) as BuilderCanvasArrowDrawing;
}

function buildPathDrawing(points: BuilderCanvasPoint[], color: string): BuilderCanvasPathDrawing | null {
  if (points.length < 2) return null;
  const now = Date.now();

  return normalizeBuilderCanvasDrawing({
    id: createCanvasDrawingId('canvas-path'),
    kind: 'path',
    points: points.map((point) => clampPoint(point)),
    color,
    strokeWidth: 2.5,
    createdAt: now,
    updatedAt: now,
  }) as BuilderCanvasPathDrawing;
}

function pathFromPoints(points: BuilderCanvasPoint[]) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.reduce((path, point, index) => `${path}${index === 0 ? 'M' : ' L'} ${point.x} ${point.y}`, '');
}

function getArrowPath(drawing: Pick<BuilderCanvasArrowDrawing, 'arrow' | 'start' | 'end'>) {
  if (drawing.arrow === 'elbow') {
    const midX = drawing.start.x + (drawing.end.x - drawing.start.x) * 0.55;
    return `M ${drawing.start.x} ${drawing.start.y} L ${midX} ${drawing.start.y} L ${midX} ${drawing.end.y} L ${drawing.end.x} ${drawing.end.y}`;
  }

  return `M ${drawing.start.x} ${drawing.start.y} L ${drawing.end.x} ${drawing.end.y}`;
}

function getDrawingBounds(drawing: BuilderCanvasDrawing) {
  if (drawing.kind === 'shape') {
    return {
      x: drawing.x,
      y: drawing.y,
      width: drawing.width,
      height: drawing.height,
    };
  }

  if (drawing.kind === 'arrow') {
    const padding = 18;
    const minX = Math.min(drawing.start.x, drawing.end.x);
    const minY = Math.min(drawing.start.y, drawing.end.y);
    const maxX = Math.max(drawing.start.x, drawing.end.x);
    const maxY = Math.max(drawing.start.y, drawing.end.y);

    return {
      x: minX - padding,
      y: minY - padding,
      width: Math.max(maxX - minX + padding * 2, 36),
      height: Math.max(maxY - minY + padding * 2, 36),
    };
  }

  const xs = drawing.points.map((point) => point.x);
  const ys = drawing.points.map((point) => point.y);
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxX = Math.max(...xs, 0);
  const maxY = Math.max(...ys, 0);

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

function translateDrawing(drawing: BuilderCanvasDrawing, deltaX: number, deltaY: number) {
  if (drawing.kind === 'shape') {
    return normalizeBuilderCanvasDrawing({
      ...drawing,
      x: drawing.x + deltaX,
      y: drawing.y + deltaY,
      updatedAt: Date.now(),
    }) as BuilderCanvasShapeDrawing;
  }

  if (drawing.kind === 'arrow') {
    return normalizeBuilderCanvasDrawing({
      ...drawing,
      start: {
        x: drawing.start.x + deltaX,
        y: drawing.start.y + deltaY,
      },
      end: {
        x: drawing.end.x + deltaX,
        y: drawing.end.y + deltaY,
      },
      updatedAt: Date.now(),
    }) as BuilderCanvasArrowDrawing;
  }

  return normalizeBuilderCanvasDrawing({
    ...drawing,
    points: drawing.points.map((point) => ({
      x: point.x + deltaX,
      y: point.y + deltaY,
    })),
    updatedAt: Date.now(),
  }) as BuilderCanvasPathDrawing;
}

function updateShapeDrawingBounds(
  drawing: BuilderCanvasShapeDrawing,
  bounds: { x: number; y: number; width: number; height: number },
) {
  return normalizeBuilderCanvasDrawing({
    ...drawing,
    ...bounds,
    updatedAt: Date.now(),
  }) as BuilderCanvasShapeDrawing;
}

function updateArrowDrawingEndpoint(
  drawing: BuilderCanvasArrowDrawing,
  endpoint: 'start' | 'end',
  point: BuilderCanvasPoint,
) {
  return normalizeBuilderCanvasDrawing({
    ...drawing,
    [endpoint]: clampPoint(point),
    updatedAt: Date.now(),
  }) as BuilderCanvasArrowDrawing;
}

function applyDrawingColor(drawing: BuilderCanvasDrawing, color: string) {
  if (drawing.kind === 'shape') {
    return normalizeBuilderCanvasDrawing({
      ...drawing,
      color,
      fill: `${color}22`,
      updatedAt: Date.now(),
    }) as BuilderCanvasShapeDrawing;
  }

  return normalizeBuilderCanvasDrawing({
    ...drawing,
    color,
    updatedAt: Date.now(),
  }) as BuilderCanvasArrowDrawing | BuilderCanvasPathDrawing;
}

function duplicateCanvasDrawing(drawing: BuilderCanvasDrawing, offset = 32) {
  const now = Date.now();

  if (drawing.kind === 'shape') {
    return normalizeBuilderCanvasDrawing({
      ...drawing,
      id: createCanvasDrawingId('canvas-shape'),
      x: drawing.x + offset,
      y: drawing.y + offset,
      createdAt: now,
      updatedAt: now,
    }) as BuilderCanvasShapeDrawing;
  }

  if (drawing.kind === 'arrow') {
    return normalizeBuilderCanvasDrawing({
      ...drawing,
      id: createCanvasDrawingId('canvas-arrow'),
      start: {
        x: drawing.start.x + offset,
        y: drawing.start.y + offset,
      },
      end: {
        x: drawing.end.x + offset,
        y: drawing.end.y + offset,
      },
      createdAt: now,
      updatedAt: now,
    }) as BuilderCanvasArrowDrawing;
  }

  return normalizeBuilderCanvasDrawing({
    ...drawing,
    id: createCanvasDrawingId('canvas-path'),
    points: drawing.points.map((point) => ({
      x: point.x + offset,
      y: point.y + offset,
    })),
    createdAt: now,
    updatedAt: now,
  }) as BuilderCanvasPathDrawing;
}

function describeCanvasDrawing(drawing: BuilderCanvasDrawing) {
  if (drawing.kind === 'shape') {
    return `Shape: ${drawing.shape} at (${Math.round(drawing.x)}, ${Math.round(drawing.y)}) size ${Math.round(drawing.width)}x${Math.round(drawing.height)} color ${drawing.color}`;
  }

  if (drawing.kind === 'arrow') {
    return `Arrow: ${drawing.arrow} from (${Math.round(drawing.start.x)}, ${Math.round(drawing.start.y)}) to (${Math.round(drawing.end.x)}, ${Math.round(drawing.end.y)}) color ${drawing.color}`;
  }

  return `Path: ${drawing.points.length} points color ${drawing.color}`;
}

function buildCanvasSelectionSummary(selectedFrames: BuilderCanvasFrame[], selectedDrawings: BuilderCanvasDrawing[]) {
  const frameLines = selectedFrames.map(
    (frame) =>
      `Frame: ${frame.title} (${frame.kind}) at (${Math.round(frame.x)}, ${Math.round(frame.y)}) size ${Math.round(frame.width)}x${Math.round(frame.height)}`,
  );
  const drawingLines = selectedDrawings.map((drawing) => describeCanvasDrawing(drawing));

  return [...frameLines, ...drawingLines].join('\n');
}

function renderShapeDrawing(drawing: BuilderCanvasShapeDrawing) {
  if (drawing.shape === 'circle') {
    return (
      <ellipse
        cx={drawing.x + drawing.width / 2}
        cy={drawing.y + drawing.height / 2}
        rx={drawing.width / 2}
        ry={drawing.height / 2}
        fill={drawing.fill}
        stroke={drawing.color}
        strokeWidth={drawing.strokeWidth}
      />
    );
  }

  if (drawing.shape === 'diamond') {
    const points = [
      `${drawing.x + drawing.width / 2},${drawing.y}`,
      `${drawing.x + drawing.width},${drawing.y + drawing.height / 2}`,
      `${drawing.x + drawing.width / 2},${drawing.y + drawing.height}`,
      `${drawing.x},${drawing.y + drawing.height / 2}`,
    ].join(' ');
    return <polygon points={points} fill={drawing.fill} stroke={drawing.color} strokeWidth={drawing.strokeWidth} />;
  }

  if (drawing.shape === 'triangle') {
    const points = [
      `${drawing.x + drawing.width / 2},${drawing.y}`,
      `${drawing.x + drawing.width},${drawing.y + drawing.height}`,
      `${drawing.x},${drawing.y + drawing.height}`,
    ].join(' ');
    return <polygon points={points} fill={drawing.fill} stroke={drawing.color} strokeWidth={drawing.strokeWidth} />;
  }

  return (
    <rect
      x={drawing.x}
      y={drawing.y}
      width={drawing.width}
      height={drawing.height}
      rx={drawing.shape === 'square' ? 14 : 18}
      fill={drawing.fill}
      stroke={drawing.color}
      strokeWidth={drawing.strokeWidth}
    />
  );
}

function renderArrowDrawing(drawing: BuilderCanvasArrowDrawing) {
  const markerStart = drawing.arrow === 'double' ? 'url(#canvas-arrow-head-start)' : undefined;
  const markerEnd = 'url(#canvas-arrow-head-end)';

  return (
    <path
      d={getArrowPath(drawing)}
      fill="none"
      stroke={drawing.color}
      strokeWidth={drawing.strokeWidth}
      strokeDasharray={drawing.arrow === 'dashed' ? '8 6' : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      markerStart={markerStart}
      markerEnd={markerEnd}
    />
  );
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
        className="w-[290px] rounded-[22px] border border-black/8 bg-white/96 p-1.5 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#111318]/96"
      >
        <div className="px-1.5 pb-1.5 pt-1">
          <div className="text-[13px] font-semibold text-black/84 dark:text-white/88">Canvas themes</div>
          <div className="text-[10px] leading-4 text-black/50 dark:text-white/40">
            Small theme chips for quick switching.
          </div>
        </div>
        <ScrollArea className="max-h-[268px] pr-1">
          <div className="grid grid-cols-2 gap-1.5 px-1 pb-1">
            {BUILDER_CANVAS_THEMES.map((canvasTheme) => {
              const colors = parseBuilderCanvasThemeColors(canvasTheme.style);
              const isSelected = canvasTheme.id === themeId;

              return (
                <button
                  key={canvasTheme.id}
                  type="button"
                  onClick={() => onSelect(canvasTheme.id)}
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-[18px] border p-2 text-left transition',
                    isSelected
                      ? 'border-black/70 bg-black/[0.03] shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:border-white/70 dark:bg-white/[0.04]'
                      : 'border-black/8 hover:border-black/16 hover:bg-black/[0.025] dark:border-white/10 dark:hover:border-white/18 dark:hover:bg-white/[0.03]',
                  )}
                >
                  <div
                    className="flex h-10 w-full shrink-0 items-center gap-1 rounded-[14px] border border-black/6 px-2 dark:border-white/10"
                    style={{
                      background: `linear-gradient(155deg, ${colors.background}, ${colors.muted})`,
                    }}
                  >
                    <span className="h-2 w-6 rounded-full" style={{ background: colors.primary }} />
                    <span className="h-2 w-3 rounded-full opacity-70" style={{ background: colors.secondary }} />
                    <span className="h-2 w-8 rounded-full" style={{ background: colors.accent }} />
                  </div>
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-black/82 dark:text-white/85">
                        {canvasTheme.name}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        {[colors.primary, colors.secondary, colors.accent, colors.muted].map((color, index) => (
                          <span
                            key={`${canvasTheme.id}-color-${index}`}
                            className="size-3 rounded-full border border-black/8 dark:border-white/10"
                            style={{ background: color }}
                          />
                        ))}
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
                        <Check className="size-3" />
                      </span>
                    ) : null}
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
  const [drawings, setDrawings] = useState<BuilderCanvasDrawing[]>(initialCanvasState.drawings ?? []);
  const [themeId, setThemeId] = useState<string>(initialCanvasState.themeId ?? BUILDER_CANVAS_THEMES[0].id);
  const [drawColor, setDrawColor] = useState<string>(
    initialCanvasState.drawColor ??
      parseBuilderCanvasThemeColors(getBuilderCanvasTheme(initialCanvasState.themeId).style).primary,
  );
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(initialCanvasState.frames?.[0]?.id ?? null);
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>(
    initialCanvasState.frames?.[0]?.id ? [initialCanvasState.frames[0].id] : [],
  );
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [activeShapeKind, setActiveShapeKind] = useState<BuilderCanvasShapeKind>('rectangle');
  const [activeArrowKind, setActiveArrowKind] = useState<BuilderCanvasArrowKind>('line');
  const [drawingDraft, setDrawingDraft] = useState<DrawingDraft | null>(null);
  const [zoomPercent, setZoomPercent] = useState(53);
  const [currentScale, setCurrentScale] = useState(0.53);
  const [transformOffset, setTransformOffset] = useState({ x: 40, y: 8 });
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
  const [clipboardItems, setClipboardItems] = useState<CanvasClipboardEntry[]>([]);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const frameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hydratedProjectRef = useRef<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const drawingInteractionRef = useRef<DrawingInteraction | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const theme = useMemo(() => getBuilderCanvasTheme(themeId), [themeId]);
  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? null,
    [frames, selectedFrameId],
  );
  const selectedFrames = useMemo(
    () => frames.filter((frame) => selectedFrameIds.includes(frame.id)),
    [frames, selectedFrameIds],
  );
  const selectedDrawing = useMemo(
    () => drawings.find((drawing) => drawing.id === selectedDrawingId) ?? null,
    [drawings, selectedDrawingId],
  );
  const selectedDrawings = useMemo(
    () => drawings.filter((drawing) => selectedDrawingIds.includes(drawing.id)),
    [drawings, selectedDrawingIds],
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
  const lastDrawing = drawings[drawings.length - 1] ?? null;
  const activeDrawColor = selectedDrawing?.color ?? drawColor;
  const hasSelection = selectedFrameIds.length > 0 || selectedDrawingIds.length > 0;
  const canvasSelectionSummary = useMemo(
    () => buildCanvasSelectionSummary(selectedFrames, selectedDrawings),
    [selectedDrawings, selectedFrames],
  );

  useEffect(() => {
    if (hydratedProjectRef.current === projectId) return;
    hydratedProjectRef.current = projectId;
    const nextState = normalizeBuilderCanvasState(initialState);
    setFrames(nextState.frames ?? []);
    setDeletedFrames(nextState.deletedFrames ?? []);
    setDrawings(nextState.drawings ?? []);
    setThemeId(nextState.themeId ?? BUILDER_CANVAS_THEMES[0].id);
    setDrawColor(
      nextState.drawColor ?? parseBuilderCanvasThemeColors(getBuilderCanvasTheme(nextState.themeId).style).primary,
    );
    setSelectedFrameId(nextState.frames?.[0]?.id ?? null);
    setSelectedFrameIds(nextState.frames?.[0]?.id ? [nextState.frames[0].id] : []);
    setSelectedDrawingId(null);
    setSelectedDrawingIds([]);
    setHistoryTab(nextState.deletedFrames?.length ? 'deleted' : 'versions');
  }, [initialState, projectId]);

  useEffect(() => {
    if (selectedDrawingId && !drawings.some((drawing) => drawing.id === selectedDrawingId)) {
      setSelectedDrawingId(null);
    }
  }, [drawings, selectedDrawingId]);

  useEffect(() => {
    setSelectedFrameIds((current) => current.filter((id) => frames.some((frame) => frame.id === id)));
    if (selectedFrameId && !frames.some((frame) => frame.id === selectedFrameId)) {
      setSelectedFrameId(null);
    }
  }, [frames, selectedFrameId]);

  useEffect(() => {
    setSelectedDrawingIds((current) => current.filter((id) => drawings.some((drawing) => drawing.id === id)));
  }, [drawings]);

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
          drawings,
          drawColor,
        }),
      );
    }, 350);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [deletedFrames, drawings, drawColor, frames, persistState, themeId]);

  const updateFrame = useCallback((frameId: string, patch: Partial<BuilderCanvasFrame>) => {
    setFrames((current) =>
      current.map((frame) =>
        frame.id === frameId ? normalizeBuilderCanvasFrame({ ...frame, ...patch, updatedAt: Date.now() }) : frame,
      ),
    );
  }, []);

  const updateDrawing = useCallback(
    (drawingId: string, updater: (drawing: BuilderCanvasDrawing) => BuilderCanvasDrawing) => {
      setDrawings((current) => current.map((drawing) => (drawing.id === drawingId ? updater(drawing) : drawing)));
    },
    [],
  );

  const clearCanvasSelection = useCallback(() => {
    setSelectedFrameIds([]);
    setSelectedDrawingIds([]);
    setSelectedFrameId(null);
    setSelectedDrawingId(null);
  }, []);

  const selectCanvasItems = useCallback(
    ({
      frameIds = [],
      drawingIds = [],
      primaryFrameId = null,
      primaryDrawingId = null,
    }: {
      frameIds?: string[];
      drawingIds?: string[];
      primaryFrameId?: string | null;
      primaryDrawingId?: string | null;
    }) => {
      const nextFrameIds = Array.from(new Set(frameIds));
      const nextDrawingIds = Array.from(new Set(drawingIds));
      setSelectedFrameIds(nextFrameIds);
      setSelectedDrawingIds(nextDrawingIds);
      setSelectedFrameId(primaryFrameId ?? nextFrameIds[nextFrameIds.length - 1] ?? null);
      setSelectedDrawingId(primaryDrawingId ?? nextDrawingIds[nextDrawingIds.length - 1] ?? null);
    },
    [],
  );

  const selectAllCanvasItems = useCallback(() => {
    selectCanvasItems({
      frameIds: frames.map((frame) => frame.id),
      drawingIds: drawings.map((drawing) => drawing.id),
      primaryFrameId: frames[0]?.id ?? null,
      primaryDrawingId: frames.length ? null : (drawings[0]?.id ?? null),
    });
  }, [drawings, frames, selectCanvasItems]);

  const deleteSelectedItems = useCallback(() => {
    if (selectedFrameIds.length > 0) {
      const removedFrames = frames.filter((frame) => selectedFrameIds.includes(frame.id));
      if (removedFrames.length > 0) {
        setDeletedFrames((current) => [
          ...removedFrames.map((frame) => createBuilderCanvasDeletedFrame(frame)),
          ...current,
        ]);
        setFrames((current) => current.filter((frame) => !selectedFrameIds.includes(frame.id)));
      }
    }

    if (selectedDrawingIds.length > 0) {
      setDrawings((current) => current.filter((drawing) => !selectedDrawingIds.includes(drawing.id)));
    }

    clearCanvasSelection();
    setHistoryTab(selectedFrameIds.length > 0 ? 'deleted' : historyTab);
    if (selectedFrameIds.length > 0) {
      setIsHistoryOpen(true);
    }
  }, [clearCanvasSelection, frames, historyTab, selectedDrawingIds, selectedFrameIds]);

  const applyColorChoice = useCallback(
    (color: string) => {
      setDrawColor(color);
      if (selectedDrawingIds.length === 0) return;
      setDrawings((current) =>
        current.map((drawing) =>
          selectedDrawingIds.includes(drawing.id) ? applyDrawingColor(drawing, color) : drawing,
        ),
      );
    },
    [selectedDrawingIds],
  );

  const openCanvasContextMenu = useCallback(
    (event: { clientX: number; clientY: number }, scope: 'canvas' | 'selection') => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      setContextMenu({
        x: clamp(event.clientX - rect.left, 12, Math.max(rect.width - 220, 12)),
        y: clamp(event.clientY - rect.top, 12, Math.max(rect.height - 260, 12)),
        scope,
      });
    },
    [],
  );

  const copySelectedItems = useCallback(() => {
    const items: CanvasClipboardEntry[] = [
      ...selectedFrames.map((frame) => ({
        kind: 'frame' as const,
        frame: normalizeBuilderCanvasFrame(JSON.parse(JSON.stringify(frame)) as BuilderCanvasFrame),
      })),
      ...selectedDrawings.map((drawing) => ({
        kind: 'drawing' as const,
        drawing: normalizeBuilderCanvasDrawing(JSON.parse(JSON.stringify(drawing)) as BuilderCanvasDrawing),
      })),
    ];

    if (items.length === 0) return;
    setClipboardItems(items);
    setContextMenu(null);
  }, [selectedDrawings, selectedFrames]);

  const pasteClipboardItems = useCallback(() => {
    if (clipboardItems.length === 0) return;

    const createdFrames: BuilderCanvasFrame[] = [];
    const createdDrawings: BuilderCanvasDrawing[] = [];

    clipboardItems.forEach((entry, index) => {
      const offset = 32 + index * 10;
      if (entry.kind === 'frame') {
        createdFrames.push(
          createCanvasFrame(
            {
              title: `${entry.frame.title} Copy`,
              kind: entry.frame.kind,
              source: entry.frame.source,
              x: entry.frame.x + offset,
              y: entry.frame.y + offset,
              width: entry.frame.width,
              height: entry.frame.height,
              prompt: entry.frame.lastPrompt ?? null,
              themeId,
              versionOrigin: 'duplicate',
            },
            frames.length + createdFrames.length,
          ),
        );
      } else {
        createdDrawings.push(duplicateCanvasDrawing(entry.drawing, offset));
      }
    });

    if (createdFrames.length > 0) {
      setFrames((current) => [...current, ...createdFrames]);
    }

    if (createdDrawings.length > 0) {
      setDrawings((current) => [...current, ...createdDrawings]);
    }

    selectCanvasItems({
      frameIds: createdFrames.map((frame) => frame.id),
      drawingIds: createdDrawings.map((drawing) => drawing.id),
      primaryFrameId: createdFrames[0]?.id ?? null,
      primaryDrawingId: createdFrames.length > 0 ? null : (createdDrawings[0]?.id ?? null),
    });
    setContextMenu(null);
  }, [clipboardItems, frames.length, selectCanvasItems, themeId]);

  const cutSelectedItems = useCallback(() => {
    copySelectedItems();
    deleteSelectedItems();
  }, [copySelectedItems, deleteSelectedItems]);

  const duplicateSelectedItems = useCallback(() => {
    const createdFrames: BuilderCanvasFrame[] = selectedFrames.map((frame, index) =>
      createCanvasFrame(
        {
          title: `${frame.title} Copy`,
          kind: frame.kind,
          source: frame.source,
          x: frame.x + 32 + index * 10,
          y: frame.y + 32 + index * 10,
          width: frame.width,
          height: frame.height,
          prompt: frame.lastPrompt ?? null,
          themeId,
          versionOrigin: 'duplicate',
        },
        frames.length + index,
      ),
    );
    const createdDrawings = selectedDrawings.map((drawing, index) => duplicateCanvasDrawing(drawing, 32 + index * 10));

    if (createdFrames.length === 0 && createdDrawings.length === 0) return;

    if (createdFrames.length > 0) {
      setFrames((current) => [...current, ...createdFrames]);
    }
    if (createdDrawings.length > 0) {
      setDrawings((current) => [...current, ...createdDrawings]);
    }

    selectCanvasItems({
      frameIds: createdFrames.map((frame) => frame.id),
      drawingIds: createdDrawings.map((drawing) => drawing.id),
      primaryFrameId: createdFrames[0]?.id ?? null,
      primaryDrawingId: createdFrames.length > 0 ? null : (createdDrawings[0]?.id ?? null),
    });
    setContextMenu(null);
  }, [frames.length, selectedDrawings, selectedFrames, selectCanvasItems, themeId]);

  const sendSelectionToAi = useCallback(() => {
    if (!hasSelection) return;
    setCanvasPrompt((current) => current.trim() || 'Create a new screen or variation using the selected canvas items.');
    setIsPromptOpen(true);
    setContextMenu(null);
  }, [hasSelection]);

  const selectFrame = useCallback(
    (frameId: string, additive = false) => {
      if (!additive) {
        selectCanvasItems({
          frameIds: [frameId],
          drawingIds: [],
          primaryFrameId: frameId,
          primaryDrawingId: null,
        });
        return;
      }

      const exists = selectedFrameIds.includes(frameId);
      const nextFrameIds = exists ? selectedFrameIds.filter((id) => id !== frameId) : [...selectedFrameIds, frameId];
      selectCanvasItems({
        frameIds: nextFrameIds,
        drawingIds: selectedDrawingIds,
        primaryFrameId: nextFrameIds[nextFrameIds.length - 1] ?? null,
        primaryDrawingId: selectedDrawingIds[selectedDrawingIds.length - 1] ?? null,
      });
    },
    [selectCanvasItems, selectedDrawingIds, selectedFrameIds],
  );

  const selectDrawing = useCallback(
    (drawingId: string, additive = false) => {
      if (!additive) {
        selectCanvasItems({
          frameIds: [],
          drawingIds: [drawingId],
          primaryFrameId: null,
          primaryDrawingId: drawingId,
        });
        return;
      }

      const exists = selectedDrawingIds.includes(drawingId);
      const nextDrawingIds = exists
        ? selectedDrawingIds.filter((id) => id !== drawingId)
        : [...selectedDrawingIds, drawingId];
      selectCanvasItems({
        frameIds: selectedFrameIds,
        drawingIds: nextDrawingIds,
        primaryFrameId: selectedFrameIds[selectedFrameIds.length - 1] ?? null,
        primaryDrawingId: nextDrawingIds[nextDrawingIds.length - 1] ?? null,
      });
    },
    [selectCanvasItems, selectedDrawingIds, selectedFrameIds],
  );

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
    selectCanvasItems({
      frameIds: [nextFrame.id],
      drawingIds: [],
      primaryFrameId: nextFrame.id,
      primaryDrawingId: null,
    });
    setHistoryTab('versions');
  }, [frames.length, livePreviewUrl, selectCanvasItems]);

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
    selectCanvasItems({
      frameIds: [nextFrame.id],
      drawingIds: [],
      primaryFrameId: nextFrame.id,
      primaryDrawingId: null,
    });
    setHistoryTab('versions');
  }, [frames.length, selectedFileContent, selectedFilePath, selectCanvasItems, themeId]);

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
      selectCanvasItems({
        frameIds: [nextFrame.id],
        drawingIds: [],
        primaryFrameId: nextFrame.id,
        primaryDrawingId: null,
      });
      setHistoryTab('versions');
    },
    [frames, selectCanvasItems, themeId],
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
      clearCanvasSelection();
      setHistoryTab('deleted');
      setIsHistoryOpen(true);
    },
    [clearCanvasSelection, frames],
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
      selectCanvasItems({
        frameIds: [restoredFrame.id],
        drawingIds: [],
        primaryFrameId: restoredFrame.id,
        primaryDrawingId: null,
      });
      setHistoryTab('versions');
      setIsHistoryOpen(true);
    },
    [deletedFrames, selectCanvasItems],
  );

  const switchVersion = useCallback(
    (frameId: string, versionId: string) => {
      setFrames((current) =>
        current.map((frame) => (frame.id === frameId ? applyBuilderCanvasFrameVersion(frame, versionId) : frame)),
      );
      selectCanvasItems({
        frameIds: [frameId],
        drawingIds: [],
        primaryFrameId: frameId,
        primaryDrawingId: null,
      });
    },
    [selectCanvasItems],
  );

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
            selectedCanvasContext: canvasSelectionSummary || null,
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
          selectCanvasItems({
            frameIds: [targetFrame.id],
            drawingIds: [],
            primaryFrameId: targetFrame.id,
            primaryDrawingId: null,
          });
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
          selectCanvasItems({
            frameIds: [nextFrame.id],
            drawingIds: [],
            primaryFrameId: nextFrame.id,
            primaryDrawingId: null,
          });
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
    [
      canvasSelectionSummary,
      frames,
      generationState,
      projectId,
      selectCanvasItems,
      selectedFileContent,
      selectedFilePath,
      themeId,
    ],
  );

  const commitDrawingDraft = useCallback(
    (draft: DrawingDraft | null) => {
      if (!draft) return;

      let nextDrawing: BuilderCanvasDrawing | null = null;

      if (draft.kind === 'shape') {
        nextDrawing = buildShapeDrawing(draft.shape, draft.start, draft.current, drawColor);
      } else if (draft.kind === 'arrow') {
        nextDrawing = buildArrowDrawing(draft.arrow, draft.start, draft.current, drawColor);
      } else {
        nextDrawing = buildPathDrawing(draft.points, drawColor);
      }

      if (nextDrawing) {
        setDrawings((current) => [...current, nextDrawing]);
        selectCanvasItems({
          frameIds: [],
          drawingIds: [nextDrawing.id],
          primaryFrameId: null,
          primaryDrawingId: nextDrawing.id,
        });
      }
    },
    [drawColor, selectCanvasItems],
  );

  const undoLastDrawing = useCallback(() => {
    setDrawings((current) => current.slice(0, -1));
  }, []);

  const beginDrawingMove = useCallback(
    (
      drawing: BuilderCanvasDrawing,
      event: ReactPointerEvent<SVGElement> | ReactPointerEvent<HTMLDivElement>,
      options?: { endpoint?: 'start' | 'end' },
    ) => {
      if (!boardRef.current || toolMode !== 'select') return;

      event.stopPropagation();
      event.preventDefault();

      const point = getCanvasPoint(event, boardRef.current.getBoundingClientRect(), {
        ...transformOffset,
        scale: currentScale,
      });

      if (!event.shiftKey) {
        selectDrawing(drawing.id, false);
      } else {
        selectDrawing(drawing.id, true);
      }
      setContextMenu(null);

      if (drawing.kind === 'arrow' && options?.endpoint) {
        drawingInteractionRef.current = {
          kind: 'arrow-endpoint',
          drawingId: drawing.id,
          endpoint: options.endpoint,
          snapshot: drawing,
        };
        return;
      }

      drawingInteractionRef.current = {
        kind: 'move',
        drawingId: drawing.id,
        startPoint: point,
        snapshot: drawing,
      };
    },
    [currentScale, selectDrawing, toolMode, transformOffset],
  );

  const handleBoardPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!boardRef.current) return;
      if (toolMode === 'select' || toolMode === 'hand') return;
      if ((event.target as HTMLElement).closest('.builder-canvas-frame-root')) return;

      const nextPoint = getCanvasPoint(event, boardRef.current.getBoundingClientRect(), {
        ...transformOffset,
        scale: currentScale,
      });

      clearCanvasSelection();
      setContextMenu(null);

      if (toolMode === 'shape') {
        setDrawingDraft({
          kind: 'shape',
          shape: activeShapeKind,
          start: nextPoint,
          current: nextPoint,
        });
      } else if (toolMode === 'arrow') {
        setDrawingDraft({
          kind: 'arrow',
          arrow: activeArrowKind,
          start: nextPoint,
          current: nextPoint,
        });
      } else if (toolMode === 'pencil') {
        setDrawingDraft({
          kind: 'path',
          points: [nextPoint],
        });
      }
    },
    [activeArrowKind, activeShapeKind, clearCanvasSelection, currentScale, toolMode, transformOffset],
  );

  const handleBoardPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drawingDraft || !boardRef.current) return;

      const nextPoint = getCanvasPoint(event, boardRef.current.getBoundingClientRect(), {
        ...transformOffset,
        scale: currentScale,
      });

      setDrawingDraft((current) => {
        if (!current) return current;
        if (current.kind === 'path') {
          const lastPoint = current.points[current.points.length - 1];
          if (!lastPoint || Math.hypot(lastPoint.x - nextPoint.x, lastPoint.y - nextPoint.y) < 1.5) {
            return current;
          }
          return {
            ...current,
            points: [...current.points, nextPoint],
          };
        }

        return {
          ...current,
          current: nextPoint,
        };
      });
    },
    [currentScale, drawingDraft, transformOffset],
  );

  const handleBoardPointerUp = useCallback(() => {
    commitDrawingDraft(drawingDraft);
    setDrawingDraft(null);
  }, [commitDrawingDraft, drawingDraft]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = drawingInteractionRef.current;
      if (!interaction || !boardRef.current) return;

      const point = getCanvasPoint(event, boardRef.current.getBoundingClientRect(), {
        ...transformOffset,
        scale: currentScale,
      });

      if (interaction.kind === 'move') {
        const deltaX = point.x - interaction.startPoint.x;
        const deltaY = point.y - interaction.startPoint.y;
        updateDrawing(interaction.drawingId, () => translateDrawing(interaction.snapshot, deltaX, deltaY));
        return;
      }

      updateDrawing(interaction.drawingId, (drawing) => {
        if (drawing.kind !== 'arrow') return drawing;
        return updateArrowDrawingEndpoint(interaction.snapshot, interaction.endpoint, point);
      });
    };

    const handlePointerUp = () => {
      drawingInteractionRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [currentScale, transformOffset, updateDrawing]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditingField =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable === true;

      if (event.key === 'Escape') {
        setDrawingDraft(null);
        drawingInteractionRef.current = null;
        clearCanvasSelection();
        setContextMenu(null);
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && !isEditingField) {
        event.preventDefault();
        selectAllCanvasItems();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && !isEditingField) {
        event.preventDefault();
        copySelectedItems();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x' && !isEditingField) {
        event.preventDefault();
        cutSelectedItems();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && !isEditingField) {
        event.preventDefault();
        pasteClipboardItems();
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && !isEditingField) {
        if (hasSelection) {
          event.preventDefault();
          deleteSelectedItems();
          return;
        }

        if (lastDrawing) {
          event.preventDefault();
          undoLastDrawing();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    clearCanvasSelection,
    copySelectedItems,
    cutSelectedItems,
    deleteSelectedItems,
    hasSelection,
    lastDrawing,
    pasteClipboardItems,
    selectAllCanvasItems,
    undoLastDrawing,
  ]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!contextMenuRef.current) return;
      if (contextMenuRef.current.contains(event.target as Node)) return;
      setContextMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-[#ececea] dark:bg-[#242423]">
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

      {toolMode === 'pencil' || (toolMode === 'select' && selectedDrawing) ? (
        <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-black/10 bg-white/94 px-1.5 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.14)] backdrop-blur dark:border-white/10 dark:bg-[#111318]/94">
          <div className="flex flex-col items-center gap-1.5">
            {DEFAULT_DRAW_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyColorChoice(color)}
                className={cn(
                  'size-4 rounded-full border transition',
                  activeDrawColor === color
                    ? 'border-black/80 ring-2 ring-black/10 dark:border-white dark:ring-white/15'
                    : 'border-black/8 dark:border-white/10',
                )}
                style={{ background: color }}
                title={color}
              />
            ))}
          </div>
        </div>
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
          setTransformOffset({
            x: state.positionX,
            y: state.positionY,
          });
        }}
      >
        {({ zoomIn, zoomOut }) => (
          <>
            <div
              ref={boardRef}
              className={cn(
                'absolute inset-0 bg-[#ececea] dark:bg-[#242423]',
                toolMode === 'hand' && 'cursor-grab active:cursor-grabbing',
                (toolMode === 'shape' || toolMode === 'arrow' || toolMode === 'pencil') && 'cursor-crosshair',
              )}
              style={{
                backgroundImage: `radial-gradient(circle, ${themeColors.primary} 1px, transparent 1px)`,
                backgroundSize: '20px 20px',
              }}
              onPointerDown={handleBoardPointerDown}
              onPointerMove={handleBoardPointerMove}
              onPointerUp={handleBoardPointerUp}
              onPointerLeave={handleBoardPointerUp}
              onContextMenu={(event) => {
                event.preventDefault();
                openCanvasContextMenu(event, hasSelection ? 'selection' : 'canvas');
              }}
              onClick={() => {
                if (toolMode === 'select') {
                  clearCanvasSelection();
                }
                setContextMenu(null);
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
                    const isPrimarySelected = selectedFrameId === frame.id;
                    const isSelected = selectedFrameIds.includes(frame.id);
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
                        disableDragging={toolMode !== 'select'}
                        enableResizing={toolMode === 'select' && isPrimarySelected}
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
                          'builder-canvas-frame-root group rounded-[32px]',
                          isSelected && 'ring-4 ring-sky-400/50 ring-offset-2 ring-offset-transparent',
                          toolMode === 'select'
                            ? 'cursor-move'
                            : toolMode === 'hand'
                              ? 'cursor-grab active:cursor-grabbing'
                              : 'cursor-default',
                        )}
                        onClick={(event: ReactMouseEvent) => {
                          event.stopPropagation();
                          if (toolMode === 'select') {
                            selectFrame(frame.id, event.shiftKey);
                            setHistoryTab('versions');
                          }
                          setContextMenu(null);
                        }}
                        onContextMenu={(event: ReactMouseEvent) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!selectedFrameIds.includes(frame.id)) {
                            selectFrame(frame.id, false);
                          }
                          openCanvasContextMenu(event, 'selection');
                        }}
                      >
                        {isPrimarySelected ? (
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

                  <svg className="absolute inset-0 h-full w-full overflow-visible" style={{ pointerEvents: 'none' }}>
                    <defs>
                      <marker
                        id="canvas-arrow-head-end"
                        markerWidth="8"
                        markerHeight="8"
                        refX="6"
                        refY="4"
                        orient="auto"
                      >
                        <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
                      </marker>
                      <marker
                        id="canvas-arrow-head-start"
                        markerWidth="8"
                        markerHeight="8"
                        refX="2"
                        refY="4"
                        orient="auto"
                      >
                        <path d="M8,0 L0,4 L8,8 z" fill="currentColor" />
                      </marker>
                    </defs>

                    {drawings.map((drawing) => {
                      const isSelected = selectedDrawingIds.includes(drawing.id);

                      if (drawing.kind === 'shape') {
                        return (
                          <g
                            key={drawing.id}
                            color={drawing.color}
                            style={{
                              cursor: toolMode === 'select' ? 'move' : 'default',
                              pointerEvents: toolMode === 'select' ? 'auto' : 'none',
                            }}
                            onPointerDown={(event) => beginDrawingMove(drawing, event)}
                            onClick={(event) => event.stopPropagation()}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (!selectedDrawingIds.includes(drawing.id)) {
                                selectDrawing(drawing.id, false);
                              }
                              openCanvasContextMenu(event, 'selection');
                            }}
                          >
                            {isSelected ? (
                              <rect
                                x={drawing.x - 8}
                                y={drawing.y - 8}
                                width={drawing.width + 16}
                                height={drawing.height + 16}
                                rx={22}
                                fill="rgba(14,165,233,0.10)"
                                stroke="rgba(14,165,233,0.45)"
                                strokeDasharray="6 5"
                              />
                            ) : null}
                            {renderShapeDrawing(drawing)}
                          </g>
                        );
                      }

                      if (drawing.kind === 'arrow') {
                        const bounds = getDrawingBounds(drawing);
                        return (
                          <g key={drawing.id} color={drawing.color} onClick={(event) => event.stopPropagation()}>
                            {isSelected ? (
                              <rect
                                x={bounds.x}
                                y={bounds.y}
                                width={bounds.width}
                                height={bounds.height}
                                rx={20}
                                fill="rgba(14,165,233,0.08)"
                                stroke="rgba(14,165,233,0.42)"
                                strokeDasharray="6 5"
                              />
                            ) : null}
                            {isSelected ? (
                              <path
                                d={getArrowPath(drawing)}
                                fill="none"
                                stroke="rgba(14,165,233,0.32)"
                                strokeWidth={drawing.strokeWidth + 10}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            ) : null}
                            <path
                              d={getArrowPath(drawing)}
                              fill="none"
                              stroke="transparent"
                              strokeWidth={Math.max(drawing.strokeWidth + 18, 18)}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{
                                cursor: toolMode === 'select' ? 'move' : 'default',
                                pointerEvents: toolMode === 'select' ? 'auto' : 'none',
                              }}
                              onPointerDown={(event) => beginDrawingMove(drawing, event)}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (!selectedDrawingIds.includes(drawing.id)) {
                                  selectDrawing(drawing.id, false);
                                }
                                openCanvasContextMenu(event, 'selection');
                              }}
                            />
                            {renderArrowDrawing(drawing)}
                            {isSelected && toolMode === 'select' ? (
                              <>
                                <circle
                                  cx={drawing.start.x}
                                  cy={drawing.start.y}
                                  r={7}
                                  fill="#ffffff"
                                  stroke={themeColors.primary}
                                  strokeWidth={2}
                                  style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                  onPointerDown={(event) =>
                                    beginDrawingMove(drawing, event, {
                                      endpoint: 'start',
                                    })
                                  }
                                />
                                <circle
                                  cx={drawing.end.x}
                                  cy={drawing.end.y}
                                  r={7}
                                  fill="#ffffff"
                                  stroke={themeColors.primary}
                                  strokeWidth={2}
                                  style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                  onPointerDown={(event) =>
                                    beginDrawingMove(drawing, event, {
                                      endpoint: 'end',
                                    })
                                  }
                                />
                              </>
                            ) : null}
                          </g>
                        );
                      }

                      return (
                        <g
                          key={drawing.id}
                          color={drawing.color}
                          style={{
                            cursor: toolMode === 'select' ? 'move' : 'default',
                            pointerEvents: toolMode === 'select' ? 'auto' : 'none',
                          }}
                          onPointerDown={(event) => beginDrawingMove(drawing, event)}
                          onClick={(event) => event.stopPropagation()}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!selectedDrawingIds.includes(drawing.id)) {
                              selectDrawing(drawing.id, false);
                            }
                            openCanvasContextMenu(event, 'selection');
                          }}
                        >
                          {isSelected ? (
                            <path
                              d={pathFromPoints(drawing.points)}
                              fill="none"
                              stroke="rgba(14,165,233,0.34)"
                              strokeWidth={drawing.strokeWidth + 8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ) : null}
                          <path
                            d={pathFromPoints(drawing.points)}
                            fill="none"
                            stroke={drawing.color}
                            strokeWidth={drawing.strokeWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                      );
                    })}

                    {drawingDraft ? (
                      <g color={drawColor}>
                        {drawingDraft.kind === 'shape' ? (
                          (() => {
                            const preview = buildShapeDrawing(
                              drawingDraft.shape,
                              drawingDraft.start,
                              drawingDraft.current,
                              drawColor,
                            );
                            return preview ? renderShapeDrawing(preview) : null;
                          })()
                        ) : drawingDraft.kind === 'arrow' ? (
                          (() => {
                            const preview = buildArrowDrawing(
                              drawingDraft.arrow,
                              drawingDraft.start,
                              drawingDraft.current,
                              drawColor,
                            );
                            return preview ? renderArrowDrawing(preview) : null;
                          })()
                        ) : (
                          <path
                            d={pathFromPoints(drawingDraft.points)}
                            fill="none"
                            stroke={drawColor}
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </g>
                    ) : null}
                  </svg>

                  {toolMode === 'select' && selectedDrawing?.kind === 'shape' ? (
                    <Rnd
                      key={selectedDrawing.id}
                      position={{ x: selectedDrawing.x, y: selectedDrawing.y }}
                      size={{ width: selectedDrawing.width, height: selectedDrawing.height }}
                      minWidth={24}
                      minHeight={24}
                      lockAspectRatio={selectedDrawing.shape === 'square' || selectedDrawing.shape === 'circle'}
                      scale={currentScale}
                      enableResizing={{
                        top: true,
                        right: true,
                        bottom: true,
                        left: true,
                        topRight: true,
                        bottomRight: true,
                        bottomLeft: true,
                        topLeft: true,
                      }}
                      resizeHandleStyles={{
                        topLeft: {
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          border: '2px solid white',
                          background: themeColors.primary,
                          left: -6,
                          top: -6,
                        },
                        topRight: {
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          border: '2px solid white',
                          background: themeColors.primary,
                          right: -6,
                          top: -6,
                        },
                        bottomLeft: {
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          border: '2px solid white',
                          background: themeColors.primary,
                          left: -6,
                          bottom: -6,
                        },
                        bottomRight: {
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          border: '2px solid white',
                          background: themeColors.primary,
                          right: -6,
                          bottom: -6,
                        },
                      }}
                      onDragStart={() => {
                        selectDrawing(selectedDrawing.id, false);
                      }}
                      onDragStop={(_, data) =>
                        updateDrawing(selectedDrawing.id, (drawing) => {
                          if (drawing.kind !== 'shape') return drawing;
                          return updateShapeDrawingBounds(drawing, {
                            x: data.x,
                            y: data.y,
                            width: drawing.width,
                            height: drawing.height,
                          });
                        })
                      }
                      onResizeStop={(_, __, ref, ___, position) =>
                        updateDrawing(selectedDrawing.id, (drawing) => {
                          if (drawing.kind !== 'shape') return drawing;
                          return updateShapeDrawingBounds(drawing, {
                            x: position.x,
                            y: position.y,
                            width: Number.parseFloat(ref.style.width),
                            height: Number.parseFloat(ref.style.height),
                          });
                        })
                      }
                      className="z-20"
                    >
                      <div
                        className="h-full w-full rounded-[22px] border border-sky-400/90 bg-sky-400/5 shadow-[0_0_0_1px_rgba(255,255,255,0.45)]"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openCanvasContextMenu(event, 'selection');
                        }}
                      />
                    </Rnd>
                  ) : null}
                </div>
              </TransformComponent>
            </div>

            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/10 bg-black/92 px-2 py-0.5 text-white shadow-lg">
              <Button
                size="icon-xs"
                variant="ghost"
                className={cn(
                  'rounded-full text-white hover:bg-white/10 hover:text-white',
                  toolMode === 'select' && 'bg-white/12',
                )}
                onClick={() => setToolMode('select')}
              >
                <MousePointer2 className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                className={cn(
                  'rounded-full text-white hover:bg-white/10 hover:text-white',
                  toolMode === 'hand' && 'bg-white/12',
                )}
                onClick={() => setToolMode('hand')}
              >
                <Hand className="size-3" />
              </Button>
              <div className="h-3.5 w-px bg-white/20" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className={cn(
                      'rounded-full text-white hover:bg-white/10 hover:text-white',
                      toolMode === 'shape' && 'bg-white/12',
                    )}
                  >
                    <Square className="size-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" className="w-[220px] rounded-[18px] p-2">
                  <div className="mb-2 text-[11px] font-medium text-black/70 dark:text-white/74">Shapes</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SHAPE_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.kind}
                          type="button"
                          onClick={() => {
                            setActiveShapeKind(option.kind);
                            setToolMode('shape');
                          }}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border px-2 py-2 text-left text-[11px] transition',
                            activeShapeKind === option.kind && toolMode === 'shape'
                              ? 'border-black/70 bg-black/[0.04] dark:border-white/70 dark:bg-white/[0.05]'
                              : 'border-black/8 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]',
                          )}
                        >
                          <Icon className="size-3.5" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className={cn(
                      'rounded-full text-white hover:bg-white/10 hover:text-white',
                      toolMode === 'arrow' && 'bg-white/12',
                    )}
                  >
                    <ArrowRight className="size-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" className="w-[220px] rounded-[18px] p-2">
                  <div className="mb-2 text-[11px] font-medium text-black/70 dark:text-white/74">Arrows</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ARROW_OPTIONS.map((option) => (
                      <button
                        key={option.kind}
                        type="button"
                        onClick={() => {
                          setActiveArrowKind(option.kind);
                          setToolMode('arrow');
                        }}
                        className={cn(
                          'rounded-xl border px-2 py-2 text-left text-[11px] transition',
                          activeArrowKind === option.kind && toolMode === 'arrow'
                            ? 'border-black/70 bg-black/[0.04] dark:border-white/70 dark:bg-white/[0.05]'
                            : 'border-black/8 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]',
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                size="icon-xs"
                variant="ghost"
                className={cn(
                  'rounded-full text-white hover:bg-white/10 hover:text-white',
                  toolMode === 'pencil' && 'bg-white/12',
                )}
                onClick={() => setToolMode('pencil')}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                className="rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={undoLastDrawing}
                disabled={!lastDrawing}
                title="Undo last drawing"
              >
                <Undo2 className="size-3" />
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

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="absolute z-40 w-[220px] rounded-[20px] border border-black/10 bg-white/96 p-1.5 shadow-[0_24px_60px_rgba(15,23,42,0.22)] backdrop-blur dark:border-white/10 dark:bg-[#111318]/96"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="px-2 pb-1.5 pt-1">
            <div className="text-[11px] font-semibold text-black/84 dark:text-white/88">
              {hasSelection
                ? `${selectedFrameIds.length + selectedDrawingIds.length} item${selectedFrameIds.length + selectedDrawingIds.length === 1 ? '' : 's'} selected`
                : 'Canvas actions'}
            </div>
            <div className="text-[10px] text-black/48 dark:text-white/38">
              {hasSelection ? 'Selection-aware canvas tools' : 'Right-click shortcuts for the board'}
            </div>
          </div>

          <div className="space-y-0.5">
            {clipboardItems.length > 0 ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[12px] text-black/80 transition hover:bg-black/[0.04] dark:text-white/84 dark:hover:bg-white/[0.06]"
                onClick={pasteClipboardItems}
              >
                <ClipboardPaste className="size-3.5" />
                Paste
                <span className="ml-auto text-[10px] text-black/40 dark:text-white/34">Ctrl/Cmd+V</span>
              </button>
            ) : null}

            {hasSelection ? (
              <>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[12px] text-black/80 transition hover:bg-black/[0.04] dark:text-white/84 dark:hover:bg-white/[0.06]"
                  onClick={copySelectedItems}
                >
                  <Copy className="size-3.5" />
                  Copy
                  <span className="ml-auto text-[10px] text-black/40 dark:text-white/34">Ctrl/Cmd+C</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[12px] text-black/80 transition hover:bg-black/[0.04] dark:text-white/84 dark:hover:bg-white/[0.06]"
                  onClick={cutSelectedItems}
                >
                  <Scissors className="size-3.5" />
                  Cut
                  <span className="ml-auto text-[10px] text-black/40 dark:text-white/34">Ctrl/Cmd+X</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[12px] text-black/80 transition hover:bg-black/[0.04] dark:text-white/84 dark:hover:bg-white/[0.06]"
                  onClick={duplicateSelectedItems}
                >
                  <Copy className="size-3.5" />
                  Duplicate
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[12px] text-black/80 transition hover:bg-black/[0.04] dark:text-white/84 dark:hover:bg-white/[0.06]"
                  onClick={sendSelectionToAi}
                >
                  <Wand2 className="size-3.5 text-fuchsia-500" />
                  Add To AI
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[12px] text-red-500 transition hover:bg-red-500/10 dark:text-red-300"
                  onClick={deleteSelectedItems}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                  <span className="ml-auto text-[10px] text-red-400/70">Del</span>
                </button>
                <div className="my-1 h-px bg-black/8 dark:bg-white/10" />
              </>
            ) : null}

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[12px] text-black/80 transition hover:bg-black/[0.04] dark:text-white/84 dark:hover:bg-white/[0.06]"
              onClick={() => {
                selectAllCanvasItems();
                setContextMenu(null);
              }}
            >
              <CheckSquare className="size-3.5" />
              Select All
              <span className="ml-auto text-[10px] text-black/40 dark:text-white/34">Ctrl/Cmd+A</span>
            </button>

            {hasSelection ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[12px] text-black/80 transition hover:bg-black/[0.04] dark:text-white/84 dark:hover:bg-white/[0.06]"
                onClick={() => {
                  clearCanvasSelection();
                  setContextMenu(null);
                }}
              >
                <X className="size-3.5" />
                Clear Selection
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

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
