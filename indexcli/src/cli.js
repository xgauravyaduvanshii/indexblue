import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { claimDeviceSession, createDeviceSession } from './lib/platform-client.js';
import { CLI_VERSION } from './lib/metadata.js';
import { buildCloudPreviewUrl, shouldWatchForPreviewCommand } from './lib/previews.js';
import {
  ensureMachineId,
  getStoredApiKey,
  getStoredSudoPassword,
  loadConfig,
  saveConfig,
  setStoredApiKey,
} from './lib/state.js';
import { createSandboxRecord, deleteSandbox, listSandboxesState, restartSandbox, startSandbox, stopSandbox } from './lib/sandboxes.js';
import {
  buildShellCommand,
  copyPath,
  deletePath,
  getSudoStatus,
  isShellBuiltin,
  listDirectory,
  makeDirectory,
  movePath,
  openInteractiveShell,
  pathExists,
  readFilePayload,
  runDirectCommand,
  runLocalShellCommand,
  runStreamingDirectCommand,
  runStreamingShellCommand,
  runShellCommand,
  statPath,
  waitForListeningPortsForProcess,
  writeFilePayload,
} from './lib/system.js';
import { resolveWorkingDirectoryInput } from './lib/workspace.js';
import { runInfraAgent } from './lib/agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_PATH = path.resolve(__dirname, '../bin/indexcli.js');

function parseFlag(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function splitArgsAtDoubleDash(args) {
  const separatorIndex = args.indexOf('--');
  if (separatorIndex === -1) {
    return {
      before: args,
      after: [],
    };
  }

  return {
    before: args.slice(0, separatorIndex),
    after: args.slice(separatorIndex + 1),
  };
}

function stripKnownFlags(args, { valueFlags = [], booleanFlags = [] } = {}) {
  const result = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (valueFlags.includes(value)) {
      index += 1;
      continue;
    }

    if (booleanFlags.includes(value)) {
      continue;
    }

    result.push(value);
  }

  return result;
}

function extractCommandArgs(args, options = {}) {
  const split = splitArgsAtDoubleDash(args);
  if (split.after.length > 0) {
    return split.after;
  }

  return stripKnownFlags(split.before, options);
}

