import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CLI_VERSION } from './metadata.js';

const SHELL_BUILTINS = new Set([
  'alias',
  'declare',
  'exec',
  'export',
  'getopts',
  'readonly',
  'set',
  'shift',
  'source',
  'trap',
  'unalias',
  'unset',
]);

const COMMON_PREVIEW_PORTS = new Set([3000, 3001, 4173, 4200, 4321, 5000, 5173, 5174, 6006, 8000, 8080, 8787, 9000]);
const PREVIEW_COMMAND_HINT = /(next|vite|astro|nuxt|svelte|storybook|webpack|parcel|react-scripts|http-server|serve|uvicorn|gunicorn|python\s+-m\s+http\.server|npm\s+run\s+(dev|start|preview)|pnpm\s+run\s+(dev|start|preview)|yarn\s+(dev|start|preview)|bun\s+(dev|start|preview))/i;
const MACHINE_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

let machineProfileCache = {
  value: null,
  expiresAt: 0,
  pending: null,
};

function getShell() {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c'],
      interactiveArgs: [],
    };
  }

  return {
    command: process.env.SHELL || 'bash',
    args: ['-lc'],
    interactiveArgs: ['-l'],
  };
}

function isRootUser() {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

function quoteShellArg(value) {
  if (value.length === 0) {
    return "''";
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildShellExecutionCommand(command) {
  if (process.platform === 'win32') {
    return command;
  }

  return [
    'export PATH="$HOME/.local/bin:$HOME/bin:$HOME/.volta/bin:${PNPM_HOME:+$PNPM_HOME:}$PATH"',
    'if [ -f "$HOME/.profile" ]; then source "$HOME/.profile" >/dev/null 2>&1; fi',
    'if [ -f "$HOME/.bash_profile" ]; then source "$HOME/.bash_profile" >/dev/null 2>&1; fi',
    'if [ -f "$HOME/.bashrc" ]; then source "$HOME/.bashrc" >/dev/null 2>&1; fi',
    'if [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; fi',
    'if [ -s "$HOME/.asdf/asdf.sh" ]; then source "$HOME/.asdf/asdf.sh" >/dev/null 2>&1; fi',
    'for __indexcli_node_bin in "$HOME"/.nvm/versions/node/*/bin; do',
    '  if [ -d "$__indexcli_node_bin" ]; then',
    '    export PATH="$__indexcli_node_bin:$PATH"',
    '  fi',
    'done',
    command,
  ].join('\n');
}

export function buildShellCommand(args) {
  return args.map((arg) => quoteShellArg(String(arg))).join(' ');
}

function normalizeStdio(stdio, stdinText) {
  if (stdinText !== undefined && stdio === 'inherit') {
    return ['pipe', 'inherit', 'inherit'];
  }

  return stdio;
}

async function spawnProcess(command, args, { cwd, env, stdio = 'pipe', stdinText } = {}) {
  const resolvedStdio = normalizeStdio(stdio, stdinText);

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: env || process.env,
      stdio: resolvedStdio,
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    if (stdinText !== undefined && child.stdin) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });
  });
}

async function readTextFileIfExists(targetPath) {
  try {
    const value = await readFile(targetPath, 'utf8');
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

function dedupeStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)));
}

function listPrivateIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.internal) continue;
      if (typeof entry.address !== 'string' || entry.address.length === 0) continue;
      addresses.push({
        interface: interfaceName,
        family: entry.family,
        address: entry.address,
      });
    }
  }

  return addresses;
}

