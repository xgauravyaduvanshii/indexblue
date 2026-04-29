import 'server-only';

import { tool } from 'ai';
import type { UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from '@/lib/r2';
import { serverEnv } from '@/env/server';
import {
  type BuilderRuntime,
  type BuilderRuntimeProvider,
  type BuilderSandbox,
  createBuilderBox,
  installBunInBuilderBox,
  reconnectBuilderBox,
  seedBuilderWorkspace,
} from '@/lib/builder/box';
import { BUILDER_BOX_ROOT, BUILDER_REMOTE_PROJECT_PATH } from '@/lib/builder/paths';
import { inferBuilderPreviewPort } from '@/lib/builder/preview';

import { scrapeWebpageWithNotte } from '@/lib/notte';
import type { ChatMessage } from '@/lib/types';
import Exa from 'exa-js';
import FirecrawlApp from '@mendable/firecrawl-js';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';

const LOG_PREFIX = '🔨 [Build]';

export const SUPPORTED_RUNTIMES: BuilderRuntime[] = ['node', 'python', 'golang', 'ruby', 'rust'];

class BoxManager {
  private box: BuilderSandbox | null = null;
  private creating: Promise<BuilderSandbox> | null = null;
  private userId: string;
  private runtime: BuilderRuntime;
  private existingBoxId: string | null;
  private provider: Exclude<BuilderRuntimeProvider, 'webcontainers'>;
  private workspacePath: string | null;
  private mcpServerNames: string[] = [];
  private _hasVercelMcp: boolean = false;

  constructor(
    userId: string,
    existingBoxId?: string | null,
    provider: Exclude<BuilderRuntimeProvider, 'webcontainers'> = 'e2b',
    workspacePath?: string | null,
  ) {
    this.userId = userId;
    this.runtime = 'node';
    this.existingBoxId = existingBoxId ?? null;
    this.provider = provider;
    this.workspacePath = workspacePath ?? null;
  }

  /** May only be called before the first getBox() call. */
  setRuntime(runtime: BuilderRuntime) {
    if (this.box || this.creating) {
      console.warn(`${LOG_PREFIX} setRuntime() called after Box was already created — ignored`);
      return;
    }
    this.runtime = runtime;
  }

  getRuntime(): BuilderRuntime {
    return this.runtime;
  }

  async getBox(): Promise<BuilderSandbox> {
    if (this.box) return this.box;
    if (this.creating) {
      this.box = await this.creating;
      return this.box;
    }

    if (this.existingBoxId) {
      console.log(`${LOG_PREFIX} Reconnecting to existing Box ${this.existingBoxId}...`);
      this.creating = this.reconnectBox(this.existingBoxId);
    } else {
      console.log(`${LOG_PREFIX} Creating new Box for user ${this.userId}...`);
      this.creating = this.initBox();
    }

    this.box = await this.creating;
    console.log(`${LOG_PREFIX} Box ready: ${this.box.id}`);
    return this.box;
  }

  private async reconnectBox(boxId: string): Promise<BuilderSandbox> {
    try {
      const box = await reconnectBuilderBox({
        boxId,
        userId: this.userId,
        runtime: this.runtime,
        provider: this.provider,
        workspacePath: this.workspacePath,
      });
      return box;
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to reconnect to Box ${boxId}, creating new one:`, err);
      this.existingBoxId = null;
      return this.initBox();
    }
  }

  private async initBox(): Promise<BuilderSandbox> {
    const created = await createBuilderBox({
      userId: this.userId,
      runtime: this.runtime,
      provider: this.provider,
      workspacePath: this.workspacePath,
    });

    this.mcpServerNames = [...created.mcpServerNames];
    this._hasVercelMcp = created.hasVercelMcp;
    console.log(`${LOG_PREFIX} MCP servers: ${this.mcpServerNames.join(', ')}`);
    if (this._hasVercelMcp)
      console.log(`${LOG_PREFIX} Vercel MCP detected — agent will extract token from mcp-config.json`);

    return created.box;
  }

  getBoxId(): string | null {
    return this.box?.id ?? null;
  }

  getMcpServerNames(): string[] {
    return this.mcpServerNames;
  }

  hasVercelMcp(): boolean {
    return this._hasVercelMcp;
  }

  supportsBoxAgent() {
    return this.provider === 'e2b';
  }

  /** Disconnect without destroying the box — it persists for future messages. */
  async cleanup() {
    if (this.box) {
      console.log(`${LOG_PREFIX} Disconnecting from Box ${this.box.id} (persisted)`);
      this.box = null;
      this.creating = null;
    }
  }
}

function createBoxExecTool(dataStream: UIMessageStreamWriter<ChatMessage> | undefined, boxManager: BoxManager) {
  return tool({
    description:
      'Execute a shell command inside the cloud sandbox. Use for installing packages, running scripts, building projects, running tests, git operations, etc.',
    inputSchema: z.object({
      command: z.string().describe('The shell command to execute. Supports pipes, redirects, and chained commands.'),
    }),
    execute: async ({ command }, { toolCallId }) => {
      const execId = toolCallId;
      console.log(`${LOG_PREFIX} [exec:${execId}] $ ${command}`);
      const box = await boxManager.getBox();

      if (dataStream) {
        dataStream.write({
          type: 'data-build_search',
          data: { kind: 'exec', execId, command, status: 'running' },
        });
      }

      try {
        const previewPort = inferBuilderPreviewPort(command);
        if (previewPort && dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: {
              kind: 'preview',
              previewId: execId,
              port: previewPort,
              url: box.getPreviewUrl(previewPort),
              status: 'completed',
            },
          });
        }

        const stream = await box.exec.stream(command);
        let stdout = '';

        for await (const chunk of stream) {
          if (chunk.type === 'output') {
            stdout += chunk.data;
            if (dataStream) {
              dataStream.write({
                type: 'data-build_search',
                data: { kind: 'exec_output', execId, chunk: chunk.data, stream: 'stdout' },
              });
            }
          }
        }

        const exitCode = stream.exitCode ?? 0;
        const status = exitCode === 0 ? ('completed' as const) : ('error' as const);
        console.log(`${LOG_PREFIX} [exec:${execId}] ${status} (${stdout.length} chars)`);

        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: { kind: 'exec', execId, command, status, stdout, exitCode },
          });
        }

        return { command, stdout, status, exitCode };
      } catch (error) {
        const stderr = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_PREFIX} [exec:${execId}] Error:`, stderr);
        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: { kind: 'exec', execId, command, status: 'error', stderr },
          });
        }
        return { command, stderr, status: 'error' as const };
      }
    },
  });
}

