'use client';

import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { PaintingPromptSuggestion } from '@/lib/paintings/types';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface PromptEnhanceDialogProps {
  open: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  suggestions: PaintingPromptSuggestion[];
  onOpenChange: (open: boolean) => void;
  onSelectSuggestion: (prompt: string) => void;
}

function getTagLabel(tag: PaintingPromptSuggestion['tag']) {
  if (tag === 'balanced') return 'Best starter';
  if (tag === 'advanced') return 'Advanced';
  if (tag === 'style-forward') return 'New style';
  return 'Production';
}

export function PromptEnhanceDialog({
  open,
  isLoading,
  errorMessage,
  suggestions,
  onOpenChange,
  onSelectSuggestion,
}: PromptEnhanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-[28px] border border-border/60 bg-background/96 p-0 shadow-[0_24px_120px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:max-w-3xl">
        <DialogHeader className="border-b border-border/60 px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Prompt Enhancer
          </DialogTitle>
          <DialogDescription>
            Pick one of the upgraded prompt directions below. Clicking a suggestion drops it into the composer.
          </DialogDescription>
        </DialogHeader>

        <Command className="bg-transparent">
          <CommandList className="max-h-[65vh] p-3">
            {isLoading ? (
              <div className="flex items-center justify-center gap-3 px-4 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Building stronger prompt directions...
              </div>
            ) : errorMessage ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium">Prompt enhancement failed</p>
                <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
              </div>
            ) : (
              <>
                <CommandEmpty>No prompt ideas yet.</CommandEmpty>
                <CommandGroup heading="Enhanced directions">
                  {suggestions.map((suggestion) => (
                    <CommandItem
                      key={suggestion.id}
                      value={`${suggestion.title} ${suggestion.prompt}`}
                      onSelect={() => onSelectSuggestion(suggestion.prompt)}
                      className="mb-2 rounded-2xl border border-border/60 px-4 py-4 data-[selected=true]:border-primary/40 data-[selected=true]:bg-primary/5"
                    >
                      <div className="flex w-full flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Wand2 className="h-4 w-4 text-primary" />
                            <span className="font-medium">{suggestion.title}</span>
                          </div>
                          <Badge variant="secondary" className="rounded-full">
                            {getTagLabel(suggestion.tag)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{suggestion.summary}</p>
                        <p className="line-clamp-4 text-sm leading-6 text-foreground">{suggestion.prompt}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
