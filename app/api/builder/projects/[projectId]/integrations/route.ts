import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Client } from 'pg';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import { decryptBuilderSecret, encryptBuilderSecret } from '@/lib/builder/secrets';
import { listBuilderProjectIntegrations, upsertBuilderProjectIntegration } from '@/lib/db/builder-app-queries';

export const runtime = 'nodejs';

const saveIntegrationSchema = z.object({
  type: z.enum(['database', 'payment']),
  provider: z.string().min(1),
  status: z.string().optional(),
  dashboardUrl: z.string().url().nullable().optional(),
  webhookStatus: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string(), z.string()).default({}),
});

const healthSchema = z.object({
  type: z.enum(['database', 'payment']),
  provider: z.string().min(1),
  credentials: z.record(z.string(), z.string()).optional(),
});

async function checkDatabaseIntegration(provider: string, credentials: Record<string, string>) {
  switch (provider) {
    case 'prisma-postgres': {
      const connectionString = credentials.databaseUrl || credentials.directUrl;
      if (!connectionString) {
        return { healthy: false, message: 'Database URL is required.' };
      }

      const client = new Client({ connectionString });
      await client.connect();
      await client.query('select 1');
      await client.end();
      return { healthy: true, message: 'Postgres connection succeeded.' };
    }
    case 'supabase': {
      if (!credentials.projectUrl || !credentials.anonKey) {
        return { healthy: false, message: 'Project URL and anon key are required.' };
      }

      const response = await fetch(`${credentials.projectUrl.replace(/\/$/, '')}/rest/v1/`, {
        headers: {
          apikey: credentials.anonKey,
          Authorization: `Bearer ${credentials.anonKey}`,
        },
      });

      return response.ok
        ? { healthy: true, message: 'Supabase project responded successfully.' }
        : { healthy: false, message: `Supabase check failed with status ${response.status}.` };
    }
    case 'convex': {
      if (!credentials.deploymentUrl) {
        return { healthy: false, message: 'Deployment URL is required.' };
      }

      const response = await fetch(credentials.deploymentUrl, { method: 'GET' });
      return response.ok
        ? { healthy: true, message: 'Convex deployment responded successfully.' }
        : { healthy: false, message: `Convex check failed with status ${response.status}.` };
    }
    case 'sqlite': {
      return credentials.dbName
        ? { healthy: true, message: `SQLite database "${credentials.dbName}" is configured.` }
        : { healthy: false, message: 'Database name is required.' };
    }
    case 'firebase': {
      return credentials.projectId && credentials.apiKey
        ? { healthy: true, message: 'Firebase credentials are present.' }
        : { healthy: false, message: 'Project ID and API key are required.' };
    }
    default:
      return { healthy: false, message: 'Unsupported database provider.' };
  }
}