function buildCommandFromUserArgs(args, options = {}) {
  const split = splitArgsAtDoubleDash(args);
  if (split.after.length > 0) {
    return split.after.join(' ');
  }

  return stripKnownFlags(split.before, options).join(' ');
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printText(value) {
  process.stdout.write(`${value}\n`);
}

function printPreviewHint(config, port) {
  printText(`[indexcli] Preview detected on port ${port}`);
  printText(`  Local: http://127.0.0.1:${port}`);
  if (config.infraId) {
    printText(`  Cloud: ${buildCloudPreviewUrl(config.apiBaseUrl, config.infraId, port)}`);
  }
}

function startPreviewWatcher(rootPid, config) {
  if (!rootPid) {
    return () => {};
  }

  let stopped = false;
  const seenPorts = new Set();

  const loop = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    while (!stopped) {
      const ports = await waitForListeningPortsForProcess(rootPid, {
        timeoutMs: 1400,
        intervalMs: 700,
      }).catch(() => []);

      for (const portRecord of ports) {
        if (seenPorts.has(portRecord.port)) continue;
        seenPorts.add(portRecord.port);
        printPreviewHint(config, portRecord.port);
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  };

  void loop();

  return () => {
    stopped = true;
  };
}

function getSudoPassword(config) {
  return process.env.INDEXCLI_SUDO_PASSWORD || getStoredSudoPassword(config) || undefined;
}

async function getWorkingDirectory(config) {
  const candidate = config.workingDirectory || process.cwd();

  if (await pathExists(candidate)) {
    const details = await statPath(candidate);
    if (details.isDirectory()) {
      return candidate;
    }
  }

  return process.cwd();
}

function resolvePathFromCwd(input, cwd, { defaultToHome = false } = {}) {
  return resolveWorkingDirectoryInput(input, {
    baseDirectory: cwd,
    defaultToHome,
  });
}

async function loadRuntimeConfig() {
  return ensureMachineId(await loadConfig());
}

async function handleLogin(args) {
  const key = parseFlag(args, '--key');
  if (!key) {
    throw new Error('Missing --key value.');
  }

  const config = await loadRuntimeConfig();
  config.apiBaseUrl = parseFlag(args, '--base-url', config.apiBaseUrl);
  const next = setStoredApiKey(config, key);
  await saveConfig(next);
  printText('API key stored successfully.');
}

async function handleLogout() {
  const config = await loadConfig();
  const next = {
    ...config,
    encryptedApiKey: null,
    encryptedSudoPassword: null,
    infraId: null,
    pairedAt: null,
  };
  await saveConfig(next);
  printText('Logged out and cleared local infra state.');
}

async function handleStatus() {
  const config = await loadRuntimeConfig();
  const apiKey = getStoredApiKey(config);
  const sandboxes = await listSandboxesState();
  const sudo = await getSudoStatus();
  const cwd = await getWorkingDirectory(config);

  printJson({
    version: CLI_VERSION,
    loggedIn: Boolean(apiKey),
    apiBaseUrl: config.apiBaseUrl,
    infraId: config.infraId,
    machineId: config.machineId,
    machineName: config.machineName,
    pairedAt: config.pairedAt,
    workingDirectory: cwd,
    sandboxCount: sandboxes.length,
    storedSudoPassword: Boolean(getStoredSudoPassword(config)),
    sudo,
  });
}

async function handleDoctor() {
  const config = await loadRuntimeConfig();
  const sudo = await getSudoStatus();
  const cwd = await getWorkingDirectory(config);

  printJson({
    version: CLI_VERSION,
    platform: process.platform,
    architecture: process.arch,
    shell: process.env.SHELL || null,
    currentProcessDirectory: process.cwd(),
    configuredWorkingDirectory: cwd,
    apiBaseUrl: config.apiBaseUrl,
    connectedInfraId: config.infraId,
    machineId: config.machineId,
    storedSudoPassword: Boolean(getStoredSudoPassword(config)),
    sudo,
  });
}

async function handleGenerateKey(args) {
  const config = await loadConfig();
  const baseUrl = parseFlag(args, '--base-url', config.apiBaseUrl);
  const label = parseFlag(args, '--label', `Index CLI ${process.platform}`);
  const session = await createDeviceSession(baseUrl, label);

  printText(`Open this URL to approve the CLI: ${session.verificationUrl}`);
  printText(`Pairing code: ${session.code}`);

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, session.pollIntervalMs || 3000));
    const claimed = await claimDeviceSession(baseUrl, session.sessionId);

    if (claimed.status === 'approved' && claimed.apiKey) {
      const next = setStoredApiKey(
        {
          ...(await loadConfig()),
          apiBaseUrl: baseUrl,
        },
        claimed.apiKey,
      );
      await saveConfig(next);
      printText('API key approved and stored locally.');
      break;
    }

    if (claimed.status === 'expired' || claimed.status === 'claimed' || claimed.status === 'cancelled') {
      throw new Error(`Device session ${claimed.status}.`);
    }
  }
}

async function handleVersion() {
  printText(CLI_VERSION);
}

async function handlePwd() {
  const config = await loadRuntimeConfig();
  printText(await getWorkingDirectory(config));
}

async function handleCd(args) {
  const config = await loadRuntimeConfig();
  const currentDirectory = await getWorkingDirectory(config);
  const targetDirectory = resolvePathFromCwd(args[0], currentDirectory, { defaultToHome: true });
  const details = await statPath(targetDirectory).catch(() => null);

  if (!details || !details.isDirectory()) {
    throw new Error(`Directory not found: ${targetDirectory}`);
  }

  await saveConfig({
    ...config,
    workingDirectory: targetDirectory,
  });

  printText(targetDirectory);
}

