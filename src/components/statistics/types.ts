import type { ReactNode } from 'react';

export type SemanticColor =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'muted'
  | 'success'
  | 'warning'
  | 'destructive';

export interface TrendInfo {
  value: number;
  direction: 'up' | 'down' | 'flat';
}

export interface StatisticMetric {
  key: string;
  label: string;
  /** Đã format sẵn ở caller — component không aggregate. */
  value: string;
  description?: string;
  icon?: ReactNode;
  color?: SemanticColor;
  trend?: TrendInfo;
}

export interface StatisticsHeroProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  metrics: StatisticMetric[];
  infoBanner?: ReactNode;
  actions?: ReactNode;
}