async function fetchJsonWithTimeout(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed request ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function detectPublicIpAddress() {
  const candidates = [
    async () => {
      const responseText = await fetchJsonWithTimeout('https://api.ipify.org?format=json');
      const payload = JSON.parse(responseText);
      return typeof payload?.ip === 'string' ? payload.ip.trim() : null;
    },
    async () => {
      const responseText = await fetchJsonWithTimeout('https://ifconfig.me/ip');
      return responseText.trim();
    },
    async () => {
      const responseText = await fetchJsonWithTimeout('https://ipv4.icanhazip.com');
      return responseText.trim();
    },
  ];

  for (const candidate of candidates) {
    try {
      const value = await candidate();
      if (value && value.length > 0) {
        return value;
      }
    } catch {
      // Try the next provider.
    }
  }

  return null;
}

async function detectGpuDevices() {
  if (process.platform === 'linux') {
    if (await commandExists('nvidia-smi')) {
      const result = await spawnProcess('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
        stdio: 'pipe',
      }).catch(() => ({ exitCode: 1, stdout: '' }));

      if (result.exitCode === 0) {
        return dedupeStrings(
          result.stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((name) => `NVIDIA ${name}`),
        ).map((name) => ({
          vendor: 'NVIDIA',
          name,
        }));
      }
    }

    if (await commandExists('lspci')) {
      const result = await runShellCommand("lspci | grep -Ei 'vga|3d|display'");
      if (result.exitCode === 0) {
        return dedupeStrings(
          result.stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => line.split(': ').slice(1).join(': ').trim() || line),
        ).map((name) => ({
          vendor: name.split(/\s+/)[0] || null,
          name,
        }));
      }
    }
  }

  if (process.platform === 'darwin') {
    const result = await runShellCommand("system_profiler SPDisplaysDataType | grep 'Chipset Model'").catch(() => ({
      exitCode: 1,
      stdout: '',
    }));
    if (result.exitCode === 0) {
      return dedupeStrings(
        result.stdout
          .split('\n')
          .map((line) => line.split(':').slice(1).join(':').trim())
          .filter(Boolean),
      ).map((name) => ({
        vendor: name.split(/\s+/)[0] || null,
        name,
      }));
    }
  }

  return [];
}

async function detectSystemVendorProfile() {
  if (process.platform === 'linux') {
    const [systemVendor, productName] = await Promise.all([
      readTextFileIfExists('/sys/devices/virtual/dmi/id/sys_vendor'),
      readTextFileIfExists('/sys/devices/virtual/dmi/id/product_name'),
    ]);

    return {
      systemVendor,
      productName,
    };
  }

  return {
    systemVendor: null,
    productName: null,
  };
}

export async function collectMachineProfile({ force = false } = {}) {
  if (!force && machineProfileCache.value && machineProfileCache.expiresAt > Date.now()) {
    return machineProfileCache.value;
  }

  if (!force && machineProfileCache.pending) {
    return await machineProfileCache.pending;
  }

  machineProfileCache.pending = (async () => {
    const cpus = os.cpus() || [];
    const privateIpEntries = listPrivateIpAddresses();
    const privateIpAddresses = privateIpEntries.map((entry) => entry.address);
    const [publicIp, gpuDevices, vendorProfile] = await Promise.all([
      detectPublicIpAddress(),
      detectGpuDevices(),
      detectSystemVendorProfile(),
    ]);

    const profile = {
      cpuModel: cpus[0]?.model || null,
      cpuArchitecture: os.arch(),
      cpuLogicalCores: cpus.length || null,
      cpuSpeedMHz: cpus[0]?.speed || null,
      memoryTotalBytes: os.totalmem(),
      gpuDevices,
      systemVendor: vendorProfile.systemVendor,
      productName: vendorProfile.productName,
      privateIpAddresses,
      privateIpEntries,
      primaryPrivateIp: privateIpAddresses[0] || null,
      publicIp,
    };

    machineProfileCache = {
      value: profile,
      expiresAt: Date.now() + MACHINE_PROFILE_CACHE_TTL_MS,
      pending: null,
    };

    return profile;
  })();

  try {
    return await machineProfileCache.pending;
  } finally {
    if (machineProfileCache.pending) {
      machineProfileCache.pending = null;
    }
  }
}

function parseListeningPortFromAddress(value) {
  const match = value.match(/:(\d+)$/);
  if (!match) return null;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

export function parseSsListeningOutput(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 5) return null;

      const localAddress = parts[3] || '';
      const port = parseListeningPortFromAddress(localAddress);
      if (!port) return null;

      const processText = parts.slice(5).join(' ');
      const pids = Array.from(processText.matchAll(/pid=(\d+)/g)).map((match) => Number(match[1])).filter(Boolean);
      const processNameMatch = processText.match(/users:\(\("([^"]+)"/);

      return {
        host: localAddress.replace(/:\d+$/, ''),
        port,
        pids,
        processName: processNameMatch?.[1] || null,
      };
    })
    .filter(Boolean);
}