async function runPassthroughCommand(command, args, { sudo = false } = {}) {
  const config = await loadRuntimeConfig();
  const cwd = await getWorkingDirectory(config);
  const sudoPassword = getSudoPassword(config);

  if (isShellBuiltin(command)) {
    const builtinCommand = args.length > 0 ? `${command} ${buildShellCommand(args)}` : command;
    const result = await runLocalShellCommand(builtinCommand, {
      cwd,
      sudo,
      sudoPassword,
    });
    process.exitCode = result.exitCode;
    return;
  }

  const previewCandidate = shouldWatchForPreviewCommand([command, ...args].join(' '));
  if (previewCandidate) {
    let stopPreviewWatcher = () => {};
    const result = await runStreamingDirectCommand(command, args, {
      cwd,
      sudo,
      sudoPassword,
      onSpawn: (pid) => {
        stopPreviewWatcher = startPreviewWatcher(pid, config);
      },
      onStdout: (chunk) => process.stdout.write(chunk),
      onStderr: (chunk) => process.stderr.write(chunk),
    });
    stopPreviewWatcher();
    process.exitCode = result.exitCode;
    return;
  }

  const result = await runDirectCommand(command, args, {
    cwd,
    sudo,
    sudoPassword,
  });
  process.exitCode = result.exitCode;
}

async function handleExec(args) {
  const config = await loadRuntimeConfig();
  const cwd = await getWorkingDirectory(config);
  const command = buildCommandFromUserArgs(args, {
    valueFlags: ['--cwd'],
    booleanFlags: ['--sudo'],
  });

  if (!command.trim()) {
    throw new Error('Missing command to execute.');
  }

  const cwdOverride = parseFlag(args, '--cwd');
  const resolvedCwd = cwdOverride ? resolvePathFromCwd(cwdOverride, cwd) : cwd;

  if (hasFlag(args, '--sudo')) {
    const previewCandidate = shouldWatchForPreviewCommand(command);
    if (previewCandidate) {
      let stopPreviewWatcher = () => {};
      const result = await runStreamingShellCommand(command, {
        cwd: resolvedCwd,
        sudo: true,
        sudoPassword: getSudoPassword(config),
        onSpawn: (pid) => {
          stopPreviewWatcher = startPreviewWatcher(pid, config);
        },
        onStdout: (chunk) => process.stdout.write(chunk),
        onStderr: (chunk) => process.stderr.write(chunk),
      });
      stopPreviewWatcher();
      process.exitCode = result.exitCode;
      return;
    }

    const result = await runLocalShellCommand(command, {
      cwd: resolvedCwd,
      sudo: true,
      sudoPassword: getSudoPassword(config),
    });
    process.exitCode = result.exitCode;
    return;
  }

  let result;
  if (shouldWatchForPreviewCommand(command)) {
    let stopPreviewWatcher = () => {};
    result = await runStreamingShellCommand(command, {
      cwd: resolvedCwd,
      onSpawn: (pid) => {
        stopPreviewWatcher = startPreviewWatcher(pid, config);
      },
      onStdout: (chunk) => process.stdout.write(chunk),
      onStderr: (chunk) => process.stderr.write(chunk),
    });
    stopPreviewWatcher();
  } else {
    result = await runShellCommand(command, {
      cwd: resolvedCwd,
      onStdout: (chunk) => process.stdout.write(chunk),
      onStderr: (chunk) => process.stderr.write(chunk),
    });
  }

  process.exitCode = result.exitCode;
}

