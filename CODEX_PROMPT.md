# CODEX PROMPT — Build Stagewise-Like Coding Agent in Indexblue

## CONTEXT

You are working inside the indexblue project located at `/home/ubuntu/bluedark/indexblue`.
This is a **Next.js 16 (App Router, canary)** project using:
- React 19
- TypeScript 6
- Tailwind CSS v4
- Shadcn/UI + Radix UI
- Vercel AI SDK v6 (`ai` package)
- Drizzle ORM + PostgreSQL
- Better Auth (auth system already set up)
- Framer Motion
- Lucide React icons
- pnpm as package manager

There is also a stagewise repo at `/home/ubuntu/bluedark/stagewise` — read its UI code, design tokens, color system, and layout structure from `packages/stage-ui/` and `apps/browser/src/ui/` as visual reference and inspiration. Clone its design, layout, and UX exactly — same dark chrome, same panel layout, same colors, same font sizes, same button styles, same toolbar.

---

## GOAL

Build a **full-screen, stagewise-identical coding agent** at the route:

```
/builder/project/[projectid]
```

When a user visits this route, they see a full-screen IDE-like workspace that looks and feels exactly like stagewise, but runs entirely in the browser (web-compatible, no Electron). The coding environment is powered by **CodeSandbox SDK** (`@codesandbox/sdk`) which handles:
- Real file system (create, read, update, delete files)
- Live preview with real URL in an iframe
- Terminal with real shell (npm install, run scripts, etc.)
- Package installation
- Hot reload preview

The AI coding agent chat is powered by indexblue's existing Vercel AI SDK streaming system.

---

## WHAT TO BUILD — COMPLETE FILE LIST

### 1. Install Required Packages

```bash
pnpm add @codesandbox/sdk @monaco-editor/react react-resizable-panels
```

### 2. Database Schema

**File: `lib/db/builder-schema.ts`**

Add these Drizzle ORM table definitions. Do NOT modify existing tables. Use `pgTable` from `drizzle-orm/pg-core`:

```
Table: builder_projects
  - id: text, primaryKey, default gen_random_uuid()
  - userId: text, notNull (foreign key to users)
  - name: text, notNull
  - description: text
  - sandboxId: text (CodeSandbox sandbox ID)
  - framework: text, default 'react' (react | next | vue | angular | vanilla)
  - previewUrl: text (the CodeSandbox preview URL)
  - createdAt: timestamp, defaultNow
  - updatedAt: timestamp, defaultNow
  - settings: jsonb (ProjectSettings type)

Table: builder_chats
  - id: text, primaryKey, default gen_random_uuid()
  - projectId: text, notNull (FK → builder_projects.id, cascade delete)
  - role: varchar(16), notNull (user | assistant | tool)
  - content: text, notNull
  - toolCalls: jsonb
  - createdAt: timestamp, defaultNow

Type ProjectSettings = {
  defaultModel?: string
  theme?: 'dark' | 'light'
  fontSize?: number
  tabSize?: number
  wordWrap?: boolean
  autoSave?: boolean
}
```

Also add a Drizzle migration file `drizzle/migrations/0001_builder.sql` with the CREATE TABLE statements.

---

### 3. Route Layout — Full Screen, No Navbar

**File: `app/builder/layout.tsx`**

This layout must:
- Skip the main app navbar/sidebar entirely
- Be `100dvh` height, `overflow: hidden`
- Use `metadata` with `title: "Builder — Indexblue"`
- Have a `suppressHydrationWarning` body

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Builder — Indexblue' }

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, height: '100dvh', overflow: 'hidden', background: '#0f0f10' }}>
        {children}
      </body>
    </html>
  )
}
```

> Note: if the existing root layout already wraps html/body, use a different approach — just make the page return a div with fixed positioning that covers the full viewport.

---

### 4. Page Entry Point

**File: `app/builder/project/[projectid]/page.tsx`**

```tsx
import { BuilderWorkspace } from '@/components/builder/builder-workspace'
import { auth } from '@/lib/auth' // existing auth
import { db } from '@/lib/db'    // existing db client
import { builderProjects } from '@/lib/db/builder-schema'
import { eq } from 'drizzle-orm'
import { redirect, notFound } from 'next/navigation'

interface Props {
  params: Promise<{ projectid: string }>
}