function createBoxWriteFileTool(dataStream: UIMessageStreamWriter<ChatMessage> | undefined, boxManager: BoxManager) {
  return tool({
    description:
      'Write a file directly into the sandbox filesystem. Use this BEFORE calling box_agent to drop in task briefs, config files, data, or any content the agent should reference. The agent can then read the file at any point during its run.',
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          `Absolute path inside the sandbox to write to, e.g. ${BUILDER_BOX_ROOT}/.task.md or ${BUILDER_BOX_ROOT}/config.json`,
        ),
      content: z.string().describe('Full text content to write into the file'),
    }),
    execute: async ({ path, content }, { toolCallId }) => {
      const writeId = toolCallId;
      console.log(`${LOG_PREFIX} [write:${writeId}] ${path} (${content.length} chars)`);
      const box = await boxManager.getBox();

      try {
        await box.files.write({ path, content });
        console.log(`${LOG_PREFIX} [write:${writeId}] ✓ written`);

        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: {
              kind: 'write',
              writeId,
              path,
              contentPreview: content.length > 800 ? content.slice(0, 800) + '\n...' : content,
              status: 'completed',
            },
          });
        }

        return { path, bytes: content.length, status: 'completed' as const };
      } catch (error) {
        const stderr = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_PREFIX} [write:${writeId}] Error:`, stderr);

        return { path, stderr, status: 'error' as const };
      }
    },
  });
}

function createBoxDownloadTool(dataStream: UIMessageStreamWriter<ChatMessage> | undefined, boxManager: BoxManager) {
  return tool({
    description:
      'Download a file or directory from the sandbox as a public URL. For directories, creates a tar.gz archive first.',
    inputSchema: z.object({
      path: z.string().describe('Path to the file or directory to download'),
    }),
    execute: async ({ path }, { toolCallId }) => {
      const downloadId = toolCallId;
      console.log(`${LOG_PREFIX} [download:${downloadId}] ${path}`);
      const box = await boxManager.getBox();

      try {
        const checkResult = await box.exec.command(`test -d "${path}" && echo "dir" || echo "file"`);
        const isDir = checkResult.result?.trim() === 'dir';
        console.log(`${LOG_PREFIX} [download:${downloadId}] Type: ${isDir ? 'directory' : 'file'}`);

        let archivePath = path;
        let filename: string;

        if (isDir) {
          const dirName = path.split('/').filter(Boolean).pop() || 'project';
          archivePath = `/tmp/${dirName}-${nanoid(6)}.zip`;
          filename = `${dirName}.zip`;
          await box.exec.command(`cd "$(dirname "${path}")" && zip -r "${archivePath}" "$(basename "${path}")"`);
        } else {
          const segments = path.split('/').filter(Boolean);
          filename = segments[segments.length - 1] || `download-${nanoid(6)}`;
        }

        const b64Result = await box.exec.command(`base64 -w 0 "${archivePath}"`);
        const b64Content = b64Result.result?.trim() ?? '';

        if (!b64Content) {
          throw new Error('Failed to read file content');
        }

        const buffer = Buffer.from(b64Content, 'base64');
        console.log(`${LOG_PREFIX} [download:${downloadId}] ${filename} (${buffer.length} bytes)`);
        const ext = filename.includes('.') ? filename.split('.').pop() : 'bin';
        const key = `scira/builds/${nanoid()}/${filename}`;

        const contentTypeMap: Record<string, string> = {
          js: 'text/javascript',
          ts: 'text/typescript',
          json: 'application/json',
          html: 'text/html',
          css: 'text/css',
          md: 'text/markdown',
          py: 'text/x-python',
          txt: 'text/plain',
          csv: 'text/csv',
          'tar.gz': 'application/gzip',
          gz: 'application/gzip',
          tar: 'application/x-tar',
          zip: 'application/zip',
          png: 'image/png',
          jpg: 'image/jpeg',
          gif: 'image/gif',
          svg: 'image/svg+xml',
          pdf: 'application/pdf',
        };
        const contentType = contentTypeMap[ext ?? ''] || 'application/octet-stream';

        await r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
          }),
        );

        const url = `${R2_PUBLIC_URL}/${key}`;
        console.log(`${LOG_PREFIX} [download:${downloadId}] Uploaded to ${url}`);

        if (isDir) {
          await box.exec.command(`rm -f "${archivePath}"`).catch(() => {});
        }

        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: { kind: 'download', downloadId, path, url, filename, status: 'completed' },
          });
        }

        return { path, url, filename, status: 'completed' as const };
      } catch (error) {
        console.error(`${LOG_PREFIX} [download:${downloadId}] Error:`, error);
        return { path, url: '', filename: '', status: 'error' as const, error: String(error) };
      }
    },
  });
}

export interface UploadedFileContext {
  name: string;
  url: string;
  mediaType: string;
}

function createBoxAgentTool(
  dataStream: UIMessageStreamWriter<ChatMessage> | undefined,
  boxManager: BoxManager,
  uploadedFiles: UploadedFileContext[] = [],
) {
  return tool({
    description:
      'Delegate a complex, multi-step coding task to Claude Code running inside the sandbox. The agent can autonomously write files, run commands, install packages, use git, search the web, and discover/install skills. Use this for tasks that require multiple steps or autonomous problem-solving (e.g., "build a REST API with tests", "refactor the auth module", "fix failing tests").',
    inputSchema: z.object({
      prompt: z.string().describe('A detailed description of the task for the agent to complete'),
    }),
    execute: async ({ prompt }, { toolCallId }) => {
      const agentId = toolCallId;
      console.log(`${LOG_PREFIX} [agent:${agentId}] Starting: "${prompt.slice(0, 80)}..."`);
      const box = await boxManager.getBox();

      if (dataStream) {
        dataStream.write({
          type: 'data-build_search',
          data: { kind: 'agent', agentId, prompt, status: 'running' },
        });
      }

      const mcpServerNames = boxManager.getMcpServerNames();
      const mcpLine =
        mcpServerNames.length > 0
          ? `You have MCP servers connected: ${mcpServerNames.join(', ')}. Use them when relevant (e.g. GitHub for repos, Slack for notifications, Notion for docs).\n\n`
          : '';

      const filesLine =
        uploadedFiles.length > 0
          ? `The user has uploaded the following files which are already available in the sandbox:\n${uploadedFiles.map((f) => `  ${BUILDER_BOX_ROOT}/${f.name} (${f.mediaType})`).join('\n')}\n\n`
          : '';

      const vercelLine = boxManager.hasVercelMcp()
        ? `The user has connected their Vercel account. Their Vercel OAuth token is stored in the sandbox at ${BUILDER_BOX_ROOT}/.box-internal/mcp-config.json under the Authorization header for the Vercel MCP server. To deploy: read that file, extract the Bearer token, then run "export VERCEL_TOKEN=<token>" before using the Vercel CLI (e.g. "vercel --token $VERCEL_TOKEN --yes" or "vercel --token $VERCEL_TOKEN --prod").\n\n`
        : '';

      const skillPreamble = `${mcpLine}${filesLine}${vercelLine}Complete the following task:\n\n`;

      try {
        let fullText = '';
        let toolCallCount = 0;
        let lastToolCallSignature: string | null = null;

        const emitToolCall = (toolName: string, input: Record<string, unknown>) => {
          const signature = `${toolName}:${JSON.stringify(input ?? {})}`;
          if (signature === lastToolCallSignature) {
            console.log(`${LOG_PREFIX} [agent:${agentId}] Skipping duplicate tool call: ${toolName}`);
            return;
          }
          lastToolCallSignature = signature;
          toolCallCount++;
          console.log(`${LOG_PREFIX} [agent:${agentId}] Tool #${toolCallCount}: ${toolName}`);
          if (dataStream) {
            dataStream.write({
              type: 'data-build_search',
              data: {
                kind: 'agent',
                agentId,
                prompt,
                status: 'streaming',
                event: { type: 'tool_call', toolName, input },
              },
            });
          }
        };

        const run = await box.agent.stream({
          prompt: skillPreamble + prompt,
          onToolUse: (tool) => emitToolCall(tool.name, tool.input ?? {}),
        });

        for await (const chunk of run) {
          if (chunk.type === 'text-delta') {
            lastToolCallSignature = null;
            fullText += chunk.text;
            if (dataStream) {
              dataStream.write({
                type: 'data-build_search',
                data: {
                  kind: 'agent',
                  agentId,
                  prompt,
                  status: 'streaming',
                  event: { type: 'text_delta', text: chunk.text },
                },
              });
            }
          } else if (chunk.type === 'reasoning') {
            lastToolCallSignature = null;
            // Codex emits reasoning chunks — fold them into text display
            if (chunk.text && dataStream) {
              dataStream.write({
                type: 'data-build_search',
                data: {
                  kind: 'agent',
                  agentId,
                  prompt,
                  status: 'streaming',
                  event: { type: 'text_delta', text: chunk.text },
                },
              });
            }
          } else if (chunk.type === 'tool-call') {
            emitToolCall(chunk.toolName, chunk.input ?? {});
          } else if (chunk.type === 'finish') {
            if (dataStream) {
              dataStream.write({
                type: 'data-build_search',
                data: {
                  kind: 'agent',
                  agentId,
                  prompt,
                  status: 'streaming',
                  event: {
                    type: 'finish',
                    usage: {
                      inputTokens: chunk.usage?.inputTokens ?? 0,
                      outputTokens: chunk.usage?.outputTokens ?? 0,
                    },
                  },
                },
              });
            }
          }
          // 'start' and 'stats' chunks are informational — no UI needed
        }

        const result = run.result ?? fullText;
        const cost = run.cost;
        console.log(
          `${LOG_PREFIX} [agent:${agentId}] Completed: ${toolCallCount} tool calls, ${fullText.length} chars text${cost ? `, $${cost.totalUsd?.toFixed(4)}` : ''}`,
        );

        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: {
              kind: 'agent',
              agentId,
              prompt,
              status: 'completed',
              result: typeof result === 'string' ? result : JSON.stringify(result),
              cost: cost
                ? {
                    inputTokens: cost.inputTokens ?? 0,
                    outputTokens: cost.outputTokens ?? 0,
                    totalUsd: cost.totalUsd,
                    computeMs: cost.computeMs,
                  }
                : undefined,
            },
          });
        }

        return {
          result: typeof result === 'string' ? result : JSON.stringify(result),
          status: run.status ?? 'completed',
          cost: cost
            ? {
                inputTokens: cost.inputTokens ?? 0,
                outputTokens: cost.outputTokens ?? 0,
                totalUsd: cost.totalUsd,
              }
            : undefined,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_PREFIX} [agent:${agentId}] Error:`, errorMsg);
        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: { kind: 'agent', agentId, prompt, status: 'error', result: errorMsg },
          });
        }
        return { result: errorMsg, status: 'error' as const };
      }
    },
  });
}

function createBoxCodeTool(dataStream: UIMessageStreamWriter<ChatMessage> | undefined, boxManager: BoxManager) {
  return tool({
    description:
      'Execute an inline code snippet (JS, TS, or Python) directly in the sandbox without writing a file first.',
    inputSchema: z.object({
      code: z.string().describe('The code to execute'),
      lang: z.enum(['js', 'ts', 'python']).describe('The language of the code snippet'),
    }),
    execute: async ({ code, lang }, { toolCallId }) => {
      const codeId = toolCallId;
      console.log(`${LOG_PREFIX} [code:${codeId}] ${lang} (${code.length} chars)`);
      const box = await boxManager.getBox();

      if (dataStream) {
        dataStream.write({
          type: 'data-build_search',
          data: { kind: 'code', codeId, code, lang, status: 'running' },
        });
      }

      try {
        const run = await box.exec.code({ code, lang });
        const result = run.result ?? '';
        const exitCode = run.exitCode ?? 0;
        console.log(`${LOG_PREFIX} [code:${codeId}] exit=${exitCode} (${result.length} chars)`);

        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: {
              kind: 'code',
              codeId,
              code,
              lang,
              status: exitCode === 0 ? 'completed' : 'error',
              result,
              exitCode,
            },
          });
        }

        return { result, exitCode, status: exitCode === 0 ? 'completed' : 'error' };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_PREFIX} [code:${codeId}] Error:`, errorMsg);
        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: { kind: 'code', codeId, code, lang, status: 'error', result: errorMsg },
          });
        }
        return { result: errorMsg, exitCode: 1, status: 'error' };
      }
    },
  });
}

