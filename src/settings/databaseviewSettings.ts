import * as vscode from 'vscode';

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
  const config = vscode.workspace.getConfiguration('ultraview.database');
  return {
    pageSize: config.get('pageSize', defaultDatabaseViewSettings.pageSize),
    showRowNumbers: config.get('showRowNumbers', defaultDatabaseViewSettings.showRowNumbers),
    maxColumnWidth: config.get('maxColumnWidth', defaultDatabaseViewSettings.maxColumnWidth),
    nullDisplay: config.get('nullDisplay', defaultDatabaseViewSettings.nullDisplay),
    dateFormat: config.get('dateFormat', defaultDatabaseViewSettings.dateFormat),
    showSqlToolbar: config.get('showSqlToolbar', defaultDatabaseViewSettings.showSqlToolbar),
    autoQueryLimit: config.get('autoQueryLimit', defaultDatabaseViewSettings.autoQueryLimit)
  };
}