export function parseLsofListeningOutput(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 9) return null;

      const processName = parts[0] || null;
      const pid = Number(parts[1] || 0);
      const address = parts.at(-2) === '(LISTEN)' ? parts.at(-3) : parts.at(-2);
      if (!address) return null;

      const port = parseListeningPortFromAddress(address);
      if (!port || !pid) return null;

      return {
        host: address.replace(/:\d+$/, ''),
        port,
        pids: [pid],
        processName,
      };
    })
    .filter(Boolean);
}

export async function listListeningSockets() {
  if (process.platform === 'win32') {
    return [];
  }

  if (await commandExists('ss')) {
    const result = await spawnProcess('ss', ['-ltnpH'], {
      stdio: 'pipe',
    }).catch(() => ({ exitCode: 1, stdout: '' }));

    if (result.exitCode === 0) {
      return parseSsListeningOutput(result.stdout);
    }
  }

  if (await commandExists('lsof')) {
    const result = await spawnProcess('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], {
      stdio: 'pipe',
    }).catch(() => ({ exitCode: 1, stdout: '' }));

    if (result.exitCode === 0) {
      return parseLsofListeningOutput(result.stdout);
    }
  }

  return [];
}

export async function listProcessTreePids(rootPid) {
  const root = Number(rootPid);
  if (!Number.isInteger(root) || root < 1 || process.platform === 'win32') {
    return [];
  }

  const result = await spawnProcess('ps', ['-eo', 'pid=,ppid='], {
    stdio: 'pipe',
  }).catch(() => ({ exitCode: 1, stdout: '' }));

  if (result.exitCode !== 0) {
    return [root];
  }

  const childrenByParent = new Map();
  for (const line of result.stdout.split('\n')) {
    const [pidValue, parentValue] = line.trim().split(/\s+/);
    const pid = Number(pidValue);
    const ppid = Number(parentValue);
    if (!pid || !ppid) continue;
    const current = childrenByParent.get(ppid) || [];
    current.push(pid);
    childrenByParent.set(ppid, current);
  }

  const queue = [root];
  const seen = new Set([root]);

  while (queue.length > 0) {
    const current = queue.shift();
    const children = childrenByParent.get(current) || [];
    for (const childPid of children) {
      if (seen.has(childPid)) continue;
      seen.add(childPid);
      queue.push(childPid);
    }
  }

  return Array.from(seen);
}

export async function listListeningPortsForProcess(rootPid) {
  const processTree = await listProcessTreePids(rootPid);
  if (processTree.length === 0) return [];
  const sockets = await listListeningSockets();
  const processPidSet = new Set(processTree);

  return sockets
    .filter((socket) => socket.pids.some((pid) => processPidSet.has(pid)))
    .map((socket) => ({
      port: socket.port,
      host: socket.host,
      processName: socket.processName,
      pids: socket.pids,
    }));
}

