import { parentPort, workerData } from 'worker_threads';
import { scanCommands } from './commandScanner';

void scanCommands(String(workerData)).then(
  commands => parentPort?.postMessage({ commands }),
  error => parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) }),
);
