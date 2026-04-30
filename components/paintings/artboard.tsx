'use client';

import { Download, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ArtboardProps {
  imageUrl: string | null;
  providerLabel: string;
  modelLabel: string;
  status: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
}

export function Artboard({ imageUrl, providerLabel, modelLabel, status, errorMessage, isSubmitting }: ArtboardProps) {
  return (
    <Card className="min-h-[420px] gap-0 py-0">
      <CardHeader className="border-b px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold">Canvas</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {providerLabel} · {modelLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status && <Badge variant="outline">{status}</Badge>}
            {imageUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={imageUrl} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-[360px] items-center justify-center px-5 py-5">
        {isSubmitting ? (
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Generating your image...</p>
          </div>
        ) : imageUrl ? (
          <div className="relative w-full">
            <img
              src={imageUrl}
              alt="Generated painting"
              className="mx-auto max-h-[62vh] w-auto max-w-full rounded-2xl border border-border object-contain shadow-sm"
            />
          </div>
        ) : errorMessage ? (
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <Sparkles className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">The last request failed</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        ) : (
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">Your next image will land here</p>
            <p className="text-sm text-muted-foreground">
              Pick a model, describe the scene, and generate a new painting.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
