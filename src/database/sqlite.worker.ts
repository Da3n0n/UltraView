import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs/promises';
import initSqlJs from 'sql.js';
import type { QueryExecResult } from 'sql.js';

const database = (async () => {
    const sql = await initSqlJs({ locateFile: () => workerData.wasmPath });
    return new sql.Database(await fs.readFile(workerData.filePath));
})();
void database.catch(() => {});
let queue = Promise.resolve();
parentPort?.on('message', ({ id, method, args }) => {
    queue = queue.then(async () => {
        try {
            const db = await database;
            let value: unknown;
            switch (method) {
                case 'exec': {
                    if (args[1] === undefined) { value = db.exec(args[0]); break; }
                    const results: QueryExecResult[] = [];
                    const limit = Math.max(1, Math.min(10000, Number(args[1]) || 1000));
                    // Continue stepping to preserve statements with RETURNING and
                    // multi-statement semantics, but never retain unbounded rows.
                    for (const statement of db.iterateStatements(args[0])) {
                        const columns = statement.getColumnNames();
                        const values: QueryExecResult['values'] = [];
                        while (statement.step()) {
                            if (values.length < limit) values.push(statement.get());
                        }
                        if (columns.length) results.push({ columns, values });
                    }
                    value = results;
                    break;
                }
                case 'run': db.run(args[0], args[1]); break;
                case 'getRowsModified': value = db.getRowsModified(); break;
                case 'persist': await fs.writeFile(workerData.filePath, db.export()); break;
                case 'close': db.close(); break;
                default: throw new Error('Unknown SQLite operation.');
            }
            parentPort?.postMessage({ id, value });
        } catch (error) {
            parentPort?.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
        }
    });
});
