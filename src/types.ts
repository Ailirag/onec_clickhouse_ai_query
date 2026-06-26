export interface ClickHouseConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  database: string;
  useHttps: boolean;
}

export interface ColumnInfo {
  name: string;
  type: string;
  comment?: string;
}

export interface TableInfo {
  name: string;
  database?: string;
  columns: ColumnInfo[];
  rowCount?: number;
  sampleRows?: any[];
  isEventLog?: boolean; // True if it matches 1C Event Log structure
}

export interface DbSchema {
  tables: TableInfo[];
  databases?: string[];
  selectedDatabase?: string;
}

export interface AiSessionState {
  selectedDatabase?: string;
  lastQuestion?: string;
  lastSql?: string;
}

export interface DialogMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  options?: string[];
}

export interface QueryResult {
  success: boolean;
  sql: string;
  rows?: any[];
  columns?: string[];
  columnTypes?: Record<string, string>;
  error?: string;
  elapsedMs?: number;
  rowCount?: number;
  repair?: {
    originalSql: string;
    originalError?: string;
    explanation?: string;
  };
}

export interface QueryAnalysis {
  summary: string;
  insights: string[];
  suggestedChart?: {
    type: 'bar' | 'line' | 'pie' | 'area' | 'none';
    xAxis: string;
    yAxis: string;
    title: string;
  };
}

export interface QueryHistoryItem {
  id: string;
  timestamp: string;
  question: string;
  sql: string;
  result?: QueryResult;
  analysis?: QueryAnalysis;
}

export interface AiConfig {
  provider: "gemini" | "yandexgpt";
  geminiModel: string;
  yandexApiKey: string;
  yandexFolderId: string;
  yandexModel: string;
  systemPrompt?: string;
}

export type UserRole = "admin" | "user";