export async function waitForListeningPortsForProcess(rootPid, { timeoutMs = 12000, intervalMs = 1200 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const ports = await listListeningPortsForProcess(rootPid);
    if (ports.length > 0) {
      return ports;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return [];
}

export function isLikelyPreviewSocket(socket) {
  if (!socket || typeof socket !== 'object') return false;
  if (!Number.isInteger(socket.port) || socket.port < 1) return false;
  if (COMMON_PREVIEW_PORTS.has(socket.port)) return true;
  return PREVIEW_COMMAND_HINT.test(String(socket.processName || ''));
}

export async function listLikelyPreviewTargets() {
  const sockets = await listListeningSockets();
  const unique = new Map();

  for (const socket of sockets) {
    if (!isLikelyPreviewSocket(socket)) continue;
    if (unique.has(socket.port)) continue;

    unique.set(socket.port, {
      port: socket.port,
      protocol: socket.port === 443 || socket.port === 8443 ? 'https' : 'http',
      host: socket.host,
      label: socket.processName ? `${socket.processName} on ${socket.port}` : `Port ${socket.port}`,
      processName: socket.processName,
      source: 'process',
      path: '/',
    });
  }

  return Array.from(unique.values()).sort((left, right) => left.port - right.port);
}

export async function fetchLocalPreview({
  port,
  protocol = 'http',
  method = 'GET',
  pathname = '/',
  search = '',
  headers = {},
  bodyBase64,
} = {}) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const body = typeof bodyBase64 === 'string' ? Buffer.from(bodyBase64, 'base64') : undefined;
  const candidates = protocol === 'https' ? ['https', 'http'] : ['http', 'https'];

  let lastError = null;

  for (const candidateProtocol of candidates) {
    try {
      const response = await fetch(`${
        candidateProtocol
      }://127.0.0.1:${port}${normalizedPath}${search}`, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        redirect: 'manual',
      });

      const buffer = Buffer.from(await response.arrayBuffer());

      return {
        statusCode: response.status,
        protocol: candidateProtocol,
        headers: Object.fromEntries(response.headers.entries()),
        bodyBase64: buffer.toString('base64'),
        bodySize: buffer.byteLength,
        url: response.url,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to load the local preview server.');
}

export async function commandExists(command) {
  if (!command) return false;

  if (process.platform === 'win32') {
    const result = await spawnProcess('where', [command], {
      stdio: 'pipe',
    }).catch(() => ({ exitCode: 1 }));
    return result.exitCode === 0;
  }

  const result = await runShellCommand(`command -v ${quoteShellArg(command)} >/dev/null 2>&1`);
  return result.exitCode === 0;
}

export async function getSudoStatus() {
  if (process.platform === 'win32') {
    return {
      available: false,
      passwordless: false,
      isRoot: false,
    };
  }

  const root = isRootUser();
  const available = root ? true : await commandExists('sudo');
  const passwordless = root
    ? true
    : available
      ? (await spawnProcess('sudo', ['-n', 'true'], { stdio: 'pipe' }).catch(() => ({ exitCode: 1 }))).exitCode === 0
      : false;

  return {
    available,
    passwordless,
    isRoot: root,
  };
}

export async function runShellCommand(command, { cwd, env, onStdout, onStderr, sudo = false, sudoPassword } = {}) {
  if (sudo && process.platform === 'win32') {
    throw new Error('Sudo execution is not supported on Windows.');
  }

  const shell = getShell();
  const resolvedEnv = env || process.env;
  const shellCommand = buildShellExecutionCommand(command);

  return await new Promise((resolve, reject) => {
    const child = spawn(
      sudo && !isRootUser() ? 'sudo' : shell.command,
      sudo && !isRootUser()
        ? [sudoPassword ? '-S' : '-E', ...(sudoPassword ? ['-p', ''] : []), shell.command, ...shell.args, shellCommand]
        : [...shell.args, shellCommand],
      {
        cwd: cwd || process.cwd(),
        env: resolvedEnv,
        stdio: [sudo && sudoPassword ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      },
    );

    if (sudo && sudoPassword && child.stdin) {
      child.stdin.write(`${sudoPassword}\n`);
      child.stdin.end();
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onStdout?.(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onStderr?.(text);
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });
  });
}

export async function runLocalShellCommand(command, { cwd, sudo = false, sudoPassword, env } = {}) {
  if (sudo && process.platform === 'win32') {
    throw new Error('Sudo execution is not supported on Windows.');
  }

  const shell = getShell();
  const resolvedEnv = env || process.env;
  const shellCommand = buildShellExecutionCommand(command);

  if (sudo && !isRootUser()) {
    return await spawnProcess('sudo', [sudoPassword ? '-S' : '-E', ...(sudoPassword ? ['-p', ''] : []), shell.command, ...shell.args, shellCommand], {
      cwd: cwd || process.cwd(),
      env: resolvedEnv,
      stdio: 'inherit',
      stdinText: sudoPassword ? `${sudoPassword}\n` : undefined,
    });
  }

  return await spawnProcess(shell.command, [...shell.args, shellCommand], {
    cwd,
    env: resolvedEnv,
    stdio: 'inherit',
  });
}

export async function runDirectCommand(command, args = [], { cwd, sudo = false, sudoPassword, env } = {}) {
  if (sudo && process.platform === 'win32') {
    throw new Error('Sudo execution is not supported on Windows.');
  }

  const resolvedEnv = env || process.env;

  if (sudo && !isRootUser()) {
    const sudoArgs = sudoPassword
      ? ['-S', '-p', '', command, ...args]
      : ['-E', command, ...args];

    return await spawnProcess('sudo', sudoArgs, {
      cwd,
      env: resolvedEnv,
      stdio: 'inherit',
      stdinText: sudoPassword ? `${sudoPassword}\n` : undefined,
    });
  }

  return await spawnProcess(command, args, {
    cwd,
    env: resolvedEnv,
    stdio: 'inherit',
  });
}

async function spawnStreamingProcess(command, args, { cwd, env, stdinText, onSpawn, onProcess, onStdout, onStderr } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    onSpawn?.(child.pid ?? null);
    onProcess?.(child);

    if (stdinText !== undefined && child.stdin) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onStdout?.(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onStderr?.(text);
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });
  });
}

export async function runStreamingShellCommand(
  command,
  { cwd, env, sudo = false, sudoPassword, onSpawn, onProcess, onStdout, onStderr } = {},
) {
  if (sudo && process.platform === 'win32') {
    throw new Error('Sudo execution is not supported on Windows.');
  }

  const shell = getShell();
  const resolvedEnv = env || process.env;
  const shellCommand = buildShellExecutionCommand(command);

  if (sudo && !isRootUser()) {
    return await spawnStreamingProcess(
      'sudo',
      [sudoPassword ? '-S' : '-E', ...(sudoPassword ? ['-p', ''] : []), shell.command, ...shell.args, shellCommand],
      {
        cwd,
        env: resolvedEnv,
        stdinText: sudoPassword ? `${sudoPassword}\n` : undefined,
        onSpawn,
        onProcess,
        onStdout,
        onStderr,
      },
    );
  }

  return await spawnStreamingProcess(shell.command, [...shell.args, shellCommand], {
    cwd,
    env: resolvedEnv,
    onSpawn,
    onProcess,
    onStdout,
    onStderr,
  });
}

export async function runStreamingDirectCommand(
  command,
  args = [],
  { cwd, env, sudo = false, sudoPassword, onSpawn, onProcess, onStdout, onStderr } = {},
) {
  if (sudo && process.platform === 'win32') {
    throw new Error('Sudo execution is not supported on Windows.');
  }

  const resolvedEnv = env || process.env;

  if (sudo && !isRootUser()) {
    return await spawnStreamingProcess(
      'sudo',
      [sudoPassword ? '-S' : '-E', ...(sudoPassword ? ['-p', ''] : []), command, ...args],
      {
        cwd,
        env: resolvedEnv,
        stdinText: sudoPassword ? `${sudoPassword}\n` : undefined,
        onSpawn,
        onProcess,
        onStdout,
        onStderr,
      },
    );
  }

  return await spawnStreamingProcess(command, args, {
    cwd,
    env: resolvedEnv,
    onSpawn,
    onProcess,
    onStdout,
    onStderr,
  });
}

export async function openInteractiveShell({ cwd, sudo = false, sudoPassword, env } = {}) {
  if (sudo && process.platform === 'win32') {
    throw new Error('Sudo execution is not supported on Windows.');
  }

  const shell = getShell();
  const resolvedEnv = env || process.env;

  if (sudo && !isRootUser()) {
    return await spawnProcess('sudo', [sudoPassword ? '-S' : '-E', ...(sudoPassword ? ['-p', ''] : []), shell.command, ...shell.interactiveArgs], {
      cwd,
      env: resolvedEnv,
      stdio: 'inherit',
      stdinText: sudoPassword ? `${sudoPassword}\n` : undefined,
    });
  }

  return await spawnProcess(shell.command, shell.interactiveArgs, {
    cwd,
    env: resolvedEnv,
    stdio: 'inherit',
  });
}

function getNetworkBytesLinux() {
  return readFile('/proc/net/dev', 'utf8')
    .then((contents) => {
      const lines = contents.split('\n').slice(2);
      let rx = 0;
      let tx = 0;

      for (const line of lines) {
        const parts = line.replace(/:/, ' ').trim().split(/\s+/);
        if (parts.length < 10) continue;
        rx += Number(parts[1] || 0);
        tx += Number(parts[9] || 0);
      }

      return { rx, tx };
    })
    .catch(() => ({ rx: 0, tx: 0 }));
}

export async function collectMetrics({ sandboxCount = 0 } = {}) {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const load = os.loadavg()[0] || 0;
  const cpuPercent = Math.min(100, Number(((load / Math.max(1, os.cpus().length)) * 100).toFixed(2)));
  const memoryPercent = Math.min(100, Number((((totalMemory - freeMemory) / totalMemory) * 100).toFixed(2)));
  const network = process.platform === 'linux' ? await getNetworkBytesLinux() : { rx: 0, tx: 0 };

  return {
    cpuPercent,
    memoryPercent,
    uptimeSeconds: Math.round(os.uptime()),
    networkRxBytes: network.rx,
    networkTxBytes: network.tx,
  };
}

export async function listProcesses(limit = 25) {
  if (process.platform === 'win32') {
    return [];
  }

  const result = await runShellCommand('ps -eo pid=,pcpu=,pmem=,state=,args= --sort=-pcpu | head -n 26');
  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => {
      const parts = line.split(/\s+/);
      const pid = Number(parts.shift() || 0);
      const cpuPercent = Number(parts.shift() || 0);
      const memoryPercent = Number(parts.shift() || 0);
      const state = parts.shift() || null;
      const command = parts.join(' ');

      return {
        pid,
        command,
        cpuPercent,
        memoryPercent,
        state,
        startedAt: null,
      };
    });
}

