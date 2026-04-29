import os from 'node:os';
import { WebSocket } from 'undici';
import { ensureMachineId, getStoredApiKey, getStoredSudoPassword, loadConfig, saveConfig, setStoredSudoPassword } from './state.js';
import { listSandboxesState, createSandboxRecord, deleteSandbox, restartSandbox, startSandbox, stopSandbox } from './sandboxes.js';
import {
  collectMachineInfo,
  collectMachineProfile,
  collectMetrics,
  copyPath,
  deletePath,
  fetchLocalPreview,
  getSudoStatus,
  listDirectory,
  listLikelyPreviewTargets,
  listProcesses,
  makeDirectory,
  movePath,
  readFilePayload,
  runStreamingShellCommand,
  writeFilePayload,
} from './system.js';
import {
  openTunnelEventStream,
  pullInfraCommand,
  pushTunnelMessage,
  readInfraCommandStatus,
  registerInfra,
  sendHeartbeat,
  updateInfraCommand,
} from './platform-client.js';

const PREVIEW_TUNNEL_RETRY_MS = 1500;
const COMMAND_CANCEL_POLL_MS = 900;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopChildProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode) {
    return;
  }

  try {
    child.kill('SIGTERM');
  } catch {
    return;
  }

  const hardKillTimer = setTimeout(() => {
    if (child.exitCode !== null || child.signalCode) {
      return;
    }

    try {
      child.kill('SIGKILL');
    } catch {
      // Ignore hard-kill failures.
    }
  }, 1500);
  hardKillTimer.unref?.();
}

function normalizeTunnelPath(pathname, search = '') {
  const normalizedPath = typeof pathname === 'string' && pathname.startsWith('/') ? pathname : `/${pathname || ''}`;
  if (!search) return normalizedPath;
  return search.startsWith('?') ? `${normalizedPath}${search}` : `${normalizedPath}?${search}`;
}

function normalizeTunnelHeaders(headers) {
  const allowedHeaders = new Set(['origin', 'user-agent']);
  const result = {};

  if (!headers || typeof headers !== 'object') {
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    const normalized = String(key).toLowerCase();
    if (!allowedHeaders.has(normalized) || typeof value !== 'string' || value.length === 0) {
      continue;
    }

    result[normalized] = value;
  }

  return result;
}

function parseSseBuffer(buffer) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const remainder = blocks.pop() ?? '';
  const events = [];

  for (const block of blocks) {
    const payload = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart())
      .join('\n');

    if (payload.length > 0) {
      events.push(payload);
    }
  }

  return {
    events,
    remainder,
  };
}

async function encodeTunnelMessageData(data) {
  if (typeof data === 'string') {
    return {
      data,
      isBinary: false,
    };
  }

  if (data instanceof ArrayBuffer) {
    return {
      data: Buffer.from(data).toString('base64'),
      isBinary: true,
    };
  }

  if (ArrayBuffer.isView(data)) {
    return {
      data: Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64'),
      isBinary: true,
    };
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const buffer = Buffer.from(await data.arrayBuffer());
    return {
      data: buffer.toString('base64'),
      isBinary: true,
    };
  }

  return {
    data: Buffer.from(String(data)).toString('utf8'),
    isBinary: false,
  };
}

function decodeTunnelMessageData(event) {
  if (!event?.isBinary) {
    return String(event?.data ?? '');
  }

  return Buffer.from(String(event.data || ''), 'base64');
}

