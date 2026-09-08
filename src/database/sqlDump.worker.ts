import { parentPort, workerData } from 'worker_threads';
import { readFile } from 'fs/promises';
import { parseSqlDump } from './sqlDumpParser';

const tables = readFile(String(workerData), 'utf8').then(parseSqlDump);
void tables.catch(() => {});
parentPort?.on('message', async ({ id, table, page, pageSize }) => {
    try {
        const parsed = await tables;
        const result = table === undefined
            ? parsed.map(({ name, columns, rows }) => ({ name, columns, rowCount: rows.length }))
            : (() => {
                const selected = parsed.find(item => item.name === table);
                const size = Math.max(1, Math.min(1000, Number(pageSize) || 200));
                const offset = Math.max(0, Number(page) || 0) * size;
                const rows = selected?.rows.slice(offset, offset + size) ?? [];
                return { rows, columns: selected?.columns.length ? selected.columns.map(column => column.name) : Object.keys(rows[0] ?? {}) };
            })();
        parentPort?.postMessage({ id, result });
    } catch (error) {
        parentPort?.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
});