export default async function BuilderProjectPage({ params }: Props) {
  const { projectid } = await params
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const [project] = await db
    .select()
    .from(builderProjects)
    .where(eq(builderProjects.id, projectid))
    .limit(1)

  if (!project) notFound()
  if (project.userId !== session.user.id) redirect('/')

  return (
    <BuilderWorkspace
      project={{
        id: project.id,
        name: project.name,
        description: project.description ?? undefined,
        sandboxId: project.sandboxId ?? undefined,
        framework: project.framework ?? 'react',
        previewUrl: project.previewUrl ?? undefined,
      }}
      userId={session.user.id}
    />
  )
}
```

---

### 5. Main Workspace Component

**File: `components/builder/builder-workspace.tsx`**

This is the root client component. Uses `react-resizable-panels` for the resizable layout.

**Layout structure (copy stagewise exactly):**

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR: [logo] [project name] [←][→][⟳] [url bar] [inspect][⚙]│
├──────────┬─────────────────────────────────────┬────────────────┤
│          │                                     │                │
│ SIDEBAR  │     BROWSER PREVIEW (iframe)        │  AGENT CHAT   │
│ (files,  │     with browser chrome on top      │  (streaming   │
│  search, │     CodeSandbox preview URL         │   AI chat)    │
│  git)    │                                     │               │
│          │                                     │               │
│          ├─────────────────────────────────────┤               │
│          │  CODE EDITOR (Monaco)               │               │
│          │  (shown when file opened)           │               │
├──────────┴─────────────────────────────────────┴────────────────┤
│  BOTTOM PANEL: [Console] [Terminal] [Problems] [Output]         │
└─────────────────────────────────────────────────────────────────┘
```

Use `PanelGroup`, `Panel`, `PanelResizeHandle` from `react-resizable-panels`.

State to manage:
- `sandboxClient` — CodeSandbox SDK client instance
- `activeFile` — currently open file path
- `openTabs` — list of open editor tabs
- `consoleEntries` — array of console log entries
- `inspectedElement` — currently inspected DOM element
- `isInspecting` — bool, element inspector mode active
- `bottomTab` — 'console' | 'terminal' | 'problems'
- `sidebarTab` — 'files' | 'search' | 'git'
- `previewUrl` — the live CodeSandbox preview URL
- `browserUrl` — current URL shown in the address bar
- `isSandboxReady` — bool
- `chatMessages` — AI chat messages

On mount:
1. If `project.sandboxId` exists, connect to existing CodeSandbox sandbox via `@codesandbox/sdk`
2. If no sandboxId, create a new sandbox with the appropriate template (react/next/vue/etc.)
3. Save the sandboxId back to DB via `PATCH /api/builder/project/[id]`
4. Get the preview URL from the sandbox
5. Start listening to sandbox file changes and terminal output

The component renders:
- `<BuilderTopbar />` at top
- `<PanelGroup direction="horizontal">` with:
  - `<Panel defaultSize={18} minSize={12}>` → `<BuilderSidebar />`
  - `<PanelResizeHandle />` 
  - `<Panel>` → vertical `<PanelGroup direction="vertical">`:
    - `<Panel defaultSize={60}>` → `<BrowserPreview />`
    - `<PanelResizeHandle />`
    - `<Panel defaultSize={40} minSize={20}>` → `<CodeEditor />`
  - `<PanelResizeHandle />`
  - `<Panel defaultSize={28} minSize={22}>` → `<AgentChat />`
- `<BuilderBottomPanel />` at bottom (fixed height ~220px)

---

### 6. Topbar Component

**File: `components/builder/builder-topbar.tsx`**

Clone stagewise's top chrome bar exactly:

Visual design:
- Background: `#1a1a1c` (stagewise dark chrome)
- Height: `42px`
- Border-bottom: `1px solid #2a2a2d`
- Left section: stagewise-like logo + project name (editable on click)
- Center section: browser nav buttons `[←] [→] [⟳]` + URL input bar (full width, looks like a browser address bar, shows preview URL, user can type a new URL and press Enter to navigate)
- Right section: `[Inspect element icon]` `[Responsive toggle]` `[Settings icon]` `[Share button]`

