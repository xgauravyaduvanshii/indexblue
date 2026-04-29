'use client';

import { AreaChart } from '@/components/charts/area-chart';
import { Area } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';

type MetricPoint = {
  createdAt: string;
  cpuPercent: number;
  memoryPercent: number;
};

type StartRatePoint = {
  timestamp: string;
  count: number;
};

export function CloudMetricChart({ data }: { data: MetricPoint[] }) {
  if (data.length === 0) {
    return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No health data yet</div>;
  }

  const chartData = data.map((point) => ({
    date: new Date(point.createdAt),
    cpu: Number(point.cpuPercent.toFixed(2)),
    memory: Number(point.memoryPercent.toFixed(2)),
  }));

  return (
    <div className="h-[220px] w-full min-w-0">
      <AreaChart
        data={chartData}
        xDataKey="date"
        margin={{ top: 10, right: 12, bottom: 10, left: 10 }}
        animationDuration={500}
        aspectRatio="auto"
        className="h-full w-full"
      >
        <Grid horizontal numTicksRows={4} />
        <Area dataKey="cpu" fill="var(--chart-1)" fillOpacity={0.25} stroke="var(--chart-1)" strokeWidth={2} />
        <Area dataKey="memory" fill="var(--chart-3)" fillOpacity={0.18} stroke="var(--chart-3)" strokeWidth={1.8} />
      </AreaChart>
    </div>
  );
}

export function CloudStartRateChart({ data }: { data: StartRatePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        No sandbox starts recorded yet
      </div>
    );
  }

  const chartData = data.map((point) => ({
    date: new Date(point.timestamp),
    starts: point.count,
  }));

  return (
    <div className="h-[180px] w-full min-w-0">
      <AreaChart
        data={chartData}
        xDataKey="date"
        margin={{ top: 10, right: 12, bottom: 10, left: 10 }}
        animationDuration={500}
        aspectRatio="auto"
        className="h-full w-full"
      >
        <Grid horizontal numTicksRows={4} />
        <Area dataKey="starts" fill="var(--chart-2)" fillOpacity={0.25} stroke="var(--chart-2)" strokeWidth={2} />
      </AreaChart>
    </div>
  );
}
