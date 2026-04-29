import type { ReactNode } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';
import { CloudInfrastructureWorkspace } from '@/components/cloud-infrastructure-workspace';

export default function CloudInfrastructureLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarLayout>
      <CloudInfrastructureWorkspace>{children}</CloudInfrastructureWorkspace>
    </SidebarLayout>
  );
}
