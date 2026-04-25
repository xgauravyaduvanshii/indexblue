import { createAuthClient } from 'better-auth/react';
import { dodopaymentsClient } from '@dodopayments/better-auth';
import { polarClient } from '@polar-sh/better-auth';
import { lastLoginMethodClient } from 'better-auth/client/plugins';

function getAuthBaseURL() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export const betterauthClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  plugins: [dodopaymentsClient()],
});

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  plugins: [polarClient(), lastLoginMethodClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
