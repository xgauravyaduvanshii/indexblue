export type BuilderCanvasFrameKind = 'preview' | 'html';

export type BuilderCanvasFrameVersionOrigin = 'manual' | 'import' | 'duplicate' | 'ai-create' | 'ai-regenerate';

export type BuilderCanvasFrameVersion = {
  id: string;
  title: string;
  kind: BuilderCanvasFrameKind;
  source: string;
  prompt?: string | null;
  createdAt: number;
  createdBy: BuilderCanvasFrameVersionOrigin;
  themeId?: string | null;
};

export type BuilderCanvasFrame = {
  id: string;
  title: string;
  kind: BuilderCanvasFrameKind;
  source: string;
  route?: string | null;
  width: number;
  height: number;
  x: number;
  y: number;
  createdAt: number;
  updatedAt: number;
  activeVersionId?: string | null;
  versions?: BuilderCanvasFrameVersion[];
  lastPrompt?: string | null;
};

export type BuilderCanvasDeletedFrame = {
  id: string;
  frame: BuilderCanvasFrame;
  deletedAt: number;
  reason?: 'manual' | 'replace';
};

export type BuilderCanvasShapeKind = 'rectangle' | 'square' | 'circle' | 'diamond' | 'triangle';
export type BuilderCanvasArrowKind = 'line' | 'double' | 'dashed' | 'elbow';

export type BuilderCanvasPoint = {
  x: number;
  y: number;
};

type BuilderCanvasDrawingBase = {
  id: string;
  createdAt: number;
  updatedAt: number;
  color: string;
};

export type BuilderCanvasShapeDrawing = BuilderCanvasDrawingBase & {
  kind: 'shape';
  shape: BuilderCanvasShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  strokeWidth: number;
};

export type BuilderCanvasArrowDrawing = BuilderCanvasDrawingBase & {
  kind: 'arrow';
  arrow: BuilderCanvasArrowKind;
  start: BuilderCanvasPoint;
  end: BuilderCanvasPoint;
  strokeWidth: number;
};

export type BuilderCanvasPathDrawing = BuilderCanvasDrawingBase & {
  kind: 'path';
  points: BuilderCanvasPoint[];
  strokeWidth: number;
};

export type BuilderCanvasDrawing = BuilderCanvasShapeDrawing | BuilderCanvasArrowDrawing | BuilderCanvasPathDrawing;

export type BuilderCanvasState = {
  themeId?: string | null;
  frames?: BuilderCanvasFrame[];
  deletedFrames?: BuilderCanvasDeletedFrame[];
  drawings?: BuilderCanvasDrawing[];
  drawColor?: string | null;
};

export type BuilderCanvasTheme = {
  id: string;
  name: string;
  description: string;
  style: string;
};

const BASE_THEME_VARIABLES = `
  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-heading: "Space Grotesk", var(--font-sans);
  --font-serif: "Playfair Display", Georgia, serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08);
  --shadow-lg: 0 18px 40px -20px rgb(0 0 0 / 0.28);
`;

