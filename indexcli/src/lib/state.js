import { randomUUID } from 'node:crypto';
import {
  decryptStoredSecret,
  encryptStoredSecret,
  ensureConfigDirectories,
  normalizeApiBaseUrl,
  readJsonFile,
  resolveConfigPaths,
  writeJsonFile,
} from './config.js';
import { normalizeWorkingDirectory } from './workspace.js';

const DEFAULT_CONFIG = {
  apiBaseUrl: 'http://13.60.98.189:3000/',
  encryptedApiKey: null,
  encryptedSudoPassword: null,
  infraId: null,
  machineId: null,
  machineName: null,
  pairedAt: null,
  workingDirectory: null,
};

export async function loadConfig(options = {}) {
  const paths = resolveConfigPaths(options);
  await ensureConfigDirectories(paths);
  const config = await readJsonFile(paths.configFile, DEFAULT_CONFIG);

  return {
    ...DEFAULT_CONFIG,
    ...config,
    apiBaseUrl: normalizeApiBaseUrl(config.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl),
    encryptedSudoPassword: config.encryptedSudoPassword || null,
    workingDirectory: normalizeWorkingDirectory(config.workingDirectory),
    __paths: paths,
  };
}

export async function saveConfig(config, options = {}) {
  const paths = config.__paths || resolveConfigPaths(options);
  await ensureConfigDirectories(paths);

  const persisted = {
    apiBaseUrl: normalizeApiBaseUrl(config.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl),
    encryptedApiKey: config.encryptedApiKey || null,
    encryptedSudoPassword: config.encryptedSudoPassword || null,
    infraId: config.infraId || null,
    machineId: config.machineId || null,
    machineName: config.machineName || null,
    pairedAt: config.pairedAt || null,
    workingDirectory: normalizeWorkingDirectory(config.workingDirectory),
  };

  await writeJsonFile(paths.configFile, persisted);
  return { ...persisted, __paths: paths };
}

export function getStoredApiKey(config, machineContext = {}) {
  if (!config.encryptedApiKey) return null;
  return decryptStoredSecret(config.encryptedApiKey, machineContext);
}

export function setStoredApiKey(config, apiKey, machineContext = {}) {
  return {
    ...config,
    encryptedApiKey: apiKey ? encryptStoredSecret(apiKey, machineContext) : null,
    pairedAt: apiKey ? new Date().toISOString() : null,
  };
}

export function getStoredSudoPassword(config, machineContext = {}) {
  if (!config.encryptedSudoPassword) return null;
  return decryptStoredSecret(config.encryptedSudoPassword, machineContext);
}

export function setStoredSudoPassword(config, password, machineContext = {}) {
  return {
    ...config,
    encryptedSudoPassword: password ? encryptStoredSecret(password, machineContext) : null,
  };
}

export function ensureMachineId(config) {
  if (config.machineId) return config;
  return {
    ...config,
    machineId: randomUUID(),
  };
}

export async function loadSandboxes(options = {}) {
  const paths = resolveConfigPaths(options);
  await ensureConfigDirectories(paths);
  const state = await readJsonFile(paths.sandboxFile, { sandboxes: [] });
  return {
    sandboxes: Array.isArray(state.sandboxes) ? state.sandboxes : [],
    __paths: paths,
  };
}

export async function saveSandboxes(sandboxes, options = {}) {
  const paths = options.__paths || resolveConfigPaths(options);
  await ensureConfigDirectories(paths);
  await writeJsonFile(paths.sandboxFile, {
    sandboxes,
  });
  return {
    sandboxes,
    __paths: paths,
  };
}
