import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadSandboxes, saveSandboxes } from './state.js';
import { isProcessAlive, listListeningPortsForProcess, waitForListeningPortsForProcess } from './system.js';

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function mapDetectedPorts(portRecords = []) {
  const seen = new Set();

  return portRecords
    .filter((record) => Number.isInteger(record.port) && record.port >= 1 && record.port <= 65535)
    .filter((record) => {
      if (seen.has(record.port)) return false;
      seen.add(record.port);
      return true;
    })
    .map((record) => ({
      port: record.port,
      protocol: record.port === 443 || record.port === 8443 ? 'https' : 'http',
      label: record.processName ? `${record.processName} preview` : 'Detected preview',
    }));
}

async function refreshSandboxes(records, options) {
  let changed = false;
  const next = [];

  for (const sandbox of records) {
    if (sandbox.pid && sandbox.status === 'running') {
      const alive = await isProcessAlive(sandbox.pid);
      if (!alive) {
        next.push({
          ...sandbox,
          pid: null,
          status: 'stopped',
          lastStoppedAt: sandbox.lastStoppedAt || new Date().toISOString(),
        });
        changed = true;
        continue;
      }

      const detectedPorts = await listListeningPortsForProcess(sandbox.pid).catch(() => []);
      const nextPorts = mapDetectedPorts(detectedPorts);
      if (JSON.stringify(nextPorts) !== JSON.stringify(sandbox.ports || [])) {
        next.push({
          ...sandbox,
          ports: nextPorts,
          updatedAt: new Date().toISOString(),
        });
        changed = true;
        continue;
      }
    }

    next.push(sandbox);
  }

  if (changed) {
    await saveSandboxes(next, options);
  }

  return next;
}

function getShellParts(command) {
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', command] };
  }

  return { command: process.env.SHELL || 'bash', args: ['-lc', command] };
}

export async function listSandboxesState(options = {}) {
  const loaded = await loadSandboxes(options);
  return await refreshSandboxes(loaded.sandboxes, loaded.__paths || options);
}

export async function createSandboxRecord({ name, rootPath, startCommand, ports = [], metadata = {} }, options = {}) {
  const loaded = await loadSandboxes(options);
  const sandboxes = await refreshSandboxes(loaded.sandboxes, loaded.__paths);
  const slug = slugify(name);

  if (sandboxes.some((sandbox) => sandbox.slug === slug)) {
    throw new Error(`Sandbox "${slug}" already exists.`);
  }

  await mkdir(rootPath, { recursive: true });

  const next = [
    ...sandboxes,
    {
      slug,
      name,
      rootPath,
      startCommand,
      status: 'stopped',
      pid: null,
      ports,
      metadata,
      startCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastStartedAt: null,
      lastStoppedAt: null,
    },
  ];

  await saveSandboxes(next, loaded.__paths);
  return next.find((sandbox) => sandbox.slug === slug);
}

export async function startSandbox(slug, options = {}) {
  const loaded = await loadSandboxes(options);
  const sandboxes = await refreshSandboxes(loaded.sandboxes, loaded.__paths);
  const sandbox = sandboxes.find((item) => item.slug === slug);

  if (!sandbox) {
    throw new Error(`Sandbox "${slug}" not found.`);
  }

  if (!sandbox.startCommand) {
    throw new Error(`Sandbox "${slug}" does not have a start command.`);
  }

  if (sandbox.pid && sandbox.status === 'running' && (await isProcessAlive(sandbox.pid))) {
    return sandbox;
  }

  const shell = getShellParts(sandbox.startCommand);
  const child = spawn(shell.command, shell.args, {
    cwd: sandbox.rootPath,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });

  child.unref();
  const detectedPorts = child.pid ? await waitForListeningPortsForProcess(child.pid, { timeoutMs: 8000 }) : [];
  const mappedPorts = mapDetectedPorts(detectedPorts);

  const next = sandboxes.map((item) =>
    item.slug === slug
      ? {
          ...item,
          pid: child.pid ?? null,
          status: 'running',
          ports: mappedPorts,
          startCount: (item.startCount ?? 0) + 1,
          updatedAt: new Date().toISOString(),
          lastStartedAt: new Date().toISOString(),
        }
      : item,
  );

  await saveSandboxes(next, loaded.__paths);
  return next.find((item) => item.slug === slug);
}

export async function stopSandbox(slug, options = {}) {
  const loaded = await loadSandboxes(options);
  const sandboxes = await refreshSandboxes(loaded.sandboxes, loaded.__paths);
  const sandbox = sandboxes.find((item) => item.slug === slug);

  if (!sandbox) {
    throw new Error(`Sandbox "${slug}" not found.`);
  }

  if (sandbox.pid && (await isProcessAlive(sandbox.pid))) {
    process.kill(sandbox.pid, 'SIGTERM');
  }

  const next = sandboxes.map((item) =>
    item.slug === slug
      ? {
          ...item,
          pid: null,
          status: 'stopped',
          updatedAt: new Date().toISOString(),
          lastStoppedAt: new Date().toISOString(),
        }
      : item,
  );

  await saveSandboxes(next, loaded.__paths);
  return next.find((item) => item.slug === slug);
}

export async function restartSandbox(slug, options = {}) {
  await stopSandbox(slug, options);
  return await startSandbox(slug, options);
}

export async function deleteSandbox(slug, options = {}) {
  const loaded = await loadSandboxes(options);
  const sandboxes = await refreshSandboxes(loaded.sandboxes, loaded.__paths);
  const sandbox = sandboxes.find((item) => item.slug === slug);

  if (!sandbox) {
    throw new Error(`Sandbox "${slug}" not found.`);
  }

  if (sandbox.pid && (await isProcessAlive(sandbox.pid))) {
    process.kill(sandbox.pid, 'SIGTERM');
  }

  const next = sandboxes.filter((item) => item.slug !== slug);
  await saveSandboxes(next, loaded.__paths);

  return sandbox;
}
