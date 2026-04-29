import os from 'node:os';
import path from 'node:path';

export function expandHomeDirectory(input, homedir = os.homedir()) {
  if (input === '~') {
    return homedir;
  }

  if (typeof input === 'string' && input.startsWith('~/')) {
    return path.join(homedir, input.slice(2));
  }

  return input;
}

export function resolveWorkingDirectoryInput(
  input,
  { baseDirectory = process.cwd(), homedir = os.homedir(), defaultToHome = false } = {},
) {
  const rawInput =
    typeof input === 'string' && input.trim().length > 0 ? input.trim() : defaultToHome ? homedir : baseDirectory;
  const expanded = expandHomeDirectory(rawInput, homedir);
  return path.resolve(baseDirectory, expanded);
}

export function normalizeWorkingDirectory(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
