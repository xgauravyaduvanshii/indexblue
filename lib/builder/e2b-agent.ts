import 'server-only';

import { withNativeFetch } from '@/lib/builder/e2b-fetch';
import { isCommandExitError } from '@/lib/builder/e2b-sdk';
import { BUILDER_BOX_ROOT, BUILDER_REMOTE_PROJECT_PATH } from '@/lib/builder/paths';

type E2BCommandHandle = import('@e2b/code-interpreter').CommandHandle;
type E2BSandbox = import('@e2b/code-interpreter').Sandbox;

type BuilderAgentChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; toolName: string; input: Record<string, unknown> }
  | {
      type: 'finish';
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
      };
    };

export type BuilderAgentRun = AsyncIterable<BuilderAgentChunk> & {
  result?: string;
  status?: string;
  cost?: {
    inputTokens?: number;
    outputTokens?: number;
    totalUsd?: number;
    computeMs?: number;
  };
};

type QueueItem = { done: false; value: BuilderAgentChunk } | { done: true; value: undefined } | { error: Error };

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function createAsyncQueue() {
  const items: QueueItem[] = [];
  const resolvers: Array<(item: QueueItem) => void> = [];

  return {
    push(item: QueueItem) {
      const nextResolver = resolvers.shift();
      if (nextResolver) {
        nextResolver(item);
        return;
      }
      items.push(item);
    },
    async next() {
      const nextItem = items.shift();
      if (nextItem) return nextItem;
      return await new Promise<QueueItem>((resolve) => {
        resolvers.push(resolve);
      });
    },
  };
}

function extractToolCall(line: string) {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;

    if (parsed.type === 'tool_call' && parsed.subtype === 'completed') {
      const toolCall = parsed.tool_call;
      if (toolCall && typeof toolCall === 'object') {
        const [toolName, toolPayload] = Object.entries(toolCall as Record<string, unknown>)[0] ?? [];
        if (toolName) {
          const input =
            toolPayload && typeof toolPayload === 'object' && 'args' in (toolPayload as Record<string, unknown>)
              ? (((toolPayload as Record<string, unknown>).args as Record<string, unknown> | undefined) ?? {})
              : {};
          return { toolName, input };
        }
      }
    }

    if (Array.isArray((parsed.message as { content?: unknown[] } | undefined)?.content)) {
      const blocks = ((parsed.message as { content?: unknown[] }).content ?? []) as Array<Record<string, unknown>>;
      return blocks
        .filter((block) => block.type === 'tool_use' && typeof block.name === 'string')
        .map((block) => ({
          toolName: block.name as string,
          input: (block.input as Record<string, unknown> | undefined) ?? {},
        }));
    }
  } catch {
    return null;
  }

  return null;
}

function extractTextDelta(line: string) {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;

    if (parsed.type === 'content_block_delta') {
      const delta = parsed.delta as Record<string, unknown> | undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        return delta.text;
      }
    }

    if (parsed.type === 'text' && typeof parsed.text === 'string') {
      return parsed.text;
    }

    if (parsed.type === 'assistant') {
      const blocks = ((parsed.message as { content?: unknown[] } | undefined)?.content ?? []) as Array<
        Record<string, unknown>
      >;
      return blocks
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('');
    }
  } catch {
    return line.trim().length > 0 ? line : null;
  }

  return null;
}

function extractFinishData(line: string) {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (parsed.type !== 'result') return null;

    const usage = parsed.usage as Record<string, unknown> | undefined;
    return {
      status: typeof parsed.status === 'string' ? parsed.status : 'completed',
      result: typeof parsed.result === 'string' ? parsed.result : '',
      usage: {
        inputTokens:
          typeof usage?.input_tokens === 'number'
            ? usage.input_tokens
            : typeof usage?.inputTokens === 'number'
              ? usage.inputTokens
              : undefined,
        outputTokens:
          typeof usage?.output_tokens === 'number'
            ? usage.output_tokens
            : typeof usage?.outputTokens === 'number'
              ? usage.outputTokens
              : undefined,
      },
    };
  } catch {
    return null;
  }
}