Buttons use Lucide icons:
- `ArrowLeft`, `ArrowRight`, `RotateCw` for nav
- `MousePointer2` for inspect toggle (turns blue when active)
- `Monitor`, `Tablet`, `Smartphone` for responsive preview toggle
- `Settings` for settings
- `Share2` for share

The URL bar:
- Shows the current sandbox preview URL
- Allows typing a new URL + Enter to navigate
- Has a lock/globe icon on the left
- Shows loading spinner when page is loading

---

### 7. Sidebar Component

**File: `components/builder/builder-sidebar.tsx`**

Vertical icon sidebar on the far left (like VS Code), 42px wide:
- Icons stacked vertically: `Files`, `Search`, `GitBranch`, `Package`, `Settings`
- Active icon highlighted with `#3b82f6` (blue)
- Below the icon rail, show the panel content for the active tab

**File Tree Panel** (`components/builder/file-tree.tsx`):
- Fetches file list from CodeSandbox sandbox via SDK
- Renders tree with folder/file icons (use `lucide-react`: `Folder`, `FolderOpen`, `File`, `FileCode`, `FileJson`, `FileText`)
- Click file → open in Monaco editor
- Right-click context menu: New File, New Folder, Rename, Delete
- Shows dirty indicator (orange dot) on modified files
- Has a `[+ New File]` button at top
- Supports drag-to-reorder (basic)
- File type colors matching VS Code: `.tsx/.ts` blue, `.css` teal, `.json` yellow, `.md` gray, etc.

---

### 8. Browser Preview Component

**File: `components/builder/browser-preview.tsx`**

The center panel showing the live CodeSandbox preview.

Structure:
```
┌─────────────────────────────────────────────────────────┐
│  [←][→][⟳]  [🔒 https://sandbox-id.csb.app     ] [⊡]  │ ← mini browser chrome
├─────────────────────────────────────────────────────────┤
│                                                         │
│         <iframe src={previewUrl} />                     │
│         with postMessage bridge injected                │
│                                                         │
│  [element inspect overlay when isInspecting=true]       │
└─────────────────────────────────────────────────────────┘
```

Features:
1. The iframe uses `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` and `allow="*"`
2. Inject the bridge script via `srcdoc` initially, or use `onLoad` to postMessage a setup command
3. Listen to `window.addEventListener('message', ...)` to receive:
   - Console events → add to `consoleEntries`
   - Element selected → set `inspectedElement`, open element panel
   - Page title changes → update topbar
4. When `isInspecting` is true, show an overlay cursor and capture the next click event from the iframe
5. Responsive preview sizes:
   - Desktop: full width
   - Tablet: `768px` centered with device frame
   - Mobile: `375px` centered with phone frame

The **iframe bridge script** (inline in a `<script>` tag injected via postMessage when frame loads):

```js
// Intercept console
['log','warn','error','info','debug'].forEach(level => {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    orig(...args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    window.parent.postMessage({ __sw: true, type: 'console', level, message: msg, ts: Date.now() }, '*');
  };
});

// Intercept errors
window.onerror = (msg, src, line, col, err) => {
  window.parent.postMessage({ __sw: true, type: 'error', message: msg, source: src, line, stack: err?.stack, ts: Date.now() }, '*');
};

// Element inspector  
window.__swInspect = false;
document.addEventListener('click', (e) => {
  if (!window.__swInspect) return;
  e.preventDefault(); e.stopPropagation();
  const el = e.target;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  window.parent.postMessage({
    __sw: true, type: 'element_selected',
    tag: el.tagName, id: el.id, cls: el.className,
    html: el.outerHTML.slice(0, 2000),
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    styles: Object.fromEntries(['color','background','font-size','padding','margin','border-radius','display'].map(k => [k, cs.getPropertyValue(k)]))
  }, '*');
}, true);
document.addEventListener('mousemove', (e) => {
  if (!window.__swInspect) return;
  // highlight hovered element
}, true);
window.parent.postMessage({ __sw: true, type: 'bridge_ready' }, '*');
```

---

### 9. Code Editor Component

**File: `components/builder/code-editor.tsx`**

Uses `@monaco-editor/react`.

