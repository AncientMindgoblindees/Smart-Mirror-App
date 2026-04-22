/** Matches Smart-Mirror FastAPI widget JSON. */

export interface WidgetConfigOut {
  id: number;
  widget_id: string;
  enabled: boolean;
  position_row: number;
  position_col: number;
  size_rows: number;
  size_cols: number;
  config_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WidgetConfigUpdate {
  id?: number | null;
  widget_id: string;
  enabled: boolean;
  position_row: number;
  position_col: number;
  size_rows: number;
  size_cols: number;
  config_json?: Record<string, unknown> | null;
}

export interface MirrorProfile {
  id: number;
  mirror_id: string;
  user_id: string;
  display_name?: string | null;
  widget_config?: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventItem {
  id: number;
  type: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  source: string;
  priority: string;
  completed: boolean;
  metadata: Record<string, unknown>;
}

export interface CalendarEventsResponse {
  events: CalendarEventItem[];
  providers: string[];
  last_sync: string | null;
}

export interface CalendarTasksResponse {
  tasks: CalendarEventItem[];
  providers: string[];
  last_sync: string | null;
}
