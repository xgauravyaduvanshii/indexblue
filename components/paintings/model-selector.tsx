'use client';

import type { PaintingModelDefinition } from '@/lib/paintings/types';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ModelSelectorProps {
  label?: string;
  models: PaintingModelDefinition[];
  value: string;
  onValueChange: (value: string) => void;
}

export function ModelSelector({ label = 'Model', models, value, onValueChange }: ModelSelectorProps) {
  const selectedModel = models.find((model) => model.modelId === value) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</Label>
        {selectedModel?.experimental && <Badge variant="outline">Experimental</Badge>}
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.modelId} value={model.modelId}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