async function checkPaymentIntegration(provider: string, credentials: Record<string, string>) {
  switch (provider) {
    case 'stripe': {
      if (!credentials.secretKey) {
        return { healthy: false, message: 'Stripe secret key is required.' };
      }

      const response = await fetch('https://api.stripe.com/v1/account', {
        headers: {
          Authorization: `Bearer ${credentials.secretKey}`,
        },
      });

      return response.ok
        ? { healthy: true, message: 'Stripe credentials are valid.' }
        : { healthy: false, message: `Stripe check failed with status ${response.status}.` };
    }
    case 'razorpay': {
      if (!credentials.keyId || !credentials.keySecret) {
        return { healthy: false, message: 'Razorpay key ID and key secret are required.' };
      }

      const basic = Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/items?count=1', {
        headers: {
          Authorization: `Basic ${basic}`,
        },
      });

      return response.ok
        ? { healthy: true, message: 'Razorpay credentials are valid.' }
        : { healthy: false, message: `Razorpay check failed with status ${response.status}.` };
    }
    case 'paypal': {
      if (!credentials.clientId || !credentials.clientSecret) {
        return { healthy: false, message: 'PayPal client ID and client secret are required.' };
      }

      const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
      const response = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      return response.ok
        ? { healthy: true, message: 'PayPal credentials are valid.' }
        : { healthy: false, message: `PayPal check failed with status ${response.status}.` };
    }
    case 'phonepe': {
      return credentials.merchantId && credentials.saltKey
        ? { healthy: true, message: 'PhonePe credentials are present.' }
        : { healthy: false, message: 'Merchant ID and salt key are required.' };
    }
    case 'google-pay': {
      return credentials.merchantId && credentials.merchantName
        ? { healthy: true, message: 'Google Pay merchant configuration is present.' }
        : { healthy: false, message: 'Merchant name and merchant ID are required.' };
    }
    default:
      return { healthy: false, message: 'Unsupported payment provider.' };
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || undefined;
  const integrations = await listBuilderProjectIntegrations({
    projectId: access.project.id,
    userId: access.session.user.id,
    type,
  });

  return Response.json({
    integrations: integrations.map((integration) => ({
      ...integration,
      credentials: integration.encryptedCredentials
        ? (() => {
            try {
              return JSON.parse(decryptBuilderSecret(integration.encryptedCredentials)) as Record<string, string>;
            } catch {
              return {};
            }
          })()
        : {},
    })),
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = saveIntegrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid integration payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const credentials = parsed.data.credentials;
  const record = await upsertBuilderProjectIntegration({
    projectId: access.project.id,
    userId: access.session.user.id,
    type: parsed.data.type,
    provider: parsed.data.provider,
    status: parsed.data.status ?? 'connected',
    dashboardUrl: parsed.data.dashboardUrl ?? null,
    webhookStatus: parsed.data.webhookStatus ?? null,
    metadata: parsed.data.metadata ?? {},
    encryptedCredentials: encryptBuilderSecret(JSON.stringify(credentials)),
  });

  return Response.json({
    integration: {
      ...record,
      credentials,
    },
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = healthSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid integration health payload.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const saved = await listBuilderProjectIntegrations({
    projectId: access.project.id,
    userId: access.session.user.id,
    type: parsed.data.type,
  });

  const existing = saved.find((integration) => integration.provider === parsed.data.provider) ?? null;
  const savedCredentials =
    existing?.encryptedCredentials != null
      ? (() => {
          try {
            return JSON.parse(decryptBuilderSecret(existing.encryptedCredentials)) as Record<string, string>;
          } catch {
            return {};
          }
        })()
      : {};
  const credentials =
    parsed.data.credentials && Object.keys(parsed.data.credentials).length > 0
      ? parsed.data.credentials
      : savedCredentials;

  try {
    const result =
      parsed.data.type === 'database'
        ? await checkDatabaseIntegration(parsed.data.provider, credentials)
        : await checkPaymentIntegration(parsed.data.provider, credentials);

    const updated = await upsertBuilderProjectIntegration({
      projectId: access.project.id,
      userId: access.session.user.id,
      type: parsed.data.type,
      provider: parsed.data.provider,
      status: result.healthy ? 'connected' : 'attention',
      dashboardUrl: existing?.dashboardUrl ?? null,
      webhookStatus: existing?.webhookStatus ?? null,
      metadata: existing?.metadata ?? {},
      encryptedCredentials: encryptBuilderSecret(JSON.stringify(credentials)),
      lastCheckedAt: new Date(),
      lastCheckStatus: result.healthy ? 'healthy' : 'error',
      lastError: result.healthy ? null : result.message,
    });

    return Response.json({
      integration: {
        ...updated,
        credentials,
      },
      health: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Health check failed.';
    await upsertBuilderProjectIntegration({
      projectId: access.project.id,
      userId: access.session.user.id,
      type: parsed.data.type,
      provider: parsed.data.provider,
      status: 'attention',
      dashboardUrl: existing?.dashboardUrl ?? null,
      webhookStatus: existing?.webhookStatus ?? null,
      metadata: existing?.metadata ?? {},
      encryptedCredentials: encryptBuilderSecret(JSON.stringify(credentials)),
      lastCheckedAt: new Date(),
      lastCheckStatus: 'error',
      lastError: message,
    });

    return Response.json(
      {
        health: {
          healthy: false,
          message,
        },
      },
      { status: 400 },
    );
  }
}