function createBrowsePageTool(dataStream: UIMessageStreamWriter<ChatMessage> | undefined) {
  const exa = new Exa(serverEnv.EXA_API_KEY);
  const firecrawl = new FirecrawlApp({ apiKey: serverEnv.FIRECRAWL_API_KEY });

  return tool({
    description:
      'Browse and extract the full content of one or more web pages. Use to read documentation, blog posts, release notes, READMEs, or any URL.',
    inputSchema: z.object({
      urls: z.array(z.string().url()).min(1).max(5).describe('URLs to browse and extract content from'),
    }),
    execute: async ({ urls }) => {
      console.log(`${LOG_PREFIX} [browse] ${urls.length} URLs:`, urls);
      const results: Array<{ url: string; title: string; content: string; error?: string }> = [];

      const browseTasks = Object.fromEntries(
        urls.map((url, i) => [
          `browse:${i}`,
          async () => {
            try {
              const notteResult = await scrapeWebpageWithNotte({ url, onlyMainContent: true });
              if (notteResult.markdown && notteResult.markdown.trim().length > 100) {
                const lines = notteResult.markdown.split('\n').filter(Boolean);
                const title = lines.find((l) => l.length > 3 && l.length <= 140) || new URL(url).hostname;
                return { url, title, content: notteResult.markdown };
              }
            } catch {
              /* fall through */
            }

            try {
              const exaResult = await exa.getContents([url], {
                text: { maxCharacters: 5000, includeHtmlTags: false },
                livecrawl: 'preferred',
              });
              const r = exaResult.results[0];
              if (r?.text?.trim()) {
                return { url, title: r.title || new URL(url).hostname, content: r.text.slice(0, 5000) };
              }
            } catch {
              /* fall through */
            }

            try {
              const fcResult = await firecrawl.scrape(url, {
                formats: ['markdown'],
                proxy: 'auto',
              });
              if (fcResult.markdown) {
                return {
                  url,
                  title: fcResult.metadata?.title || new URL(url).hostname,
                  content: fcResult.markdown.slice(0, 5000),
                };
              }
            } catch {
              /* fall through */
            }

            return { url, title: new URL(url).hostname, content: '', error: 'Failed to extract content' };
          },
        ]),
      );

      const browseResults = await all(browseTasks, getBetterAllOptions());
      for (const key of Object.keys(browseResults)) {
        const r = browseResults[key];
        if (r) results.push(r);
      }

      console.log(`${LOG_PREFIX} [browse] Got ${results.length} results`);
      return { results };
    },
  });
}