function createCanvasId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const BUILDER_CANVAS_THEMES: BuilderCanvasTheme[] = [
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    description: 'Clean blue product UI with airy neutrals and calm highlights.',
    style: `
      --background: #ffffff;
      --foreground: #111827;
      --card: #ffffff;
      --card-foreground: #111827;
      --primary: #3b82f6;
      --primary-foreground: #ffffff;
      --secondary: #e5e7eb;
      --secondary-foreground: #1f2937;
      --muted: #f3f4f6;
      --muted-foreground: #6b7280;
      --accent: #dbeafe;
      --accent-foreground: #1e293b;
      --border: #e5e7eb;
      --input: #e5e7eb;
      --ring: #3b82f6;
      --radius: 0.85rem;
    `,
  },
  {
    id: 'midnight-drive',
    name: 'Midnight Drive',
    description: 'Dark app chrome with warm signal reds and cinematic contrast.',
    style: `
      --background: #111214;
      --foreground: #f5f7fb;
      --card: #17191d;
      --card-foreground: #f5f7fb;
      --primary: #ff6b6b;
      --primary-foreground: #ffffff;
      --secondary: #23262d;
      --secondary-foreground: #f5f7fb;
      --muted: #23262d;
      --muted-foreground: #9da3b3;
      --accent: #7c3aed;
      --accent-foreground: #ffffff;
      --border: #2f3440;
      --input: #2f3440;
      --ring: #ff6b6b;
      --radius: 1rem;
    `,
  },
  {
    id: 'mint-lilac',
    name: 'Mint Lilac',
    description: 'Soft editorial surfaces with mint foundations and violet accents.',
    style: `
      --background: #f6fbfa;
      --foreground: #1d2230;
      --card: #ffffff;
      --card-foreground: #1d2230;
      --primary: #14b8a6;
      --primary-foreground: #ffffff;
      --secondary: #ecfeff;
      --secondary-foreground: #1d2230;
      --muted: #d9f7f4;
      --muted-foreground: #54706c;
      --accent: #8b5cf6;
      --accent-foreground: #ffffff;
      --border: #d6e8e4;
      --input: #d6e8e4;
      --ring: #14b8a6;
      --radius: 1rem;
    `,
  },
  {
    id: 'citrus-pop',
    name: 'Citrus Pop',
    description: 'Warm launch-page palette with bright orange energy and soft sand.',
    style: `
      --background: #fff8ef;
      --foreground: #2f2418;
      --card: #ffffff;
      --card-foreground: #2f2418;
      --primary: #f97316;
      --primary-foreground: #ffffff;
      --secondary: #fff0d9;
      --secondary-foreground: #2f2418;
      --muted: #ffe1bf;
      --muted-foreground: #7c5b3f;
      --accent: #facc15;
      --accent-foreground: #2f2418;
      --border: #f0d7b8;
      --input: #f0d7b8;
      --ring: #f97316;
      --radius: 0.9rem;
    `,
  },
  {
    id: 'graphite-lime',
    name: 'Graphite Lime',
    description: 'High-contrast builder UI with graphite layers and acid lime accents.',
    style: `
      --background: #0d1010;
      --foreground: #f6faf7;
      --card: #151918;
      --card-foreground: #f6faf7;
      --primary: #bef264;
      --primary-foreground: #13210a;
      --secondary: #1d2322;
      --secondary-foreground: #d7e0db;
      --muted: #202827;
      --muted-foreground: #92a09a;
      --accent: #22d3ee;
      --accent-foreground: #06222a;
      --border: #27302f;
      --input: #27302f;
      --ring: #bef264;
      --radius: 1rem;
    `,
  },
  {
    id: 'rose-studio',
    name: 'Rose Studio',
    description: 'Glossy creative-tool mood with blush neutrals and magenta punch.',
    style: `
      --background: #fff8fb;
      --foreground: #24171d;
      --card: #ffffff;
      --card-foreground: #24171d;
      --primary: #ec4899;
      --primary-foreground: #ffffff;
      --secondary: #fde2ee;
      --secondary-foreground: #24171d;
      --muted: #f7d2e4;
      --muted-foreground: #8a546f;
      --accent: #fb7185;
      --accent-foreground: #ffffff;
      --border: #f2cedc;
      --input: #f2cedc;
      --ring: #ec4899;
      --radius: 1.05rem;
    `,
  },
];

export function getBuilderCanvasTheme(themeId?: string | null) {
  return BUILDER_CANVAS_THEMES.find((theme) => theme.id === themeId) ?? BUILDER_CANVAS_THEMES[0];
}

export function parseBuilderCanvasThemeColors(style: string) {
  const read = (name: string, fallback: string) =>
    style.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim() ?? fallback;

  return {
    background: read('background', '#ffffff'),
    foreground: read('foreground', '#111827'),
    primary: read('primary', '#3b82f6'),
    secondary: read('secondary', '#e5e7eb'),
    accent: read('accent', '#8b5cf6'),
    muted: read('muted', '#f3f4f6'),
    border: read('border', '#e5e7eb'),
  };
}

export function createBuilderCanvasFrameVersion(
  version: Omit<BuilderCanvasFrameVersion, 'id'> & { id?: string | null },
): BuilderCanvasFrameVersion {
  return {
    id: version.id ?? createCanvasId('canvas-version'),
    title: version.title,
    kind: version.kind,
    source: version.source,
    prompt: version.prompt ?? null,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    themeId: version.themeId ?? null,
  };
}

export function normalizeBuilderCanvasFrame(frame: BuilderCanvasFrame): BuilderCanvasFrame {
  const fallbackVersion = createBuilderCanvasFrameVersion({
    id: frame.activeVersionId ?? `canvas-version-${frame.id}-base`,
    title: frame.title,
    kind: frame.kind,
    source: frame.source,
    prompt: frame.lastPrompt ?? null,
    createdAt: frame.updatedAt || frame.createdAt || Date.now(),
    createdBy: 'manual',
    themeId: null,
  });

  const versions = frame.versions?.map((version) => createBuilderCanvasFrameVersion(version)).filter(Boolean) ?? [
    fallbackVersion,
  ];
  const safeVersions = versions.length > 0 ? versions : [fallbackVersion];
  const activeVersion =
    safeVersions.find((version) => version.id === frame.activeVersionId) ?? safeVersions[safeVersions.length - 1];

  return {
    ...frame,
    title: activeVersion.title,
    kind: activeVersion.kind,
    source: activeVersion.source,
    activeVersionId: activeVersion.id,
    versions: safeVersions,
    lastPrompt: frame.lastPrompt ?? activeVersion.prompt ?? null,
  };
}

