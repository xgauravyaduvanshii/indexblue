'use client';

import type { ChangeEvent } from 'react';
import type { PaintingModelDefinition, PaintingOperation, PaintingProvider } from '@/lib/paintings/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ModelSelector } from './model-selector';

interface ControlPanelProps {
  providers: PaintingProvider[];
  models: PaintingModelDefinition[];
  selectedProvider: PaintingProvider;
  selectedModelId: string;
  selectedOperation: PaintingOperation;
  size: string;
  count: number;
  quality: string;
  background: string;
  seed: number | null;
  negativePrompt: string;
  promptUpsampling: boolean;
  referenceFile: File | null;
  disabled?: boolean;
  onProviderChange: (value: PaintingProvider) => void;
  onModelChange: (value: string) => void;
  onOperationChange: (value: PaintingOperation) => void;
  onSizeChange: (value: string) => void;
  onCountChange: (value: number) => void;
  onQualityChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
  onSeedChange: (value: number | null) => void;
  onNegativePromptChange: (value: string) => void;
  onPromptUpsamplingChange: (value: boolean) => void;
  onReferenceFileChange: (file: File | null) => void;
}

export function ControlPanel({
  providers,
  models,
  selectedProvider,
  selectedModelId,
  selectedOperation,
  size,
  count,
  quality,
  background,
  seed,
  negativePrompt,
  promptUpsampling,
  referenceFile,
  disabled,
  onProviderChange,
  onModelChange,
  onOperationChange,
  onSizeChange,
  onCountChange,
  onQualityChange,
  onBackgroundChange,
  onSeedChange,
  onNegativePromptChange,
  onPromptUpsamplingChange,
  onReferenceFileChange,
}: ControlPanelProps) {
  const selectedModel = models.find((model) => model.modelId === selectedModelId) ?? null;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    onReferenceFileChange(event.target.files?.[0] ?? null);
  }

  return (
    <Card className="h-fit w-full max-w-[300px] gap-0 py-0">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-sm font-semibold">Paintings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Provider</Label>
          <Select value={selectedProvider} onValueChange={(value) => onProviderChange(value as PaintingProvider)}>
            <SelectTrigger className="w-full" disabled={disabled}>
              <SelectValue placeholder="Choose a provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ModelSelector models={models} value={selectedModelId} onValueChange={onModelChange} />

        {selectedModel?.description && <p className="text-xs leading-5 text-muted-foreground">{selectedModel.description}</p>}

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Mode</Label>
          <Select value={selectedOperation} onValueChange={(value) => onOperationChange(value as PaintingOperation)}>
            <SelectTrigger className="w-full" disabled={disabled}>
              <SelectValue placeholder="Choose a mode" />
            </SelectTrigger>
            <SelectContent>
              {(selectedModel?.operations ?? ['generate']).map((operation) => (
                <SelectItem key={operation} value={operation}>
                  {operation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Image Size</Label>
          <Select value={size} onValueChange={onSizeChange}>
            <SelectTrigger className="w-full" disabled={disabled}>
              <SelectValue placeholder="Choose a size" />
            </SelectTrigger>
            <SelectContent>
              {(selectedModel?.sizes ?? ['1024x1024']).map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedModel?.supportsCount && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Number Images</Label>
            <Input
              type="number"
              min={1}
              max={selectedModel.maxCount ?? 4}
              value={count}
              disabled={disabled}
              onChange={(event) => onCountChange(Number.parseInt(event.target.value || '1', 10))}
            />
          </div>
        )}

        {selectedModel?.supportsQuality && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Quality</Label>
            <Select value={quality} onValueChange={onQualityChange}>
              <SelectTrigger className="w-full" disabled={disabled}>
                <SelectValue placeholder="Choose quality" />
              </SelectTrigger>
              <SelectContent>
                {(selectedModel.qualityOptions ?? ['auto', 'high', 'medium', 'low']).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedModel?.supportsBackground && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Background</Label>
            <Select value={background} onValueChange={onBackgroundChange}>
              <SelectTrigger className="w-full" disabled={disabled}>
                <SelectValue placeholder="Choose background" />
              </SelectTrigger>
              <SelectContent>
                {(selectedModel.backgroundOptions ?? ['auto', 'transparent', 'opaque']).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedModel?.supportsSeed && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Seed</Label>
            <Input
              type="number"
              min={0}
              value={seed ?? ''}
              disabled={disabled}
              placeholder="Random"
              onChange={(event) =>
                onSeedChange(event.target.value.trim() ? Number.parseInt(event.target.value, 10) : null)
              }
            />
          </div>
        )}

        {selectedModel?.supportsNegativePrompt && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Negative Prompt</Label>
            <Input
              value={negativePrompt}
              disabled={disabled}
              placeholder="Things to avoid in the image"
              onChange={(event) => onNegativePromptChange(event.target.value)}
            />
          </div>
        )}

        {selectedModel?.supportsPromptUpsampling && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 px-3 py-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Prompt Upsampling</Label>
              <p className="text-xs text-muted-foreground">Let the provider add creative detail before generating.</p>
            </div>
            <Switch checked={promptUpsampling} disabled={disabled} onCheckedChange={onPromptUpsamplingChange} />
          </div>
        )}

        {selectedOperation !== 'generate' && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Reference Image</Label>
            <Input type="file" accept="image/*" disabled={disabled} onChange={handleFileChange} />
            {referenceFile && <p className="text-xs text-muted-foreground">{referenceFile.name}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