function createBuildWebSearchTool(dataStream: UIMessageStreamWriter<ChatMessage> | undefined) {
  const exa = new Exa(serverEnv.EXA_API_KEY);
  const firecrawl = new FirecrawlApp({ apiKey: serverEnv.FIRECRAWL_API_KEY });
  type ExaSearchCategory =
    | 'news'
    | 'company'
    | 'research paper'
    | 'financial report'
    | 'pdf'
    | 'personal site'
    | 'people';

  return tool({
    description:
      'Search the web for information using multiple queries. Use to find documentation, packages, APIs, tutorials, best practices, or current information. Returns full page content for each result.',
    inputSchema: z.object({
      actionTitle: z
        .string()
        .max(80)
        .describe(
          'Short human-readable label shown in the UI for this search (e.g. "Researching React performance patterns", "Finding weather API options").',
        ),
      queries: z.array(z.string().max(150)).min(1).max(5).describe('Search queries (1-5). Be specific and varied.'),
      category: z
        .enum(['news', 'company', 'research paper', 'financial report', 'pdf', 'tweet', 'personal site'])
        .optional()
        .describe('Optional category to filter results'),
      includeDomains: z.array(z.string()).optional().describe('Optional domains to restrict results to'),
      startDate: z.string().optional().describe('Filter results published after this date (YYYY-MM-DD)'),
    }),
    execute: async ({ actionTitle, queries, category, includeDomains, startDate }, { toolCallId }) => {
      const searchId = toolCallId;
      console.log(`${LOG_PREFIX} [search:${searchId}] ${queries.length} queries:`, queries);

      const total = queries.length;
      const allSearchResults: Array<{
        query: string;
        results: Array<{ title: string; url: string; content: string; favicon: string }>;
      }> = [];

      for (let index = 0; index < queries.length; index++) {
        const query = queries[index];
        const queryId = `${searchId}-${index}`;

        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: { kind: 'search_query', searchId, queryId, query, index, total, status: 'started', actionTitle },
          });
        }

        let results: Array<{ title: string; url: string; content: string; publishedDate: string; favicon: string }> =
          [];

        try {
          const startPublishedDate = startDate ? new Date(startDate).toISOString() : undefined;
          const endPublishedDate = startDate ? new Date().toISOString() : undefined;

          // Exa's current typed category set no longer includes "tweet".
          // For that case, fall back to an unscoped search instead of failing type checks.
          const exaCategory: ExaSearchCategory | undefined = category === 'tweet' ? undefined : category;

          const { results: exaResults } = await exa.search(query, {
            numResults: 6,
            type: 'instant',
            ...(exaCategory && { category: exaCategory }),
            ...(includeDomains && { include_domains: includeDomains }),
            ...(startPublishedDate && { startPublishedDate }),
            ...(endPublishedDate && { endPublishedDate }),
          });

          results = exaResults.map((r) => ({
            title: r.title || '',
            url: r.url,
            content: '',
            publishedDate: r.publishedDate || '',
            favicon: r.favicon || `https://www.google.com/s2/favicons?domain=${new URL(r.url).hostname}&sz=128`,
          }));

          console.log(`${LOG_PREFIX} [search:${searchId}] Query "${query}" -> ${results.length} results`);
        } catch (error) {
          console.error(`${LOG_PREFIX} [search:${searchId}] Exa search error for "${query}":`, error);
        }

        if (dataStream) {
          for (const source of results) {
            dataStream.write({
              type: 'data-build_search',
              data: {
                kind: 'search_source',
                searchId,
                queryId,
                source: { title: source.title, url: source.url, favicon: source.favicon },
              },
            });
          }
        }

        if (results.length > 0) {
          if (dataStream) {
            dataStream.write({
              type: 'data-build_search',
              data: {
                kind: 'search_query',
                searchId,
                queryId,
                query,
                index,
                total,
                status: 'reading_content',
                actionTitle,
              },
            });
          }

          try {
            const urls = results.map((r) => r.url);
            const contentsResponse = await exa.getContents(urls, {
              text: { maxCharacters: 3000, includeHtmlTags: false },
              livecrawl: 'preferred',
            });

            const contentMap = new Map<string, { title: string; content: string }>();
            for (const r of contentsResponse.results) {
              if (r.text?.trim()) {
                contentMap.set(r.url, { title: r.title || '', content: r.text });
              }
            }

            const failedUrls = urls.filter((u) => !contentMap.has(u));
            if (failedUrls.length > 0) {
              const firecrawlTasks = Object.fromEntries(
                failedUrls.map((url, i) => [
                  `fc:${i}`,
                  async () => {
                    try {
                      const fcResult = await firecrawl.scrape(url, { formats: ['markdown'], proxy: 'auto' });
                      if (fcResult.markdown) {
                        return {
                          url,
                          title: fcResult.metadata?.title || '',
                          content: fcResult.markdown.slice(0, 3000),
                        };
                      }
                    } catch {
                      /* skip */
                    }
                    return null;
                  },
                ]),
              );
              const fcResults = await all(firecrawlTasks, getBetterAllOptions());
              for (const key of Object.keys(fcResults)) {
                const r = fcResults[key];
                if (r) contentMap.set(r.url, { title: r.title, content: r.content });
              }
            }

            results = results.map((r) => {
              const enriched = contentMap.get(r.url);
              return enriched ? { ...r, title: enriched.title || r.title, content: enriched.content } : r;
            });

            if (dataStream) {
              for (const r of results) {
                if (r.content) {
                  dataStream.write({
                    type: 'data-build_search',
                    data: {
                      kind: 'search_content',
                      searchId,
                      queryId,
                      content: {
                        title: r.title,
                        url: r.url,
                        text: r.content.slice(0, 500) + (r.content.length > 500 ? '...' : ''),
                        favicon: r.favicon,
                      },
                    },
                  });
                }
              }
            }
          } catch (error) {
            console.error(`${LOG_PREFIX} [search:${searchId}] Content fetch error for "${query}":`, error);
          }
        }

        if (dataStream) {
          dataStream.write({
            type: 'data-build_search',
            data: { kind: 'search_query', searchId, queryId, query, index, total, status: 'completed', actionTitle },
          });
        }

        allSearchResults.push({
          query,
          results: results.map((r) => ({ title: r.title, url: r.url, content: r.content, favicon: r.favicon })),
        });
      }

      console.log(
        `${LOG_PREFIX} [search:${searchId}] Done: ${allSearchResults.reduce((n, s) => n + s.results.length, 0)} total results`,
      );
      return { searches: allSearchResults };
    },
  });
}

