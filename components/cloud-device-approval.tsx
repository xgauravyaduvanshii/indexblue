'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T & { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed.');
  }
  return payload as T;
}

export function CloudDeviceApproval({
  code,
  requestedLabel,
  status,
  expired,
}: {
  code: string;
  requestedLabel: string | null;
  status: string;
  expired: boolean;
}) {
  const [approvalState, setApprovalState] = useState(status);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setIsApproving(true);
    setError(null);
    try {
      const payload = await requestJson<{ status: string }>(`/api/cloud/device-sessions/code/${code}/approve`, {
        method: 'POST',
      });
      setApprovalState(payload.status);
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Failed to approve device session.');
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <Card className="border-border/60 bg-card/35 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Approve CLI pairing
        </CardTitle>
        <CardDescription>
          Pairing code <code>{code}</code> requested access for <strong>{requestedLabel || 'Index CLI'}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {expired ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            This device session has expired. Generate a fresh code from <code>indexcli generate-key</code>.
          </div>
        ) : approvalState === 'approved' || approvalState === 'claimed' ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              CLI pairing approved
            </div>
            <p className="mt-2 text-muted-foreground">
              The terminal that started this flow can now claim the generated API key and finish login automatically.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
            Approving this device will create a platform API key with full remote CLI access to your connected machine.
          </div>
        )}

        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        <Button onClick={() => void handleApprove()} disabled={expired || isApproving || approvalState !== 'pending'} className="gap-2">
          {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Approve device
        </Button>
      </CardContent>
    </Card>
  );
}
