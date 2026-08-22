export interface MaintenanceTask {
  readonly lockId: number;
  readonly label: string;
  execute(): Promise<MaintenanceResult>;
}

export interface MaintenanceResult {
  counters?: { name: string; value: number; labels?: Record<string, string> }[];
  gauges?: { name: string; value: number }[];
}

export const MAINTENANCE_TASKS = 'MAINTENANCE_TASKS';