export function collectMachineInfo({ machineName, machineId }) {
  return {
    name: machineName || os.hostname(),
    machineId,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    nodeVersion: process.version,
    cliVersion: CLI_VERSION,
  };
}

export async function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isShellBuiltin(command) {
  return SHELL_BUILTINS.has(command);
}

export async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function statPath(targetPath) {
  return await stat(targetPath);
}

export async function listDirectory(targetPath) {
  const entries = await readdir(targetPath, { withFileTypes: true });

  return await Promise.all(
    entries
      .sort((left, right) => {
        if (left.isDirectory() && !right.isDirectory()) return -1;
        if (!left.isDirectory() && right.isDirectory()) return 1;
        return left.name.localeCompare(right.name);
      })
      .map(async (entry) => {
        const fullPath = path.join(targetPath, entry.name);
        const details = await stat(fullPath).catch(() => null);

        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'folder' : 'file',
          size: details?.size ?? 0,
          modifiedAt: details?.mtime?.toISOString() ?? null,
        };
      }),
  );
}

export async function readFilePayload(targetPath) {
  const buffer = await readFile(targetPath);
  const isText = !buffer.includes(0);

  return {
    path: targetPath,
    size: buffer.byteLength,
    contentEncoding: isText ? 'utf8' : 'base64',
    content: isText ? buffer.toString('utf8') : buffer.toString('base64'),
  };
}

export async function writeFilePayload(targetPath, content, contentEncoding = 'utf8') {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const buffer =
    contentEncoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
  await writeFile(targetPath, buffer);
  const details = await stat(targetPath);

  return {
    path: targetPath,
    size: details.size,
  };
}

export async function makeDirectory(targetPath) {
  await mkdir(targetPath, { recursive: true });
  return { path: targetPath };
}

export async function deletePath(targetPath, recursive = false) {
  await rm(targetPath, { force: true, recursive });
  return { path: targetPath };
}

export async function movePath(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await rename(sourcePath, targetPath);
  return { sourcePath, targetPath };
}

export async function copyPath(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true });
  return { sourcePath, targetPath };
}
