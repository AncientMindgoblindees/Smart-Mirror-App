/** Matches Smart-Mirror FastAPI widget JSON. */

export type MirrorOAuthProvider = 'google' | 'microsoft';
export type MirrorHouseholdRole = 'admin' | 'member';
export type MirrorAuthPairingIntent = 'link_provider' | 'sign_in';
export type MirrorAuthPairingStatus =
  | 'pending'
  | 'awaiting_app'
  | 'awaiting_oauth'
  | 'authorized'
  | 'complete'
  | 'expired'
  | 'error';

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

export interface MirrorSessionUser {
  uid: string;
  email: string | null;
  display_name?: string | null;
  photo_url?: string | null;
}

export interface MirrorSessionResponse {
  user: MirrorSessionUser | null;
  hardware_id: string | null;
  hardware_claimed: boolean;
  role: MirrorHouseholdRole | null;
  claimed_by_user_uid?: string | null;
}

export interface MirrorAuthProviderStatus {
  provider: MirrorOAuthProvider | string;
  connected: boolean;
  status: string;
  scopes?: string | null;
  connected_at?: string | null;
  owner_user_uid?: string | null;
  owner_email?: string | null;
  is_current_user_owner?: boolean;
  can_manage?: boolean;
  can_disconnect?: boolean;
}

export interface MirrorAuthPairingStartRequest {
  provider: MirrorOAuthProvider;
  intent?: MirrorAuthPairingIntent;
  redirect_to?: string | null;
}

export interface MirrorAuthPairingSession {
  pairing_id: string;
  provider: MirrorOAuthProvider | string;
  status: MirrorAuthPairingStatus | string;
  expires_at: string | null;
  pairing_code?: string | null;
  deep_link_url?: string | null;
  verification_url?: string | null;
  oauth_url?: string | null;
  owner_user_uid?: string | null;
  owner_email?: string | null;
}

export interface MirrorAuthPairingRedeemRequest {
  pairing_code: string;
}

export interface MirrorAuthPairingRedeemResponse {
  pairing_id: string;
  provider: MirrorOAuthProvider | string;
  status: MirrorAuthPairingStatus | string;
  expires_at: string | null;
  requires_session_replacement?: boolean;
  current_user?: MirrorSessionUser | null;
  paired_user?: MirrorSessionUser | null;
}

export interface MirrorAuthPairingStatusResponse extends MirrorAuthPairingSession {
  custom_token_ready?: boolean;
  requires_session_replacement?: boolean;
  current_user?: MirrorSessionUser | null;
  paired_user?: MirrorSessionUser | null;
  error_code?: string | null;
  error_message?: string | null;
}

export interface MirrorAuthPairingFinalizeRequest {
  replace_current_session?: boolean;
}

export interface MirrorAuthPairingTokenExchangeRequest {
  replace_current_session?: boolean;
}

export interface MirrorAuthPairingTokenExchangeResponse {
  pairing_id: string;
  custom_token: string;
  provider: MirrorOAuthProvider | string;
  user: MirrorSessionUser;
  replaced_session?: boolean;
}
