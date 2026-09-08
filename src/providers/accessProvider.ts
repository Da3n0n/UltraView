import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildDbHtml } from '../webview/dbHtml';

 
type MDBReaderType = typeof import('mdb-reader').default;

export class AccessProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.ctx.extensionPath, 'dist'))],
    };
    const filePath = document.uri.fsPath;

    let reader: InstanceType<MDBReaderType> | null = null;
    let opening: Promise<InstanceType<MDBReaderType>> | undefined;
    const getReader = async () => {
      if (reader) return reader;
      if (!opening) opening = (async () => {
          const MDBReader = require('mdb-reader') as MDBReaderType;
          const buf = await fs.promises.readFile(filePath);
          reader = new MDBReader(buf);
          return reader;
      })();
      try { return await opening; }
      finally { opening = undefined; }
    };

    panel.webview.html = buildDbHtml(this.ctx.extensionPath, panel.webview, 'Access DB', filePath, path.basename(filePath));

    panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        const r = await getReader();
        switch (msg.type) {
          case 'ready': {
            const tableNames: string[] = r.getTableNames();
            const tables = tableNames.map((name: string) => {
              const tbl = r.getTable(name);
              const cols = tbl.getColumnNames().map((c: string) => ({ name: c, type: 'text', pk: 0, notnull: 0 }));
              return { name, rowCount: null, columns: cols };
            });
            const dbSize = (await fs.promises.stat(filePath)).size;
            panel.webview.postMessage({ type: 'schema', tables, dbSize, sourceLabel: filePath, dbType: 'Access DB (.mdb/.accdb)', dbName: path.basename(filePath) });
            break;
          }
          case 'getTableData': {
            const tbl = r.getTable(msg.table);
            const pageSize = Math.max(1, Math.min(1000, Number(msg.pageSize) || 200));
            const offset = Math.max(0, Number(msg.page) || 0) * pageSize;
            const rows = tbl.getData({ rowOffset: offset, rowLimit: pageSize });
            const cols = tbl.getColumnNames() as string[];
            const rowsAsObj = rows;
            panel.webview.postMessage({ type: 'tableData', table: msg.table, columns: cols, rows: rowsAsObj, page: msg.page ?? 0 });
            break;
          }
          case 'runQuery': {
            panel.webview.postMessage({ type: 'error', message: 'SQL queries are not supported for Access DB files. Browse tables instead.' });
            break;
          }
        }
      } catch (err) {
        panel.webview.postMessage({ type: 'error', message: String(err) });
      }
    });
  }
}