async function runPreviewTunnelLoop({
  baseUrl,
  apiKey,
  infraId,
  signal,
}) {
  const sessions = new Map();
  const decoder = new TextDecoder();

  async function closeLocalSession(sessionId, code = 1000, reason = 'Preview tunnel session closed.') {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    sessions.delete(sessionId);
    session.closing = true;
    if (session.socket && session.socket.readyState === WebSocket.OPEN) {
      try {
        session.socket.close(code, reason);
      } catch {
        // Ignore local close errors.
      }
    } else if (session.socket && session.socket.readyState === WebSocket.CONNECTING) {
      try {
        session.socket.close(code, reason);
      } catch {
        // Ignore local close errors.
      }
    }
  }

  async function sendTunnelUpdate(payload) {
    try {
      await pushTunnelMessage(baseUrl, apiKey, {
        infraId,
        ...payload,
      });
    } catch {
      // Let the stream reconnect loop recover on its own.
    }
  }

  async function openLocalPreviewSocket(event) {
    const existing = sessions.get(event.sessionId);
    if (existing?.socket && (existing.socket.readyState === WebSocket.OPEN || existing.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const session = existing || {
      socket: null,
      queuedMessages: [],
      closing: false,
    };
    sessions.set(event.sessionId, session);
    session.closing = false;

    const headers = normalizeTunnelHeaders(event.headers);
    const targetPath = normalizeTunnelPath(event.pathname, event.search);
    const candidates = ['ws', 'wss'];
    let lastError = null;

    for (const candidateProtocol of candidates) {
      try {
        const socket = await new Promise((resolve, reject) => {
          const ws = new WebSocket(`${
            candidateProtocol
          }://127.0.0.1:${event.port}${targetPath}`, {
            protocols: Array.isArray(event.protocols) ? event.protocols : [],
            headers,
          });
          let opened = false;

          ws.binaryType = 'arraybuffer';
          ws.addEventListener('open', () => {
            opened = true;
            resolve(ws);
          });
          ws.addEventListener('error', () => {
            if (!opened) {
              reject(new Error(`Failed to connect to local preview websocket on port ${event.port}.`));
            }
          });
          ws.addEventListener('close', (closeEvent) => {
            if (!opened) {
              reject(
                new Error(
                  closeEvent.reason || `Preview websocket closed before opening with code ${closeEvent.code}.`,
                ),
              );
            }
          });
        });

        session.socket = socket;

        socket.addEventListener('message', (messageEvent) => {
          void encodeTunnelMessageData(messageEvent.data)
            .then((payload) =>
              sendTunnelUpdate({
                sessionId: event.sessionId,
                type: 'message',
                ...payload,
              }),
            )
            .catch(() =>
              sendTunnelUpdate({
                sessionId: event.sessionId,
                type: 'error',
                message: 'Failed to encode a local preview websocket message.',
              }),
            );
        });

        socket.addEventListener('error', () => {
          if (session.closing) {
            return;
          }

          void sendTunnelUpdate({
            sessionId: event.sessionId,
            type: 'error',
            message: 'Local preview websocket emitted an error.',
          });
        });

        socket.addEventListener('close', (closeEvent) => {
          sessions.delete(event.sessionId);
          if (session.closing) {
            return;
          }

          void sendTunnelUpdate({
            sessionId: event.sessionId,
            type: 'close',
            code: closeEvent.code,
            reason: closeEvent.reason,
          });
        });

        await sendTunnelUpdate({
          sessionId: event.sessionId,
          type: 'open',
          protocol: socket.protocol || candidateProtocol,
        });

        while (session.queuedMessages.length > 0) {
          const nextMessage = session.queuedMessages.shift();
          if (!nextMessage) {
            continue;
          }

          socket.send(decodeTunnelMessageData(nextMessage));
        }

        return;
      } catch (error) {
        lastError = error;
      }
    }

    sessions.delete(event.sessionId);
    await sendTunnelUpdate({
      sessionId: event.sessionId,
      type: 'error',
      message: lastError instanceof Error ? lastError.message : 'Failed to open the local preview websocket.',
    });
    await sendTunnelUpdate({
      sessionId: event.sessionId,
      type: 'close',
      code: 1011,
      reason: 'Unable to connect to the local preview websocket.',
    });
  }

  async function forwardBrowserMessage(event) {
    const session = sessions.get(event.sessionId) || {
      socket: null,
      queuedMessages: [],
      closing: false,
    };
    if (!sessions.has(event.sessionId)) {
      sessions.set(event.sessionId, session);
    }

    if (!session.socket || session.socket.readyState === WebSocket.CONNECTING) {
      session.queuedMessages.push(event);
      return;
    }

    if (session.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Preview websocket is not open on the connected machine.');
    }

    session.socket.send(decodeTunnelMessageData(event));
  }

  try {
    while (!signal.aborted) {
      let response;

      try {
        response = await openTunnelEventStream(baseUrl, apiKey, infraId, signal);
      } catch {
        if (signal.aborted) break;
        await sleep(PREVIEW_TUNNEL_RETRY_MS);
        continue;
      }

      if (!response.ok || !response.body) {
        if (signal.aborted) break;
        await sleep(PREVIEW_TUNNEL_RETRY_MS);
        continue;
      }

      let buffer = '';
      const reader = response.body.getReader();

      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseBuffer(buffer);
          buffer = parsed.remainder;

          for (const rawEvent of parsed.events) {
            let event;
            try {
              event = JSON.parse(rawEvent);
            } catch {
              continue;
            }

            if (!event?.type || !event?.sessionId) {
              continue;
            }

            if (event.type === 'open') {
              await openLocalPreviewSocket(event);
              continue;
            }

            if (event.type === 'client-message') {
              try {
                await forwardBrowserMessage(event);
              } catch (error) {
                await sendTunnelUpdate({
                  sessionId: event.sessionId,
                  type: 'error',
                  message: error instanceof Error ? error.message : 'Failed to forward preview websocket message.',
                });
              }
              continue;
            }

            if (event.type === 'close') {
              await closeLocalSession(event.sessionId, event.code, event.reason);
            }
          }
        }
      } catch {
        if (!signal.aborted) {
          await sleep(PREVIEW_TUNNEL_RETRY_MS);
        }
      } finally {
        reader.releaseLock();
      }
    }
  } finally {
    const activeSessionIds = Array.from(sessions.keys());
    for (const sessionId of activeSessionIds) {
      await closeLocalSession(sessionId, 1001, 'Preview tunnel agent stopped.');
    }
  }
}

