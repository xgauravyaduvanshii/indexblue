'use client';

import { useState } from 'react';
import { ExternalLink, Maximize2, Minimize2, Minus, Plus, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function buildQrUrl(url: string) {
  const target = /expo|8081|1900[0-9]/i.test(url) ? url.replace(/^https?:\/\//, 'exp://') : url;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(target)}`;
}

export function BuilderMobilePreview({
  projectName,
  previewIframeSrc,
  previewSource,
  previewRefreshKey,
  isFullscreen,
  onRefresh,
  onToggleFullscreen,
}: {
  projectName: string;
  previewIframeSrc?: string;
  previewSource?: string | null;
  previewRefreshKey: number;
  isFullscreen: boolean;
  onRefresh: () => void;
  onToggleFullscreen: () => void;
}) {
  const [deviceScale, setDeviceScale] = useState(1);
  const previewReady = Boolean(previewIframeSrc || previewSource);
  const qrUrl = previewIframeSrc ? buildQrUrl(previewIframeSrc) : null;
  const minDeviceScale = 0.8;
  const maxDeviceScale = 1.2;
  const scaleStep = 0.1;

  const zoomOut = () => {
    setDeviceScale((value) => Math.max(minDeviceScale, Number((value - scaleStep).toFixed(2))));
  };

  const zoomIn = () => {
    setDeviceScale((value) => Math.min(maxDeviceScale, Number((value + scaleStep).toFixed(2))));
  };

  return (
    <div className="relative flex h-full overflow-hidden bg-[#09090d]">
      <div
        className="pointer-events-none absolute inset-0 opacity-75"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(83,155,255,0.45) 1.2px, transparent 0)',
          backgroundSize: '20px 20px',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(32,49,105,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%)]" />

      <div className={cn('relative z-10 flex min-h-0 flex-1', isFullscreen && 'justify-center')}>
        <div className="relative flex min-w-0 flex-1 items-center justify-center px-6 py-8">
          <div className="absolute left-6 top-5 z-20 flex items-center gap-1 rounded-full border border-white/10 bg-[#0c0d14]/88 px-1.5 py-1 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <button
              type="button"
              onClick={zoomOut}
              disabled={deviceScale <= minDeviceScale}
              className="flex size-7 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              title="Decrease device size"
            >
              <Minus className="size-3.5" />
            </button>
            <div className="min-w-[3rem] text-center text-[11px] font-medium text-white/65">
              {Math.round(deviceScale * 100)}%
            </div>
            <button
              type="button"
              onClick={zoomIn}
              disabled={deviceScale >= maxDeviceScale}
              className="flex size-7 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              title="Increase device size"
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          <div
            className="relative w-[270px] max-w-full rounded-[42px] border border-white/10 bg-[#050505] p-[10px] shadow-[0_34px_80px_rgba(0,0,0,0.55)] transition-transform duration-200 ease-out"
            style={{
              transform: `scale(${deviceScale})`,
              transformOrigin: 'center center',
            }}
          >
            <div className="absolute left-1/2 top-4 h-7 w-28 -translate-x-1/2 rounded-full bg-black/80 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]" />
            <div className="overflow-hidden rounded-[34px] border border-white/6 bg-black">
              <div className="h-[560px] w-full bg-[#06070b]">
                {previewIframeSrc ? (
                  <iframe
                    key={`${previewIframeSrc}-${previewRefreshKey}`}
                    title="Mobile builder preview"
                    src={previewIframeSrc}
                    className="h-full w-full"
                  />
                ) : previewSource ? (
                  <iframe
                    key={`mobile-srcdoc-${previewRefreshKey}`}
                    title="Mobile builder HTML preview"
                    className="h-full w-full"
                    sandbox="allow-scripts allow-same-origin"
                    srcDoc={previewSource}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                    <div className="flex size-16 items-center justify-center rounded-3xl bg-[radial-gradient(circle_at_top,#9f7aea,transparent_65%),linear-gradient(135deg,#4f46e5,#a855f7)] shadow-[0_0_42px_rgba(120,119,255,0.34)]">
                      <Smartphone className="size-7 text-white" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-white">Mobile Preview Ready</div>
                      <p className="mt-2 text-sm leading-6 text-white/48">
                        {projectName} will appear here when the builder starts a mobile preview or when you open an app
                        preview URL.
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/35">
                      Waiting for preview
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {!isFullscreen ? (
          <div className="relative z-10 hidden min-h-0 w-[290px] shrink-0 border-l border-white/8 bg-[linear-gradient(180deg,rgba(8,8,11,0.9),rgba(8,8,11,0.76))] p-5 xl:flex">
            <div className="flex min-h-0 w-full flex-col gap-5 overflow-y-auto pr-1 no-scrollbar">
              <div>
                <div className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-white/40">
                  Mobile preview
                </div>
                <h3 className="mt-3 text-xl font-semibold text-white">Preview Controls</h3>
                <p className="mt-2 text-sm leading-6 text-white/48">
                  Refresh the current device render, open the live preview, or scan the QR code on a real phone.
                </p>
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  className="h-10 w-full justify-start border-white/10 bg-white/4 text-white hover:bg-white/8"
                >
                  <RefreshCw className="size-4" />
                  Refresh Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewIframeSrc && window.open(previewIframeSrc, '_blank', 'noopener,noreferrer')}
                  disabled={!previewIframeSrc}
                  className="h-10 w-full justify-start border-white/10 bg-white/4 text-white hover:bg-white/8"
                >
                  <ExternalLink className="size-4" />
                  Open in New Tab
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onToggleFullscreen}
                  className="h-10 w-full justify-start border-white/10 bg-white/4 text-white hover:bg-white/8"
                >
                  {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  {isFullscreen ? 'Exit Fullscreen' : 'Focus Device'}
                </Button>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <QrCode className="size-4 text-sky-300" />
                  Mobile Preview
                </div>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Scan this code on your phone for the closest real-device feel during mobile app development.
                </p>
                <div className="mt-4 flex justify-center">
                  <div className="rounded-[28px] border border-white/10 bg-white p-3 shadow-[0_24px_60px_rgba(0,0,0,0.3)]">
                    {qrUrl ? (
                      <img src={qrUrl} alt="Mobile preview QR code" className="size-44 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex size-44 items-center justify-center rounded-2xl bg-[#111] text-center text-xs leading-5 text-black/50">
                        QR code will appear when a live preview is ready.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.22em] text-white/35">Status</span>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px]',
                      previewReady ? 'bg-emerald-500/12 text-emerald-200' : 'bg-white/8 text-white/45',
                    )}
                  >
                    {previewReady ? 'Live' : 'Idle'}
                  </span>
                </div>
                <div className="mt-3 text-sm text-white/70">
                  {previewIframeSrc ? previewIframeSrc : 'Waiting for a mobile preview URL from the builder sandbox.'}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