Features:
- Dark theme matching stagewise: use `vs-dark` as base, customize to match indexblue dark colors
- Tab bar at top showing open files (click to switch, `×` to close)
- Unsaved indicator (orange dot on tab)
- Auto-save after 1s debounce (saves to CodeSandbox via SDK)
- Language detection from file extension (`.tsx` → typescript, `.css` → css, etc.)
- Editor options: `fontSize: 13`, `lineNumbers: 'on'`, `minimap: { enabled: true }`, `wordWrap: 'on'`, `tabSize: 2`, `scrollBeyondLastLine: false`
- Keyboard shortcuts: `Cmd+S` to save manually, `Cmd+P` to open file search
- When AI agent edits a file, animate a diff overlay showing what changed (green for additions, red for deletions), then apply the change

---

### 10. Agent Chat Component

**File: `components/builder/agent-chat.tsx`**

The right panel AI coding agent. Clone stagewise's chat panel design exactly.

**Design:**
- Background: `#141416`
- Header: "Agent" with model selector dropdown (use existing indexblue model list)
- Chat message list (scrollable)
- Input area at bottom (TipTap or simple textarea)

**Message types to render:**
- User message: right-aligned, `#1d4ed8` background, white text
- Assistant message: left-aligned, `#1e1e20` background
- Tool call card: collapsible, shows tool name + status icon (spinner → checkmark), shows result on expand
- File edit card: shows file path + diff preview + `[Apply]` / `[Reject]` buttons
- System message: centered, muted, small text

**Tool calls to implement (these appear as cards in the chat):**

```
read_file(path) → reads file from CodeSandbox sandbox
write_file(path, content) → writes file, shows diff card in chat
create_file(path, content) → creates new file
delete_file(path) → deletes file
list_files(directory?) → returns file tree
run_terminal_command(command) → runs in CodeSandbox terminal, streams output
install_package(packages[]) → runs npm install/pnpm add in terminal
navigate_browser(url) → navigates iframe to URL
inspect_element(selector) → highlights element in iframe
search_files(query) → searches file contents
get_file_diff(path) → gets current diff vs last save
```

**Chat input:**
- Multiline textarea with `Cmd+Enter` to submit
- Attach button (screenshot, file reference)
- `@file` mention support (type @ to get file picker)
- Model selector (compact, shows current model name)
- Context tokens counter at bottom right

**AI streaming:**
Use `useChat` from `@ai-sdk/react` pointing to `/api/builder/chat` route.

System prompt for the coding agent (send with every request):
```
You are an expert coding agent working inside a browser-based IDE. 
You have access to a live CodeSandbox environment with a real file system and terminal.
The user's project is a {framework} application.
You can read files, write files, install packages, run commands, and see the live preview.
When making code changes, always show the user what you're changing and why.
After making changes, the preview will automatically hot-reload.
Be concise and direct. Always use the tools available to you.
Current project: {projectName}
```

---

### 11. Bottom Panel Component

**File: `components/builder/builder-bottom-panel.tsx`**

Tabs: Console | Terminal | Problems | Output

**Console tab:**
- Shows `ConsoleEntry[]` from iframe bridge
- Color coded: `log` = white, `warn` = `#f59e0b`, `error` = `#ef4444`, `info` = `#3b82f6`, `network` = `#8b5cf6`
- Timestamp on left (small, muted)
- Source file + line number on right (clickable → opens file)
- Filter bar at top: All | Errors | Warnings | Logs
- Clear button
- Search input

**Terminal tab:**
- Shows CodeSandbox sandbox terminal output
- Uses `@codesandbox/sdk` to create a terminal session
- Renders output with ANSI color support (use `ansi-to-html` or simple regex for colors)
- Input bar at bottom to type commands
- Shows cwd prompt: `$ ~/project >`
- Command history (↑/↓ arrows)

**Problems tab:**
- TypeScript errors from Monaco editor diagnostics
- Listed as `[filename]:[line]:[col] — error message`
- Click to jump to error in editor

---

### 12. Element Inspector Panel

**File: `components/builder/element-inspector.tsx`**

Shows when an element is inspected from the preview. Appears as a drawer/panel that slides up from the bottom-right.

Shows:
- Element HTML tag + selector
- Computed styles (color, background, font, spacing, etc.) in a visual properties grid
- HTML source (syntax highlighted)
- "Add to prompt" button → appends element context to chat input
- "Edit styles" inline → applies CSS directly to element via postMessage

---

### 13. API Routes