async function getAgentWorkingDirectory(options = {}) {
  const config = ensureMachineId(await loadConfig(options));
  return config.workingDirectory || process.cwd();
}

async function getAgentMachineMetadata(options = {}, activePreviews = []) {
  const config = ensureMachineId(await loadConfig(options));
  const sudo = await getSudoStatus();
  const machineProfile = await collectMachineProfile();

  return {
    shell: process.env.SHELL || null,
    cwd: config.workingDirectory || process.cwd(),
    machineLabel: config.machineName || os.hostname(),
    ipAddress: machineProfile.primaryPrivateIp,
    publicIp: machineProfile.publicIp,
    privateIpAddresses: machineProfile.privateIpAddresses,
    privateIpEntries: machineProfile.privateIpEntries,
    systemVendor: machineProfile.systemVendor,
    productName: machineProfile.productName,
    cpuModel: machineProfile.cpuModel,
    cpuArchitecture: machineProfile.cpuArchitecture,
    cpuLogicalCores: machineProfile.cpuLogicalCores,
    cpuSpeedMHz: machineProfile.cpuSpeedMHz,
    memoryTotalBytes: machineProfile.memoryTotalBytes,
    gpuDevices: machineProfile.gpuDevices,
    sudoAvailable: sudo.available,
    sudoPasswordless: sudo.passwordless,
    sudoIsRoot: sudo.isRoot,
    storedSudoPassword: Boolean(getStoredSudoPassword(config)),
    activePreviews,
  };
}

async function collectAgentState(options = {}) {
  const sandboxes = await listSandboxesState(options);
  const processes = await listProcesses();
  const activePreviews = await listLikelyPreviewTargets();
  const metrics = {
    ...(await collectMetrics({ sandboxCount: sandboxes.length })),
    processCount: processes.length,
    sandboxCount: sandboxes.length,
  };

  return {
    activePreviews,
    metrics,
    processes,
    sandboxes,
  };
}

async function pushCommandUpdate({ baseUrl, apiKey, commandId, infraId, payload }) {
  return await updateInfraCommand(baseUrl, apiKey, commandId, {
    infraId,
    ...payload,
  });
}

