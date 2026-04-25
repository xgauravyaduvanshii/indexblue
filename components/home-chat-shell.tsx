'use client';

import dynamic from 'next/dynamic';

export const HomeChatShell = dynamic(() => import('@/components/chat-interface').then((m) => m.ChatInterface), {
  ssr: false,
  loading: () => <div style={{ minHeight: 240 }} />,
});
