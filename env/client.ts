// https://env.t3.gg/docs/nextjs#create-your-schema
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const clientEnv = createEnv({
  client: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().min(1),
    NEXT_PUBLIC_BUILD_SERVER_URL: z.string().url().optional(),
    NEXT_PUBLIC_BUILD_SERVER_SECRET: z.string().optional(),
    NEXT_PUBLIC_BUILDER_WEB_RUNTIME_PROVIDER: z.enum(['e2b', 'local', 'codesandbox', 'webcontainers']).optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_BUILD_SERVER_URL: process.env.NEXT_PUBLIC_BUILD_SERVER_URL,
    NEXT_PUBLIC_BUILD_SERVER_SECRET: process.env.NEXT_PUBLIC_BUILD_SERVER_SECRET,
    NEXT_PUBLIC_BUILDER_WEB_RUNTIME_PROVIDER: process.env.NEXT_PUBLIC_BUILDER_WEB_RUNTIME_PROVIDER,
  },
});