**File: `app/api/builder/chat/route.ts`**

Streaming AI endpoint for the coding agent.

```typescript
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { getModel } from '@/ai/models' // use existing indexblue model registry
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { builderChats, builderProjects } from '@/lib/db/builder-schema'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const { messages, projectId, sandboxId, model = 'claude-sonnet-4-5' } = await req.json()

  // Verify project ownership
  const [project] = await db.select().from(builderProjects)
    .where(eq(builderProjects.id, projectId)).limit(1)
  if (!project || project.userId !== session.user.id)
    return new Response('Forbidden', { status: 403 })

  const result = streamText({
    model: getModel(model),
    system: `You are an expert coding agent inside a browser IDE. Project: ${project.name} (${project.framework}). You can read/write files, install packages, and run commands using your tools. Always be direct and show what you're changing.`,
    messages,
    tools: {
      read_file: tool({
        description: 'Read a file from the project',
        parameters: z.object({ path: z.string().describe('File path relative to project root') }),
        execute: async ({ path }) => {
          // Client-side tool — return instruction for client to execute
          return { action: 'read_file', path }
        }
      }),
      write_file: tool({
        description: 'Write/update a file in the project',
        parameters: z.object({
          path: z.string().describe('File path'),
          content: z.string().describe('Full file content'),
          description: z.string().describe('Brief description of what changed'),
        }),
        execute: async ({ path, content, description }) => {
          return { action: 'write_file', path, content, description }
        }
      }),
      create_file: tool({
        description: 'Create a new file',
        parameters: z.object({
          path: z.string(),
          content: z.string(),
        }),
        execute: async ({ path, content }) => {
          return { action: 'create_file', path, content }
        }
      }),
      delete_file: tool({
        description: 'Delete a file',
        parameters: z.object({ path: z.string() }),
        execute: async ({ path }) => ({ action: 'delete_file', path })
      }),
      list_files: tool({
        description: 'List all files in the project',
        parameters: z.object({ directory: z.string().optional() }),
        execute: async ({ directory }) => ({ action: 'list_files', directory })
      }),
      run_command: tool({
        description: 'Run a shell command in the project terminal (npm install, build, test, etc.)',
        parameters: z.object({
          command: z.string().describe('Shell command to run'),
        }),
        execute: async ({ command }) => ({ action: 'run_command', command })
      }),
      install_packages: tool({
        description: 'Install npm packages',
        parameters: z.object({
          packages: z.array(z.string()).describe('Package names to install'),
          dev: z.boolean().optional().describe('Install as devDependencies'),
        }),
        execute: async ({ packages, dev }) => ({
          action: 'run_command',
          command: `npm install ${dev ? '--save-dev ' : ''}${packages.join(' ')}`
        })
      }),
      navigate: tool({
        description: 'Navigate the browser preview to a URL or route',
        parameters: z.object({ url: z.string() }),
        execute: async ({ url }) => ({ action: 'navigate', url })
      }),
    },
    onFinish: async ({ text }) => {
      // Save assistant message to DB
      await db.insert(builderChats).values({
        projectId,
        role: 'assistant',
        content: text,
      })
    }
  })

  // Save user message
  const lastUserMsg = messages.findLast((m: any) => m.role === 'user')
  if (lastUserMsg) {
    await db.insert(builderChats).values({
      projectId,
      role: 'user',
      content: typeof lastUserMsg.content === 'string'
        ? lastUserMsg.content
        : JSON.stringify(lastUserMsg.content),
    }).catch(() => {})
  }

  return result.toDataStreamResponse()
}
```

**File: `app/api/builder/project/route.ts`** — CRUD for projects:

```typescript
// GET /api/builder/project — list user's projects
// POST /api/builder/project — create new project
```

**File: `app/api/builder/project/[id]/route.ts`** — Single project:

```typescript
// GET /api/builder/project/[id] — get project
// PATCH /api/builder/project/[id] — update project (sandboxId, previewUrl, name, etc.)
// DELETE /api/builder/project/[id] — delete project
```

---

### 14. CodeSandbox SDK Integration

**File: `lib/builder/codesandbox.ts`**

```typescript
import { CodeSandbox } from '@codesandbox/sdk'

