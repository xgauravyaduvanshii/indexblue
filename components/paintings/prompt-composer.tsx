'use client';

import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface PromptComposerProps {
  prompt: string;
  operationLabel: string;
  isSubmitting: boolean;
  isEnhancing: boolean;
  helperText: string;
  errorMessage: string | null;
  onPromptChange: (value: string) => void;
  onEnhance: () => void;
  onSubmit: () => void;
}

export function PromptComposer({
  prompt,
  operationLabel,
  isSubmitting,
  isEnhancing,
  helperText,
  errorMessage,
  onPromptChange,
  onEnhance,
  onSubmit,
}: PromptComposerProps) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Prompt</CardTitle>
          <div className="text-xs text-muted-foreground">{prompt.trim().length} chars</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5 py-4">
        <Textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Describe the image you want to generate or the edit you want applied..."
          className="min-h-[152px] resize-none rounded-2xl border-border/70 bg-muted/20"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="min-h-[20px] text-sm text-destructive">{errorMessage}</div>
            <p className="text-xs text-muted-foreground">{helperText}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onEnhance} disabled={isSubmitting || isEnhancing || !prompt.trim()}>
              {isEnhancing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Enhance
            </Button>
            <Button onClick={onSubmit} disabled={isSubmitting || !prompt.trim()}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {operationLabel}
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-xs leading-5 text-muted-foreground">
          Use Enhance to generate 3-4 upgraded prompt directions, including a safer starter version and more advanced style-forward options.
        </div>
      </CardContent>
    </Card>
  );
}
