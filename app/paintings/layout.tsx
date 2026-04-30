import type { ReactNode } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';

export default function PaintingsLayout({ children }: { children: ReactNode }) {
  return <SidebarLayout>{children}</SidebarLayout>;
}
