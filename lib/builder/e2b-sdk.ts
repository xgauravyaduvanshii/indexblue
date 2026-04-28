import 'server-only';

import { withNativeFetch } from '@/lib/builder/e2b-fetch';

type E2BModule = typeof import('@e2b/code-interpreter');

let e2bModulePromise: Promise<E2BModule> | null = null;

export async function loadE2BModule(): Promise<E2BModule> {
  if (!e2bModulePromise) {
    e2bModulePromise = withNativeFetch(() => import('@e2b/code-interpreter')).catch((error) => {
      e2bModulePromise = null;
      throw error;
    });
  }

  return await e2bModulePromise;
}

export function isCommandExitError(error: unknown): error is {
  name?: string;
  message: string;
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  return (
    !!error &&
    typeof error === 'object' &&
    'exitCode' in error &&
    typeof (error as { exitCode?: unknown }).exitCode === 'number' &&
    'stdout' in error &&
    typeof (error as { stdout?: unknown }).stdout === 'string' &&
    'stderr' in error &&
    typeof (error as { stderr?: unknown }).stderr === 'string'
  );
}
