export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  REPLAY_SESSIONS: DurableObjectNamespace;
  INVESTIGATIONS: Workflow<{ runId: string }>;
  PREPARATION: Workflow<{ pairId: string }>;
  REPLAY_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  MODEL_ID?: string;
  PUBLIC_DEMO?: string;
  PUBLIC_ORIGIN?: string;
  APP_PASSWORD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}
