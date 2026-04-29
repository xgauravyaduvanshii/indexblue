'use client';

import { useEffect, useState } from 'react';
import { Copy, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type ApiKeyRecord = {
  id: string;
  label: string;
  tokenId: string;
  keyPrefix: string;
  status: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type GeneratedKey = {
  id: string;
  label: string;
  keyPrefix: string;
  plaintextKey: string;
};

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T & { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed.');
  }
  return payload as T;
}

export function PlatformApiKeySection() {
  const [consent, setConsent] = useState(false);
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [generatedKey, setGeneratedKey] = useState<GeneratedKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      const payload = await requestJson<{ apiKeys: ApiKeyRecord[] }>('/api/cloud/keys', { cache: 'no-store' });
      setKeys(payload.apiKeys);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load platform API keys.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadKeys();
  }, []);

  const generateKey = async () => {
    setIsGenerating(true);
    try {
      const payload = await requestJson<{ apiKey: GeneratedKey }>('/api/cloud/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ label: 'Index CLI' }),
      });
      setGeneratedKey(payload.apiKey);
      await loadKeys();
    } finally {
      setIsGenerating(false);
    }
  };

  const revokeKey = async (keyId: string) => {
    setBusyKeyId(keyId);
    try {
      await requestJson(`/api/cloud/keys/${keyId}`, {
        method: 'DELETE',
      });
      await loadKeys();
    } finally {
      setBusyKeyId(null);
    }
  };

  const regenerateKey = async (keyId: string) => {
    setBusyKeyId(keyId);
    try {
      const payload = await requestJson<{ apiKey: GeneratedKey }>(`/api/cloud/keys/${keyId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      setGeneratedKey(payload.apiKey);
      await loadKeys();
    } finally {
      setBusyKeyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-border/60 bg-card/30 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Platform API Key
          </CardTitle>
          <CardDescription>
            Connect IndexBlue to your platform for secure CLI communication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/60 p-4 text-sm text-foreground">
            <Checkbox checked={consent} onCheckedChange={(value) => setConsent(Boolean(value))} />
            <span>I understand this key grants full platform access.</span>
          </label>

          <Button onClick={() => void generateKey()} disabled={!consent || isGenerating} className="gap-2">
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Generate API Key
          </Button>

          {generatedKey ? (
            <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Generated key</p>
                  <code className="block overflow-x-auto text-xs text-foreground">{generatedKey.plaintextKey}</code>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => void navigator.clipboard.writeText(generatedKey.plaintextKey)}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Use it with <code>indexcli login --key &lt;generated_key&gt;</code>.
              </p>
            </div>
          ) : null}

          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/30 shadow-none">
        <CardHeader>
          <CardTitle>Issued keys</CardTitle>
          <CardDescription>Revoke unused keys or regenerate fresh credentials for a CLI machine.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.label}</TableCell>
                    <TableCell>
                      <code className="text-xs">{key.keyPrefix}</code>
                    </TableCell>
                    <TableCell>{key.status}</TableCell>
                    <TableCell>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</TableCell>
                    <TableCell>{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={busyKeyId === key.id}
                          onClick={() => void regenerateKey(key.id)}
                        >
                          {busyKeyId === key.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Regenerate
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-2"
                          disabled={busyKeyId === key.id || key.status === 'revoked'}
                          onClick={() => void revokeKey(key.id)}
                        >
                          {busyKeyId === key.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Revoke
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