async function executePlatformCommand({
  baseUrl,
  apiKey,
  infraId,
  command,
  options,
}) {
  let sequence = 0;
  let totalDataTransferred = 0;
  let totalFsOps = 0;

  const emit = async (stream, message) => {
    sequence += 1;
    totalDataTransferred += Buffer.byteLength(message, 'utf8');
    await pushCommandUpdate({
      baseUrl,
      apiKey,
      commandId: command.id,
      infraId,
      payload: {
        status: 'running',
        events: [{ stream, message, sequence }],
      },
    });
  };

  const finalize = async ({ result = {}, errorMessage = null, status = 'completed' }) => {
    const state = await collectAgentState(options);
    const metadata = await getAgentMachineMetadata(options, state.activePreviews);

    await pushCommandUpdate({
      baseUrl,
      apiKey,
      commandId: command.id,
      infraId,
      payload: {
        status,
        result,
        errorMessage,
        totalDataTransferred,
        totalFsOps,
        metrics: state.metrics,
        processes: state.processes,
        sandboxes: state.sandboxes,
        metadata,
      },
    });

    return { result, errorMessage, disconnect: command.type === 'infra:disconnect' && !errorMessage };
  };

  try {
    switch (command.type) {
      case 'exec': {
        const commandText = command.payload.command;
        if (!commandText || typeof commandText !== 'string') {
          return await finalize({ errorMessage: 'Missing command payload.', status: 'failed' });
        }

        const defaultCwd = await getAgentWorkingDirectory(options);
        const config = ensureMachineId(await loadConfig(options));
        const sudoPassword = getStoredSudoPassword(config) || process.env.INDEXCLI_SUDO_PASSWORD || undefined;
        let childProcess = null;
        let cancellation = null;
        const cancellationState = {
          done: false,
          requested: false,
        };

        const cancellationPoller = (async () => {
          while (!cancellationState.done) {
            await sleep(COMMAND_CANCEL_POLL_MS);
            if (cancellationState.done) {
              break;
            }

            const statusPayload = await readInfraCommandStatus(baseUrl, apiKey, command.id, infraId).catch(() => null);
            if (statusPayload?.command?.status !== 'cancelled') {
              continue;
            }

            cancellation = statusPayload.command;
            cancellationState.requested = true;
            if (childProcess) {
              stopChildProcess(childProcess);
            }
            break;
          }
        })();

        const execution = await runStreamingShellCommand(commandText, {
          cwd: typeof command.payload.cwd === 'string' ? command.payload.cwd : defaultCwd,
          sudo: Boolean(command.payload.sudo),
          sudoPassword,
          onProcess: (child) => {
            childProcess = child;
            if (cancellationState.requested) {
              stopChildProcess(child);
            }
          },
          onStdout: (chunk) => {
            void emit('stdout', chunk);
          },
          onStderr: (chunk) => {
            void emit('stderr', chunk);
          },
        });
        cancellationState.done = true;
        await cancellationPoller;

        if (cancellation) {
          return await finalize({
            status: 'cancelled',
            errorMessage: cancellation.errorMessage || 'Command cancelled by dashboard.',
            result: {
              ...execution,
              cancelled: true,
            },
          });
        }

        return await finalize({
          status: execution.exitCode === 0 ? 'completed' : 'failed',
          errorMessage: execution.exitCode === 0 ? null : `Command exited with code ${execution.exitCode}.`,
          result: execution,
        });
      }

      case 'preview:fetch': {
        const previewInput = command.payload.preview || {};
        const port = Number(previewInput.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return await finalize({ errorMessage: 'Preview port is required.', status: 'failed' });
        }

        const preview = await fetchLocalPreview({
          port,
          protocol: previewInput.protocol === 'https' ? 'https' : 'http',
          method: typeof previewInput.method === 'string' ? previewInput.method : 'GET',
          pathname: typeof previewInput.pathname === 'string' ? previewInput.pathname : '/',
          search: typeof previewInput.search === 'string' ? previewInput.search : '',
          headers:
            previewInput.headers && typeof previewInput.headers === 'object'
              ? Object.fromEntries(
                  Object.entries(previewInput.headers).filter((entry) => typeof entry[1] === 'string'),
                )
              : {},
          bodyBase64: typeof previewInput.bodyBase64 === 'string' ? previewInput.bodyBase64 : undefined,
        });
        totalDataTransferred += preview.bodySize ?? 0;

        return await finalize({
          result: preview,
        });
      }

      case 'sudo:configure': {
        if (command.payload.forcePasswordless === true) {
          return await finalize({
            status: 'failed',
            errorMessage: 'Force passwordless sudo is not supported through IndexBlue for host safety.',
          });
        }

        let config = ensureMachineId(await loadConfig(options));
        if (command.payload.clearStoredPassword === true) {
          config = setStoredSudoPassword(config, '', {});
        } else if (command.payload.rememberPassword === true && typeof command.payload.password === 'string') {
          config = setStoredSudoPassword(config, command.payload.password, {});
        }
        await saveConfig(config, options);

        return await finalize({
          result: {
            storedSudoPassword: Boolean(getStoredSudoPassword(config)),
          },
        });
      }

      case 'fs:list': {
        const targetPath = typeof command.payload.path === 'string' ? command.payload.path : process.cwd();
        const entries = await listDirectory(targetPath);
        totalFsOps += 1;
        return await finalize({ result: { path: targetPath, entries } });
      }

      case 'fs:read': {
        const targetPath = command.payload.path;
        if (!targetPath || typeof targetPath !== 'string') {
          return await finalize({ errorMessage: 'Missing file path.', status: 'failed' });
        }
        const file = await readFilePayload(targetPath);
        totalFsOps += 1;
        totalDataTransferred += file.size;
        return await finalize({ result: file });
      }

      case 'fs:write': {
        const targetPath = command.payload.path;
        if (!targetPath || typeof targetPath !== 'string') {
          return await finalize({ errorMessage: 'Missing file path.', status: 'failed' });
        }
        const result = await writeFilePayload(
          targetPath,
          String(command.payload.content ?? ''),
          command.payload.contentEncoding === 'base64' ? 'base64' : 'utf8',
        );
        totalFsOps += 1;
        return await finalize({ result });
      }

      case 'fs:delete': {
        const targetPath = command.payload.path;
        if (!targetPath || typeof targetPath !== 'string') {
          return await finalize({ errorMessage: 'Missing path.', status: 'failed' });
        }
        const result = await deletePath(targetPath, Boolean(command.payload.recursive));
        totalFsOps += 1;
        return await finalize({ result });
      }

      case 'fs:mkdir': {
        const targetPath = command.payload.path;
        if (!targetPath || typeof targetPath !== 'string') {
          return await finalize({ errorMessage: 'Missing directory path.', status: 'failed' });
        }
        const result = await makeDirectory(targetPath);
        totalFsOps += 1;
        return await finalize({ result });
      }

      case 'fs:move': {
        const sourcePath = command.payload.path;
        const targetPath = command.payload.targetPath;
        if (!sourcePath || !targetPath || typeof sourcePath !== 'string' || typeof targetPath !== 'string') {
          return await finalize({ errorMessage: 'Missing source or target path.', status: 'failed' });
        }
        const result = await movePath(sourcePath, targetPath);
        totalFsOps += 1;
        return await finalize({ result });
      }

      case 'fs:copy': {
        const sourcePath = command.payload.path;
        const targetPath = command.payload.targetPath;
        if (!sourcePath || !targetPath || typeof sourcePath !== 'string' || typeof targetPath !== 'string') {
          return await finalize({ errorMessage: 'Missing source or target path.', status: 'failed' });
        }
        const result = await copyPath(sourcePath, targetPath);
        totalFsOps += 1;
        return await finalize({ result });
      }

      case 'sandbox:list': {
        const sandboxes = await listSandboxesState(options);
        return await finalize({ result: { sandboxes } });
      }

      case 'sandbox:create': {
        const sandboxInput = command.payload.sandbox || {};
        if (!sandboxInput.name || !sandboxInput.rootPath) {
          return await finalize({ errorMessage: 'Sandbox name and rootPath are required.', status: 'failed' });
        }
        const sandbox = await createSandboxRecord(
          {
            name: sandboxInput.name,
            rootPath: sandboxInput.rootPath,
            startCommand: sandboxInput.startCommand || null,
            ports: Array.isArray(sandboxInput.ports) ? sandboxInput.ports : [],
            metadata: sandboxInput.metadata || {},
          },
          options,
        );
        return await finalize({ result: { sandbox } });
      }

      case 'sandbox:start': {
        const slug = command.payload.sandbox?.slug || command.payload.sandbox?.name;
        if (!slug || typeof slug !== 'string') {
          return await finalize({ errorMessage: 'Sandbox slug is required.', status: 'failed' });
        }
        const sandbox = await startSandbox(slug, options);
        return await finalize({ result: { sandbox } });
      }

      case 'sandbox:stop': {
        const slug = command.payload.sandbox?.slug || command.payload.sandbox?.name;
        if (!slug || typeof slug !== 'string') {
          return await finalize({ errorMessage: 'Sandbox slug is required.', status: 'failed' });
        }
        const sandbox = await stopSandbox(slug, options);
        return await finalize({ result: { sandbox } });
      }

      case 'sandbox:restart': {
        const slug = command.payload.sandbox?.slug || command.payload.sandbox?.name;
        if (!slug || typeof slug !== 'string') {
          return await finalize({ errorMessage: 'Sandbox slug is required.', status: 'failed' });
        }
        const sandbox = await restartSandbox(slug, options);
        return await finalize({ result: { sandbox } });
      }

      case 'sandbox:delete': {
        const slug = command.payload.sandbox?.slug || command.payload.sandbox?.name;
        if (!slug || typeof slug !== 'string') {
          return await finalize({ errorMessage: 'Sandbox slug is required.', status: 'failed' });
        }
        const sandbox = await deleteSandbox(slug, options);
        return await finalize({ result: { sandbox } });
      }

      case 'infra:stop': {
        const sandboxes = await listSandboxesState(options);
        for (const sandbox of sandboxes.filter((item) => item.status === 'running')) {
          await stopSandbox(sandbox.slug, options);
        }
        return await finalize({ result: { stopped: true } });
      }

      case 'infra:restart': {
        const sandboxes = await listSandboxesState(options);
        for (const sandbox of sandboxes.filter((item) => item.status === 'running')) {
          await restartSandbox(sandbox.slug, options);
        }
        return await finalize({ result: { restarted: true } });
      }

      case 'infra:disconnect': {
        return await finalize({ result: { disconnected: true } });
      }

      default:
        return await finalize({ errorMessage: `Unsupported command type "${command.type}".`, status: 'failed' });
    }
  } catch (error) {
    return await finalize({
      errorMessage: error instanceof Error ? error.message : 'Unexpected command error.',
      status: 'failed',
    });
  }
}