async function handleFs(args) {
  const [subcommand, ...rest] = args;
  const config = await loadRuntimeConfig();
  const cwd = await getWorkingDirectory(config);

  switch (subcommand) {
    case 'ls': {
      printJson(await listDirectory(resolvePathFromCwd(rest[0], cwd)));
      return;
    }
    case 'read': {
      printJson(await readFilePayload(resolvePathFromCwd(rest[0], cwd)));
      return;
    }
    case 'write': {
      const [targetPathInput, ...contentParts] = rest;
      printJson(
        await writeFilePayload(
          resolvePathFromCwd(targetPathInput, cwd),
          contentParts.join(' ') || '',
          hasFlag(args, '--base64') ? 'base64' : 'utf8',
        ),
      );
      return;
    }
    case 'rm': {
      printJson(await deletePath(resolvePathFromCwd(rest[0], cwd), hasFlag(args, '--recursive')));
      return;
    }
    case 'mkdir': {
      printJson(await makeDirectory(resolvePathFromCwd(rest[0], cwd)));
      return;
    }
    case 'mv': {
      printJson(await movePath(resolvePathFromCwd(rest[0], cwd), resolvePathFromCwd(rest[1], cwd)));
      return;
    }
    case 'cp': {
      printJson(await copyPath(resolvePathFromCwd(rest[0], cwd), resolvePathFromCwd(rest[1], cwd)));
      return;
    }
    default:
      throw new Error('Unsupported fs subcommand. Use ls, read, write, rm, mkdir, mv, or cp.');
  }
}

async function handleSandbox(args) {
  const [subcommand, ...rest] = args;
  const config = await loadRuntimeConfig();

  switch (subcommand) {
    case 'list':
      printJson(await listSandboxesState());
      return;
    case 'create': {
      const cwd = await getWorkingDirectory(config);
      const [name, rootPath, ...commandParts] = rest;
      if (!name || !rootPath) {
        throw new Error('Usage: indexcli sandbox create <name> <rootPath> <startCommand...>');
      }
      printJson(
        await createSandboxRecord({
          name,
          rootPath: resolvePathFromCwd(rootPath, cwd),
          startCommand: commandParts.join(' ') || null,
        }),
      );
      return;
    }
    case 'start':
    case 'restart': {
      const action = subcommand === 'restart' ? restartSandbox : startSandbox;
      const sandbox = await action(rest[0]);
      const previewPorts = sandbox?.pid ? await waitForListeningPortsForProcess(sandbox.pid, { timeoutMs: 8000 }) : [];
      const previewUrls = previewPorts.map((previewPort) => ({
        port: previewPort.port,
        localUrl: `http://127.0.0.1:${previewPort.port}`,
        cloudUrl: config?.infraId ? buildCloudPreviewUrl(config.apiBaseUrl, config.infraId, previewPort.port) : null,
      }));
      printJson({
        ...sandbox,
        previewUrls,
      });
      for (const preview of previewUrls) {
        printPreviewHint(config, preview.port);
      }
      return;
    }
    case 'stop':
      printJson(await stopSandbox(rest[0]));
      return;
    case 'delete':
      printJson(await deleteSandbox(rest[0]));
      return;
    default:
      throw new Error('Unsupported sandbox subcommand. Use list, create, start, stop, restart, or delete.');
  }
}

async function handleShell(args) {
  const config = await loadRuntimeConfig();
  const cwd = await getWorkingDirectory(config);
  const sudoPassword = getSudoPassword(config);
  const commandArgs = extractCommandArgs(args, {
    booleanFlags: ['--sudo'],
  });

  if (commandArgs.length > 0) {
    const result = await runLocalShellCommand(buildCommandFromUserArgs(args, { booleanFlags: ['--sudo'] }), {
      cwd,
      sudo: hasFlag(args, '--sudo'),
      sudoPassword,
    });
    process.exitCode = result.exitCode;
    return;
  }

  const result = await openInteractiveShell({
    cwd,
    sudo: hasFlag(args, '--sudo'),
    sudoPassword,
  });
  process.exitCode = result.exitCode;
}

async function handleSudo(args) {
  const [subcommand, ...rest] = args;

  if (subcommand === 'status' || !subcommand) {
    printJson(await getSudoStatus());
    return;
  }

  if (subcommand === 'shell') {
    await handleShell(['--sudo', ...rest]);
    return;
  }

  await runPassthroughCommand(subcommand, rest, { sudo: true });
}

