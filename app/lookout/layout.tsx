import React from 'react';
import type { Metadata } from 'next';
import { SidebarLayout } from '@/components/sidebar-layout';

const title = 'Indexblue Lookout - Automated Search Monitoring';
const description =
  'Schedule automated searches and get notified when they complete. Monitor trends, track developments, and stay informed with intelligent lookouts.';

export const metadata: Metadata = {
  title,
  description,
  keywords:
    'automated search, monitoring, scheduled queries, AI lookouts, search automation, trend tracking',
  openGraph: {
    title,
    description,
    url: 'https://indexblue.ai/lookout',
    siteName: 'Indexblue',
    type: 'website',
    images: [
      {
        url: 'https://indexblue.ai/lookout/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Indexblue Lookout - Automated Search Monitoring',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['https://indexblue.ai/lookout/twitter-image.png'],
  },
  alternates: {
    canonical: 'https://indexblue.ai/lookout',
  },
};

interface LookoutLayoutProps {
  children: React.ReactNode;
}

export default function LookoutLayout({ children }: LookoutLayoutProps) {
  return (
    <SidebarLayout>
      <div className="min-h-screen bg-background">
        <div className="flex flex-col min-h-screen">
          <main className="flex-1" role="main" aria-label="Lookout management">
            {children}
          </main>
        </div>
      </div>
    </SidebarLayout>
  );
}