// Get SDK token from env: CODESANDBOX_API_TOKEN
const csb = new CodeSandbox(process.env.CODESANDBOX_API_TOKEN!)

export async function createSandbox(framework: string) {
  // Template IDs:
  // react → 'react'
  // next  → 'nextjs'
  // vue   → 'vue'
  // vanilla → 'vanilla'
  const templateMap: Record<string, string> = {
    react: 'react',
    next: 'nextjs',
    vue: 'vue',
    angular: 'angular',
    vanilla: 'vanilla',
  }
  const sandbox = await csb.sandbox.create({
    template: templateMap[framework] ?? 'react',
  })
  return sandbox
}

export async function getSandbox(sandboxId: string) {
  return csb.sandbox.open(sandboxId)
}

export async function getSandboxPreviewUrl(sandboxId: string) {
  return `https://${sandboxId}.csb.app`
}
```

**In `builder-workspace.tsx` client component**, use the SDK on the client side:

```typescript
import { CodeSandbox } from '@codesandbox/sdk/browser'

// Connect to sandbox on mount
useEffect(() => {
  const init = async () => {
    const sdk = new CodeSandbox(/* no token needed for browser SDK with existing sandbox */)
    const sandbox = await sdk.connect(project.sandboxId)

    // Get file system
    const fs = sandbox.fs
    const files = await fs.readdir('/')
    setFileTree(buildFileTree(files))

    // Open terminal
    const terminal = await sandbox.terminals.create()
    terminal.onOutput((data) => {
      setTerminalOutput(prev => prev + data)
    })
    setSandboxTerminal(terminal)

    // Watch file changes
    sandbox.fs.watch('/', (event) => {
      if (event.type === 'change') refreshFileTree()
    })

    // Set preview URL
    const url = `https://${project.sandboxId}.csb.app`
    setPreviewUrl(url)
    setIsSandboxReady(true)
  }
  if (project.sandboxId) init()
}, [project.sandboxId])
```

---

### 15. Context & State Management

**File: `lib/builder/builder-context.tsx`**

Create a React context for sharing builder state across all components without prop drilling:

```typescript
export const BuilderContext = createContext<BuilderContextValue | null>(null)

type BuilderContextValue = {
  // Sandbox
  sandbox: any // CodeSandbox sandbox instance
  sandboxReady: boolean
  previewUrl: string
  
  // Files
  fileTree: FileNode[]
  openTabs: EditorTab[]
  activeTab: string | null
  openFile: (path: string) => void
  closeTab: (path: string) => void
  saveFile: (path: string, content: string) => Promise<void>
  createFile: (path: string) => Promise<void>
  deleteFile: (path: string) => Promise<void>
  
  // Console
  consoleEntries: ConsoleEntry[]
  addConsoleEntry: (entry: ConsoleEntry) => void
  clearConsole: () => void
  
  // Inspector
  isInspecting: boolean
  setIsInspecting: (v: boolean) => void
  inspectedElement: InspectedElement | null
  
  // Browser
  browserUrl: string
  setBrowserUrl: (url: string) => void
  navigateTo: (url: string) => void
  
  // Terminal
  terminalOutput: string
  runCommand: (cmd: string) => Promise<void>
  
  // UI State
  bottomTab: 'console' | 'terminal' | 'problems'
  setBottomTab: (tab: 'console' | 'terminal' | 'problems') => void
  sidebarTab: 'files' | 'search' | 'git'
  setSidebarTab: (tab: 'files' | 'search' | 'git') => void
  
  // Project
  project: ProjectInfo
}

export function useBuilder() {
  const ctx = useContext(BuilderContext)
  if (!ctx) throw new Error('useBuilder must be used inside BuilderWorkspace')
  return ctx
}
```

---

### 16. Styling — Clone Stagewise Exactly

**File: `components/builder/builder.css`** (import in builder-workspace.tsx)

```css
/* Stagewise design tokens */
:root {
  --sw-bg: #0f0f10;
  --sw-surface: #141416;
  --sw-surface-2: #1a1a1c;
  --sw-surface-3: #222226;
  --sw-border: #2a2a2d;
  --sw-border-2: #333337;
  --sw-text: #e4e4e7;
  --sw-text-muted: #71717a;
  --sw-text-dim: #52525b;
  --sw-blue: #3b82f6;
  --sw-blue-dim: #1d4ed8;
  --sw-green: #22c55e;
  --sw-yellow: #f59e0b;
  --sw-red: #ef4444;
  --sw-purple: #8b5cf6;
}

