import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { buildDbHtml } from '../webview/dbHtml';

export class SqlDumpProvider implements vscode.CustomReadonlyEditorProvider {
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

    const worker = new Worker(path.join(this.ctx.extensionPath, 'dist', 'sqlDump.worker.js'), {
      workerData: filePath, resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    let nextId = 0;
    let stopped = false;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    worker.on('message', ({ id, result, error }) => {
      const task = pending.get(id);
      pending.delete(id);
      if (error) task?.reject(new Error(error));
      else task?.resolve(result);
    });
    const fail = (error: Error) => {
      stopped = true;
      for (const task of pending.values()) task.reject(error);
      pending.clear();
    };
    worker.on('error', fail);
    worker.on('exit', () => fail(new Error('SQL dump reader stopped. The file may exceed the reader memory limit.')));
    const request = (data: Record<string, unknown>): Promise<any> => {
      if (stopped) return Promise.reject(new Error('SQL dump reader stopped. Reopen the editor to retry.'));
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ ...data, id });
      });
    };
    panel.onDidDispose(() => { void worker.terminate(); });

    panel.webview.html = buildDbHtml(this.ctx.extensionPath, panel.webview, 'SQL Dump', filePath, path.basename(filePath));

    panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        switch (msg.type) {
          case 'ready': {
            const schema = await request({});
            const dbSize = (await fs.promises.stat(filePath)).size;
            panel.webview.postMessage({ type: 'schema', tables: schema, dbSize, sourceLabel: filePath, dbType: 'SQL Dump', dbName: path.basename(filePath) });
            break;
          }
          case 'getTableData': {
            const { rows, columns } = await request({ table: msg.table, page: msg.page, pageSize: msg.pageSize });
            panel.webview.postMessage({ type: 'tableData', table: msg.table, columns, rows, page: msg.page ?? 0 });
            break;
          }
          case 'runQuery': {
            panel.webview.postMessage({ type: 'error', message: 'SQL queries cannot be run against static dump files. Browse tables instead.' });
            break;
          }
        }
      } catch (err) {
        panel.webview.postMessage({ type: 'error', message: String(err) });
      }
    });
  }
}