export async function runInfraAgent({ machineName, baseUrl, pathOptions = {} } = {}) {
  let config = ensureMachineId(await loadConfig(pathOptions));
  const apiKey = getStoredApiKey(config);

  if (!apiKey) {
    throw new Error('Not logged in. Run "indexcli login --key <API_KEY>" first.');
  }

  config.apiBaseUrl = baseUrl || config.apiBaseUrl;
  config.machineName = machineName || config.machineName || os.hostname();
  config = await saveConfig(config, pathOptions);

  const initialState = await collectAgentState(pathOptions);
  const initialWorkingDirectory = await getAgentWorkingDirectory(pathOptions);
  const initialMetadata = await getAgentMachineMetadata(pathOptions, initialState.activePreviews);
  const registration = await registerInfra(config.apiBaseUrl, apiKey, {
    ...collectMachineInfo({
      machineName: config.machineName,
      machineId: config.machineId,
    }),
    latencyMs: 0,
    metrics: initialState.metrics,
    processes: initialState.processes,
    sandboxes: initialState.sandboxes,
    metadata: {
      ...initialMetadata,
      cwd: initialWorkingDirectory,
      machineLabel: config.machineName,
    },
  });

  config.infraId = registration.infra.id;
  await saveConfig(config, pathOptions);
  const tunnelAbortController = new AbortController();
  const tunnelTask = runPreviewTunnelLoop({
    baseUrl: config.apiBaseUrl,
    apiKey,
    infraId: config.infraId,
    signal: tunnelAbortController.signal,
  }).catch(() => undefined);

  try {
    while (true) {
      const heartbeatState = await collectAgentState(pathOptions);
      const workingDirectory = await getAgentWorkingDirectory(pathOptions);
      const metadata = await getAgentMachineMetadata(pathOptions, heartbeatState.activePreviews);
      await sendHeartbeat(config.apiBaseUrl, apiKey, {
        infraId: config.infraId,
        latencyMs: 0,
        metrics: heartbeatState.metrics,
        processes: heartbeatState.processes,
        sandboxes: heartbeatState.sandboxes,
        metadata: {
          ...metadata,
          cwd: workingDirectory,
          machineLabel: config.machineName,
        },
      });

      const pulled = await pullInfraCommand(config.apiBaseUrl, apiKey, {
        infraId: config.infraId,
        waitMs: 15000,
      });

      if (!pulled.command) {
        continue;
      }

      const execution = await executePlatformCommand({
        baseUrl: config.apiBaseUrl,
        apiKey,
        infraId: config.infraId,
        command: pulled.command,
        options: pathOptions,
      });

      if (execution.disconnect) {
        config.infraId = null;
        await saveConfig(config, pathOptions);
        break;
      }
    }
  } finally {
    tunnelAbortController.abort();
    await tunnelTask;
  }
}