function createBoxInitTool(
  dataStream: UIMessageStreamWriter<ChatMessage> | undefined,
  boxManager: BoxManager,
  uploadedFiles: UploadedFileContext[] = [],
  seedWorkspacePath?: string | null,
  seedRemoteRoot = BUILDER_REMOTE_PROJECT_PATH,
) {
  return tool({
    description:
      'Initialize the cloud sandbox with the correct runtime environment. ' +
      'ALWAYS call this as your very first sandbox action. ' +
      'Choose the runtime based on what the user wants to build: ' +
      '"node" for JavaScript/TypeScript, "python" for Python, ' +
      '"golang" for Go, "ruby" for Ruby, "rust" for Rust.',
    inputSchema: z.object({
      runtime: z
        .enum(['node', 'python', 'golang', 'ruby', 'rust'])
        .describe("The runtime environment that best matches the user's task."),
      reason: z.string().describe('One sentence explaining why this runtime was chosen.'),
    }),
    execute: async ({ runtime, reason }, { toolCallId }) => {
      console.log(`${LOG_PREFIX} [init:${toolCallId}] runtime=${runtime} — ${reason}`);
      boxManager.setRuntime(runtime);

      // Eagerly warm up the box so subsequent tools don't wait.
      const box = await boxManager.getBox();

      // Install Bun and fetch uploaded files in parallel — both happen during init so no tokens wasted later
      const downloadedPaths: Array<{ name: string; path: string; mediaType: string }> = [];
      let seededWorkspace = false;

      const installBun = async () => {
        try {
          console.log(`${LOG_PREFIX} [init:${toolCallId}] Installing Bun...`);
          await installBunInBuilderBox(box);
          console.log(`${LOG_PREFIX} [init:${toolCallId}] Bun installed`);
        } catch (err) {
          console.warn(`${LOG_PREFIX} [init:${toolCallId}] Bun install failed (non-fatal):`, err);
        }
      };

      const writeUploadedFiles = async () => {
        if (uploadedFiles.length === 0) return;
        console.log(`${LOG_PREFIX} [init:${toolCallId}] Writing ${uploadedFiles.length} uploaded file(s) into box`);
        const TEXT_TYPES = new Set([
          'text/plain',
          'text/csv',
          'text/html',
          'text/css',
          'text/javascript',
          'text/typescript',
          'text/markdown',
          'application/json',
          'application/xml',
          'application/x-yaml',
          'application/yaml',
        ]);
        await Promise.all(
          uploadedFiles.map(async (file) => {
            const dest = `${BUILDER_BOX_ROOT}/${file.name}`;
            try {
              const response = await fetch(file.url);
              if (!response.ok) throw new Error(`HTTP ${response.status}`);

              const isText = TEXT_TYPES.has(file.mediaType) || file.mediaType.startsWith('text/');

              if (isText) {
                const content = await response.text();
                await box.files.write({ path: dest, content });
              } else {
                // Binary file — write base64 content to a temp file, decode it, then clean up
                const buffer = await response.arrayBuffer();
                const b64 = Buffer.from(buffer).toString('base64');
                const b64Path = `${BUILDER_BOX_ROOT}/_b64_${file.name}`;
                await box.files.write({ path: b64Path, content: b64 });
                await box.exec.command(`base64 -d "${b64Path}" > "${dest}" && rm -f "${b64Path}"`);
              }

              downloadedPaths.push({ name: file.name, path: dest, mediaType: file.mediaType });
              console.log(`${LOG_PREFIX} [init:${toolCallId}] Wrote: ${file.name} → ${dest}`);
            } catch (err) {
              console.error(`${LOG_PREFIX} [init:${toolCallId}] Failed to write ${file.name}:`, err);
            }
          }),
        );
      };

      const seedWorkspace = async () => {
        if (!seedWorkspacePath) return;

        try {
          seededWorkspace = await seedBuilderWorkspace(box, seedWorkspacePath, {
            remoteRoot: seedRemoteRoot,
          });
          console.log(`${LOG_PREFIX} [init:${toolCallId}] Seeded workspace from ${seedWorkspacePath}`);
        } catch (error) {
          console.error(`${LOG_PREFIX} [init:${toolCallId}] Failed to seed workspace:`, error);
        }
      };

      // Run Bun install and file uploads in parallel
      await Promise.all([installBun(), writeUploadedFiles(), seedWorkspace()]);

      const filesNote =
        downloadedPaths.length > 0
          ? `\nUploaded files are available in the sandbox:\n${downloadedPaths.map((f) => `  ${f.path} (${f.mediaType})`).join('\n')}`
          : '';
      const workspaceNote = seededWorkspace
        ? `\nThe imported project workspace is available at ${seedRemoteRoot}.`
        : '';

      if (dataStream) {
        dataStream.write({
          type: 'data-build_search',
          data: {
            kind: 'exec',
            execId: toolCallId,
            command: `# Environment: ${runtime}`,
            status: 'completed',
            stdout: `${reason}\nBox ID: ${box.id}\nBun installed at /usr/local/bin/bun${workspaceNote}${filesNote}`,
          },
        });
      }

      return {
        boxId: box.id,
        runtime,
        message: `Sandbox ready (${runtime}). Bun installed. ${reason}${workspaceNote}${filesNote}`,
        ...(downloadedPaths.length > 0 ? { uploadedFiles: downloadedPaths } : {}),
        ...(seededWorkspace ? { workspacePath: seedRemoteRoot } : {}),
      };
    },
  });
}

