import 'server-only';

import { getDefaultBuilderRemoteCwd } from '@/lib/builder/box';
import { BUILDER_BOX_ROOT } from '@/lib/builder/paths';

const TERMINAL_STATE_ROOT = `${BUILDER_BOX_ROOT}/.indexblue-terminal`;

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function sanitizeTerminalId(terminalId: string) {
  return terminalId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
}

export function getBuilderTerminalStatePaths(projectId: string, terminalId = 'default') {
  const safeTerminalId = sanitizeTerminalId(terminalId);
  return {
    cwdFile: `${TERMINAL_STATE_ROOT}/${projectId}.${safeTerminalId}.cwd`,
    sessionFile: `${TERMINAL_STATE_ROOT}/${projectId}.${safeTerminalId}.session.sh`,
  };
}

export function normalizeBuilderTerminalCwd(
  cwd: string | null | undefined,
  hasWorkspace: boolean,
  fallbackCwd?: string,
) {
  const fallback = fallbackCwd?.trim() || getDefaultBuilderRemoteCwd(hasWorkspace);
  const trimmed = cwd?.trim();

  if (!trimmed || !trimmed.startsWith('/')) {
    return fallback;
  }

  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
}

export function createBuilderTerminalCommand({
  command,
  cwd,
  cwdFile,
  sessionFile,
}: {
  command: string;
  cwd: string;
  cwdFile: string;
  sessionFile: string;
}) {
  const script = [
    'state_file=$1',
    'cwd_file=$2',
    'fallback_cwd=$3',
    'user_command=$4',
    'mkdir -p "$(dirname "$state_file")" "$(dirname "$cwd_file")"',
    'if [ -f "$state_file" ]; then source "$state_file"; fi',
    'current_cwd="$fallback_cwd"',
    'if [ -f "$cwd_file" ]; then current_cwd="$(cat "$cwd_file")"; fi',
    'if ! cd -- "$current_cwd" 2>/dev/null; then',
    '  if ! cd -- "$fallback_cwd" 2>/dev/null; then',
    `    cd -- ${shellEscape(BUILDER_BOX_ROOT)} || exit 1`,
    '  fi',
    'fi',
    'persist_state() {',
    '  pwd > "$cwd_file" 2>/dev/null || true',
    '  {',
    '    set +o',
    '    shopt -p',
    '    alias -p',
    "    export -p | grep -Ev '^declare -x (BASHOPTS|EUID|OLDPWD|PIPESTATUS|PPID|PWD|SHELLOPTS|SHLVL|UID|_)=' || true",
    '    declare -pf',
    '  } > "$state_file" 2>/dev/null || true',
    '}',
    'trap persist_state EXIT',
    'eval "$user_command"',
  ].join('; ');

  return `bash -lc ${shellEscape(script)} -- ${shellEscape(sessionFile)} ${shellEscape(cwdFile)} ${shellEscape(cwd)} ${shellEscape(command)}`;
}
