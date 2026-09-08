import { Worker } from 'worker_threads';
import * as path from 'path';
import type { QueryExecResult, BindParams } from 'sql.js';

/** One isolated database per editor; query and export work never blocks the host. */
export class SqliteWorkerClient {
    private readonly worker: Worker;
    private nextId = 0;
    private stopped = false;
    private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

    constructor(filePath: string, extensionPath: string) {
        this.worker = new Worker(path.join(extensionPath, 'dist', 'sqlite.worker.js'), {
            workerData: { filePath, wasmPath: path.join(extensionPath, 'dist', 'sql-wasm.wasm') },
        });
        this.worker.on('message', ({ id, value, error }) => {
            const request = this.pending.get(id);
            this.pending.delete(id);
            if (error) request?.reject(new Error(error));
            else request?.resolve(value);
        });
        const fail = (error: Error) => {
            this.stopped = true;
            for (const request of this.pending.values()) request.reject(error);
            this.pending.clear();
        };
        this.worker.on('error', fail);
        this.worker.on('exit', () => fail(new Error('SQLite editor closed.')));
    }

    private call<T>(method: string, args: unknown[] = []): Promise<T> {
        if (this.stopped) return Promise.reject(new Error('SQLite editor closed.'));
        const id = ++this.nextId;
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, method, args });
        });
    }

    exec(sql: string, rowLimit?: number): Promise<QueryExecResult[]> { return this.call('exec', [sql, rowLimit]); }
    run(sql: string, params?: BindParams): Promise<void> { return this.call('run', [sql, params]); }
    getRowsModified(): Promise<number> { return this.call('getRowsModified'); }
    persist(): Promise<void> { return this.call('persist'); }
    async close(): Promise<void> {
        try { if (!this.stopped) await this.call('close'); }
        finally { await this.worker.terminate(); }
    }
}