export function appendBuilderCanvasFrameVersion(
  frame: BuilderCanvasFrame,
  version: Omit<BuilderCanvasFrameVersion, 'id'> & { id?: string | null },
) {
  const nextVersion = createBuilderCanvasFrameVersion(version);

  return normalizeBuilderCanvasFrame({
    ...frame,
    title: nextVersion.title,
    kind: nextVersion.kind,
    source: nextVersion.source,
    updatedAt: version.createdAt,
    activeVersionId: nextVersion.id,
    versions: [...(frame.versions ?? []), nextVersion],
    lastPrompt: nextVersion.prompt ?? frame.lastPrompt ?? null,
  });
}

export function applyBuilderCanvasFrameVersion(frame: BuilderCanvasFrame, versionId: string) {
  const normalized = normalizeBuilderCanvasFrame(frame);
  const nextVersion = normalized.versions?.find((version) => version.id === versionId);
  if (!nextVersion) return normalized;

  return {
    ...normalized,
    title: nextVersion.title,
    kind: nextVersion.kind,
    source: nextVersion.source,
    activeVersionId: nextVersion.id,
    updatedAt: Date.now(),
    lastPrompt: nextVersion.prompt ?? normalized.lastPrompt ?? null,
  };
}

export function createBuilderCanvasDeletedFrame(frame: BuilderCanvasFrame, reason: 'manual' | 'replace' = 'manual') {
  return {
    id: createCanvasId('canvas-trash'),
    frame: normalizeBuilderCanvasFrame(frame),
    deletedAt: Date.now(),
    reason,
  } satisfies BuilderCanvasDeletedFrame;
}

function clampDimension(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function normalizeBuilderCanvasDrawing(drawing: BuilderCanvasDrawing): BuilderCanvasDrawing {
  if (drawing.kind === 'shape') {
    return {
      ...drawing,
      width: clampDimension(drawing.width),
      height: clampDimension(drawing.height),
      strokeWidth: clampDimension(drawing.strokeWidth) || 2,
    };
  }

  if (drawing.kind === 'arrow') {
    return {
      ...drawing,
      strokeWidth: clampDimension(drawing.strokeWidth) || 2,
      start: {
        x: clampDimension(drawing.start.x),
        y: clampDimension(drawing.start.y),
      },
      end: {
        x: clampDimension(drawing.end.x),
        y: clampDimension(drawing.end.y),
      },
    };
  }

  return {
    ...drawing,
    strokeWidth: clampDimension(drawing.strokeWidth) || 2.5,
    points: drawing.points.map((point) => ({
      x: clampDimension(point.x),
      y: clampDimension(point.y),
    })),
  };
}

export function normalizeBuilderCanvasState(state?: BuilderCanvasState | null): BuilderCanvasState {
  return {
    themeId: state?.themeId ?? BUILDER_CANVAS_THEMES[0].id,
    frames: (state?.frames ?? []).map((frame) => normalizeBuilderCanvasFrame(frame)),
    deletedFrames: (state?.deletedFrames ?? []).map((entry) => ({
      ...entry,
      reason: entry.reason ?? 'manual',
      frame: normalizeBuilderCanvasFrame(entry.frame),
    })),
    drawings: (state?.drawings ?? []).map((drawing) => normalizeBuilderCanvasDrawing(drawing)),
    drawColor: state?.drawColor ?? null,
  };
}

export function wrapBuilderCanvasHtml(html: string, title: string, themeStyle?: string, frameId?: string) {
  const finalTheme = themeStyle ?? BUILDER_CANVAS_THEMES[0].style;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Playfair+Display:wght@400;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style type="text/tailwindcss">
    :root {${BASE_THEME_VARIABLES}${finalTheme}}
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; }
    body {
      min-height: 100vh;
      font-family: var(--font-sans);
      background: var(--background);
      color: var(--foreground);
      -webkit-font-smoothing: antialiased;
    }
    #root { width: 100%; min-height: 100vh; }
    * { scrollbar-width: none; -ms-overflow-style: none; }
    *::-webkit-scrollbar { display: none; }
  </style>
</head>
<body>
  <div id="root">
    <div class="relative">${html}</div>
  </div>
  <script>
    (() => {
      const fid = ${JSON.stringify(frameId ?? '')};
      const send = () => {
        const root = document.getElementById('root')?.firstElementChild;
        const height = Math.max(root?.scrollHeight || 0, document.body.scrollHeight, window.innerHeight, 800);
        parent.postMessage({ type: 'BUILDER_CANVAS_FRAME_HEIGHT', frameId: fid, height }, '*');
      };
      setTimeout(send, 80);
      setTimeout(send, 240);
      setTimeout(send, 800);
    })();
  </script>
</body>
</html>`;
}