function buildE2BAgentCommand(prompt: string) {
  const promptBase64 = Buffer.from(prompt, 'utf8').toString('base64');
  const anthropicBaseUrl = process.env.ANTHROPIC_API_KEY
    ? process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    : 'https://openrouter.ai/api/v1';

  const lines = [
    'set -e',
    'PROMPT_B64=' + shellEscape(promptBase64),
    'if command -v claude >/dev/null 2>&1 && [ -n "${ANTHROPIC_API_KEY:-}" ]; then',
    `  export ANTHROPIC_BASE_URL=${shellEscape(anthropicBaseUrl)}`,
    '  printf "%s" "$PROMPT_B64" | base64 -d | claude -p --output-format stream-json --verbose --dangerously-skip-permissions',
    'elif command -v gemini >/dev/null 2>&1 && [ -n "${GEMINI_API_KEY:-}" ]; then',
    '  printf "%s" "$PROMPT_B64" | base64 -d | gemini --output-format stream-json --yolo',
    'elif command -v cursor-agent >/dev/null 2>&1 && [ -n "${CURSOR_AGENT_API_KEY:-}" ]; then',
    '  printf "%s" "$PROMPT_B64" | base64 -d | cursor-agent --api-key "$CURSOR_AGENT_API_KEY" -p --output-format stream-json --force --model auto',
    'else',
    `  echo ${shellEscape(
      JSON.stringify({
        type: 'result',
        status: 'error',
        result:
          'No supported AI CLI is available inside the E2B template for box_agent. Install claude, gemini, or cursor-agent in the template to use this tool.',
      }),
    )}`,
    '  exit 1',
    'fi',
  ];

  return lines.join('\n');
}

export async function createE2BAgentRun({
  sandbox,
  prompt,
}: {
  sandbox: E2BSandbox;
  prompt: string;
}): Promise<{ run: BuilderAgentRun; cancel: () => Promise<void> }> {
  const cwd = (await withNativeFetch(() => sandbox.files.exists(BUILDER_REMOTE_PROJECT_PATH)).catch(() => false))
    ? BUILDER_REMOTE_PROJECT_PATH
    : BUILDER_BOX_ROOT;
  const queue = createAsyncQueue();

  let bufferedStdout = '';
  let fullText = '';
  let finalStatus = 'completed';
  let finalResult = '';
  const finalUsage: { inputTokens?: number; outputTokens?: number } = {};

  const flushStdoutLines = (force = false) => {
    const lines = bufferedStdout.split('\n');
    if (!force) {
      bufferedStdout = lines.pop() ?? '';
    } else {
      bufferedStdout = '';
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const textDelta = extractTextDelta(line);
      if (textDelta) {
        fullText += textDelta;
        queue.push({ done: false, value: { type: 'text-delta', text: textDelta } });
      }

      const toolCall = extractToolCall(line);
      if (Array.isArray(toolCall)) {
        for (const entry of toolCall) {
          queue.push({ done: false, value: { type: 'tool-call', toolName: entry.toolName, input: entry.input } });
        }
      } else if (toolCall) {
        queue.push({
          done: false,
          value: { type: 'tool-call', toolName: toolCall.toolName, input: toolCall.input },
        });
      }

      const finish = extractFinishData(line);
      if (finish) {
        finalStatus = finish.status;
        finalResult = finish.result;
        if (finish.usage.inputTokens != null) finalUsage.inputTokens = finish.usage.inputTokens;
        if (finish.usage.outputTokens != null) finalUsage.outputTokens = finish.usage.outputTokens;
      }
    }
  };

  const handle = (await withNativeFetch(() =>
    sandbox.commands.run(buildE2BAgentCommand(prompt), {
      background: true,
      cwd,
      timeoutMs: 0,
      requestTimeoutMs: 900_000,
      onStdout(data) {
        bufferedStdout += data;
        flushStdoutLines(false);
      },
    }),
  )) as E2BCommandHandle;

  const complete = async () => {
    try {
      await withNativeFetch(() => handle.wait());
    } catch (error) {
      if (isCommandExitError(error)) {
        finalStatus = 'error';
        if (!finalResult) {
          finalResult = error.stderr || error.stdout || error.message;
        }
      } else {
        queue.push({
          error: error instanceof Error ? error : new Error('E2B builder agent failed unexpectedly.'),
        });
        return;
      }
    }

    flushStdoutLines(true);

    if (!finalResult) {
      finalResult = fullText.trim();
    }

    queue.push({
      done: false,
      value: {
        type: 'finish',
        usage: finalUsage,
      },
    });
    queue.push({ done: true, value: undefined });
  };

  void complete();

  const run: BuilderAgentRun = {
    status: finalStatus,
    result: finalResult,
    cost: finalUsage,
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          const item = await queue.next();
          if ('error' in item) {
            throw item.error;
          }

          if (item.done) {
            run.status = finalStatus;
            run.result = finalResult;
            run.cost = finalUsage;
          }

          return item;
        },
      };
    },
  };

  return {
    run,
    cancel: async () => {
      finalStatus = 'error';
      await withNativeFetch(() => handle.kill()).catch(() => undefined);
    },
  };
}
