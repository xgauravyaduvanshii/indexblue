import 'server-only';

import { decryptMcpCredentials, encryptMcpCredentials } from '@/lib/mcp/crypto';

export function encryptBuilderSecret(value: string) {
  return encryptMcpCredentials(value);
}

export function decryptBuilderSecret(value: string) {
  return decryptMcpCredentials(value);
}
