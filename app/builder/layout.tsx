import React from 'react';
import type { Metadata } from 'next';
import { SidebarLayout } from '@/components/sidebar-layout';

const title = 'Indexblue Builder';
const description = 'Build and organize app workflows, prompts, and tool-driven experiences inside Indexblue.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: 'https://indexblue.ai/builder',
    siteName: 'Indexblue',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  alternates: {
    canonical: 'https://indexblue.ai/builder',
  },
};

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout>
      <div className="min-h-screen bg-background">{children}</div>
    </SidebarLayout>
  );
}