async function handleInfra(args) {
  const [subcommand, ...rest] = args;
  const config = await loadRuntimeConfig();
  const baseUrl = parseFlag(rest, '--base-url', config.apiBaseUrl);
  const machineName = parseFlag(rest, '--name', config.machineName || null);
  const nextConfig = await saveConfig({
    ...config,
    apiBaseUrl: baseUrl,
    machineName: machineName || config.machineName || null,
  });

  switch (subcommand) {
    case 'connect': {
      if (hasFlag(rest, '--background')) {
        const child = spawn(process.execPath, [BIN_PATH, 'infra', 'serve', '--base-url', baseUrl, '--name', machineName || ''], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        printText(`Infra agent started in background with pid ${child.pid}.`);
        return;
      }

      await runInfraAgent({ machineName, baseUrl, pathOptions: nextConfig.__paths });
      return;
    }
    case 'serve':
      await runInfraAgent({ machineName, baseUrl, pathOptions: nextConfig.__paths });
      return;
    case 'disconnect': {
      const next = {
        ...nextConfig,
        infraId: null,
      };
      await saveConfig(next);
      printText('Cleared local infra id. If a background agent is running, stop it separately.');
      return;
    }
    default:
      throw new Error('Unsupported infra subcommand. Use connect, serve, or disconnect.');
  }
}

function printHelp() {
  printText(`indexcli ${CLI_VERSION}

Usage:
  indexcli <command> [...args]

Core:
  indexcli login --key <API_KEY> [--base-url <url>]
  indexcli logout
  indexcli status
  indexcli doctor
  indexcli version
  indexcli generate-key [--base-url <url>] [--label <name>]

Workspace:
  indexcli pwd
  indexcli cd <path>
  indexcli shell [--sudo]
  indexcli sudo status
  indexcli sudo <command> [...args]

Execution:
  indexcli exec [--cwd <path>] [--sudo] -- <shell command>
  indexcli ls -la
  indexcli grep -r "needle" .
  indexcli git status
  indexcli apt update

Filesystem:
  indexcli fs ls <path>
  indexcli fs read <path>
  indexcli fs write <path> <content>
  indexcli fs rm <path> [--recursive]
  indexcli fs mkdir <path>
  indexcli fs mv <source> <target>
  indexcli fs cp <source> <target>

Sandboxes:
  indexcli sandbox list
  indexcli sandbox create <name> <rootPath> [startCommand...]
  indexcli sandbox start <slug>
  indexcli sandbox stop <slug>
  indexcli sandbox restart <slug>
  indexcli sandbox delete <slug>

Infra:
  indexcli infra connect --name "My Machine" [--base-url <url>] [--background]
  indexcli infra serve --name "My Machine" [--base-url <url>]
  indexcli infra disconnect

Previews:
  indexcli npm run dev
  indexcli exec -- "npm run preview"
  indexcli sandbox start <slug>
  Dev servers started through indexcli will print detected local/cloud preview URLs automatically.
`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'login':
      await handleLogin(rest);
      return;
    case 'logout':
      await handleLogout();
      return;
    case 'status':
      await handleStatus();
      return;
    case 'doctor':
      await handleDoctor();
      return;
    case 'version':
    case '--version':
    case '-v':
      await handleVersion();
      return;
    case 'generate-key':
      await handleGenerateKey(rest);
      return;
    case 'exec':
    case 'run':
      await handleExec(rest);
      return;
    case 'pwd':
      await handlePwd();
      return;
    case 'cd':
      await handleCd(rest);
      return;
    case 'fs':
      await handleFs(rest);
      return;
    case 'sandbox':
      await handleSandbox(rest);
      return;
    case 'shell':
      await handleShell(rest);
      return;
    case 'sudo':
      await handleSudo(rest);
      return;
    case 'infra':
      await handleInfra(rest);
      return;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return;
    default:
      await runPassthroughCommand(command, rest);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Unexpected CLI error.'}\n`);
  process.exit(1);
});