export function createBuildTools(
  dataStream: UIMessageStreamWriter<ChatMessage> | undefined,
  userId: string,
  existingBoxId?: string | null,
  uploadedFiles: UploadedFileContext[] = [],
  seedWorkspacePath?: string | null,
  seedRemoteRoot = BUILDER_REMOTE_PROJECT_PATH,
  provider: Exclude<BuilderRuntimeProvider, 'webcontainers'> = 'e2b',
) {
  const boxManager = new BoxManager(userId, existingBoxId, provider, seedWorkspacePath);

  const tools = {
    box_init: createBoxInitTool(dataStream, boxManager, uploadedFiles, seedWorkspacePath, seedRemoteRoot),
    build_web_search: createBuildWebSearchTool(dataStream),
    box_exec: createBoxExecTool(dataStream, boxManager),
    box_write_file: createBoxWriteFileTool(dataStream, boxManager),
    box_download: createBoxDownloadTool(dataStream, boxManager),
    box_code: createBoxCodeTool(dataStream, boxManager),
    box_browse_page: createBrowsePageTool(dataStream),
    ...(boxManager.supportsBoxAgent() ? { box_agent: createBoxAgentTool(dataStream, boxManager, uploadedFiles) } : {}),
  };

  return {
    tools,
    cleanup: () => boxManager.cleanup(),
    getBoxId: () => boxManager.getBoxId(),
    getRuntime: () => boxManager.getRuntime(),
    hasVercelToken: () => boxManager.hasVercelMcp(),
  };
}
