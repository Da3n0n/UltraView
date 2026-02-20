export interface DatabaseViewSettings {
  pageSize: number;
  showRowNumbers: boolean;
  maxColumnWidth: number;
  nullDisplay: string;
  dateFormat: string;
  showSqlToolbar: boolean;
  autoQueryLimit: number;
}

export const defaultDatabaseViewSettings: DatabaseViewSettings = {
  pageSize: 200,
  showRowNumbers: true,
  maxColumnWidth: 320,
  nullDisplay: 'NULL',
  dateFormat: 'locale',
  showSqlToolbar: true,
  autoQueryLimit: 1000
};

export function getDatabaseViewSettings(): DatabaseViewSettings {
  return { ...defaultDatabaseViewSettings };
}