/* Panel resize handle */
[data-panel-resize-handle-id] {
  background: var(--sw-border);
  transition: background 0.15s;
}
[data-panel-resize-handle-id]:hover,
[data-panel-resize-handle-id][data-resize-handle-active] {
  background: var(--sw-blue);
}
```

All components use these CSS variables. Match stagewise's actual color palette from `packages/stage-ui/` — read that directory for exact values.

---

### 17. Environment Variables

Add to `.env.local` (add to `.env.example` too):

```
CODESANDBOX_API_TOKEN=your_codesandbox_api_token_here
```

Get the token from https://codesandbox.io/p/dashboard → Settings → API Token

---

### 18. Navigation — Add Builder to App

**File: `components/builder-launcher.tsx`** (or add to existing nav):

Add a button/link in the main indexblue nav that goes to `/builder/new` to create a new project, and lists existing projects. This should look like the existing indexblue UI style.

**File: `app/builder/new/page.tsx`** — Create new project page:

Simple form to:
- Enter project name
- Choose framework (React, Next.js, Vue, Vanilla)
- Click "Create Project" → POST to `/api/builder/project` → redirect to `/builder/project/[id]`

---

## DESIGN REQUIREMENTS (NON-NEGOTIABLE)

1. **Copy stagewise's design exactly** — read `/home/ubuntu/bluedark/stagewise/packages/stage-ui/src/` and `apps/browser/src/ui/` for all design tokens, colors, font sizes, component styles
2. **Dark by default** — the builder is always dark (#0f0f10 base, #141416 panels)
3. **Resizable panels** — all three main panels must be draggable to resize
4. **Full screen** — the builder takes 100dvh, no scroll, no main app chrome
5. **Smooth animations** — panel transitions, tab switches, message streaming all use CSS transitions (200ms ease)
6. **Monaco editor** must have proper dark theme matching the stagewise editor look
7. **Console entries** must have smooth scroll-to-bottom on new entries
8. **Chat messages** must stream token-by-token like the rest of indexblue
9. **File tree** must have proper indentation, icons, and hover states
10. **Tool call cards** in chat must show real-time status (spinner while running, checkmark when done)

---

## IMPLEMENTATION ORDER

Do this in order:

1. Install packages (`pnpm add @codesandbox/sdk @monaco-editor/react react-resizable-panels`)
2. Create DB schema + migration
3. Create `/app/builder/layout.tsx`
4. Create all API routes
5. Create `lib/builder/codesandbox.ts` and `lib/builder/types.ts`
6. Create `lib/builder/builder-context.tsx`
7. Create `components/builder/builder-workspace.tsx` (shell with panels)
8. Create `components/builder/builder-topbar.tsx`
9. Create `components/builder/builder-sidebar.tsx` + `file-tree.tsx`
10. Create `components/builder/browser-preview.tsx`
11. Create `components/builder/code-editor.tsx`
12. Create `components/builder/agent-chat.tsx`
13. Create `components/builder/builder-bottom-panel.tsx`
14. Create `app/builder/project/[projectid]/page.tsx`
15. Create `app/builder/new/page.tsx`
16. Run `pnpm drizzle-kit generate` and `pnpm drizzle-kit migrate` to apply DB changes
17. Test the full flow

---

## VERIFICATION CHECKLIST

After building, verify:
- [ ] `/builder/new` creates a project and redirects to `/builder/project/[id]`
- [ ] The workspace loads with all 3 panels visible and resizable
- [ ] CodeSandbox sandbox is created/connected and preview URL shows in iframe
- [ ] Clicking a file in the tree opens it in Monaco editor
- [ ] Typing a message in the agent chat and pressing Cmd+Enter streams a response
- [ ] Agent `write_file` tool updates the file in CodeSandbox and reloads the preview
- [ ] Agent `run_command` tool shows output in the Terminal tab
- [ ] Console logs from the iframe appear in the Console tab
- [ ] Element inspector works (click inspect button → click element in preview → see element details)
- [ ] The layout looks identical to stagewise (dark chrome, same spacing, same fonts)
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] No lint errors (`pnpm lint`)
