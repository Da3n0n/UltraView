const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const Module = require('node:module');
const { Worker } = require('node:worker_threads');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function load(relativePath, mocks = {}, transform = source => source) {
    const filename = path.join(root, relativePath);
    const source = transform(fs.readFileSync(filename, 'utf8'));
    const compiled = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const instance = new Module(filename, module);
    instance.filename = filename;
    instance.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalRequire = instance.require.bind(instance);
    instance.require = name => name in mocks ? mocks[name] : originalRequire(name);
    instance._compile(compiled, filename);
    return instance.exports;
}

const vscode = {
    window: { showInformationMessage() {}, createOutputChannel: () => ({ show() {}, append() {}, appendLine() {}, dispose() {} }) },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    EventEmitter: class { event = () => ({ dispose() {} }); fire() {} dispose() {} },
};

async function testStore(temporary) {
    const { SharedStore } = load('src/sync/sharedStore.ts', { vscode });
    const context = { globalState: { get: (key, fallback) => key === 'ultraview.sync.directory' ? temporary : key === 'ultraview.sync.migrated' ? true : fallback, update: async () => {} } };
    const store = new SharedStore(context);
    await store.initialize();
    const snapshot = 'x'.repeat(4 * 1024 * 1024);
    store.write({ projects: [{ id: 'p', name: 'original', path: temporary }], drawings: [{ id: 'd', name: 'Drawing', createdAt: 1, updatedAt: 1, tldrawContent: snapshot }] });
    const copy = store.read();
    copy.projects[0].name = 'changed externally';
    copy.drawings[0].tldrawContent = 'changed externally';
    assert.equal(store.read().projects[0].name, 'original');
    assert.equal(store.read().drawings[0].tldrawContent, snapshot);
    const start = performance.now();
    for (let i = 0; i < 100; i++) store.read();
    console.log(`Store: 100 copies with a 4 MiB drawing took ${(performance.now() - start).toFixed(1)} ms`);
    const saves = [];
    for (let i = 0; i < 8; i++) {
        store.write({ lastSyncAt: i });
        saves.push(store._save());
    }
    await Promise.all(saves);
    await store.dispose();
    assert.equal(JSON.parse(await fsp.readFile(path.join(temporary, 'sync.json'), 'utf8')).lastSyncAt, 7);
    assert.equal((await fsp.readdir(temporary)).filter(name => name.endsWith('.tmp')).length, 0);
}

async function testWorkers(temporary) {
    const init = require('sql.js');
    const sql = await init();
    const db = new sql.Database();
    db.run('CREATE TABLE records (id INTEGER PRIMARY KEY, name TEXT)');
    db.run("INSERT INTO records VALUES (1, 'first')");
    const filename = path.join(temporary, 'test.sqlite');
    await fsp.writeFile(filename, db.export());
    db.close();
    const { SqliteWorkerClient } = load('src/database/sqliteWorkerClient.ts');
    const client = new SqliteWorkerClient(filename, root);
    try {
        await client.run('BEGIN');
        await client.run('UPDATE records SET name = ? WHERE id = ?', ['updated', 1]);
        await client.run('COMMIT');
        await client.persist();
        assert.equal((await client.exec('SELECT name FROM records'))[0].values[0][0], 'updated');
        let hostTicks = 0;
        const timer = setInterval(() => hostTicks++, 1);
        const rows = await client.exec('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<200000) SELECT x FROM n', 10);
        clearInterval(timer);
        assert.equal(rows[0].values.length, 10);
        assert.ok(hostTicks > 0, 'database query must yield the host event loop');
        console.log(`SQLite: capped 200,000-row result; host advanced ${hostTicks} times during the query`);
        await client.run('BEGIN');
        await client.run("UPDATE records SET name='rolled back'");
        await client.run('ROLLBACK');
        assert.equal((await client.exec('SELECT name FROM records'))[0].values[0][0], 'updated');
    } finally { await client.close(); }
    const persisted = new sql.Database(await fsp.readFile(filename));
    assert.equal(persisted.exec('SELECT name FROM records')[0].values[0][0], 'updated');
    persisted.close();

    const project = path.join(temporary, 'commands');
    await fsp.mkdir(project);
    await fsp.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { dev: 'node app.js' } }));
    const commandResult = await new Promise((resolve, reject) => {
        const worker = new Worker(path.join(root, 'dist/commandScanner.worker.js'), { workerData: project });
        worker.once('message', value => { void worker.terminate(); resolve(value); });
        worker.once('error', reject);
    });
    assert.ok(commandResult.commands.some(command => command.name === 'dev'));
    const dump = path.join(temporary, 'dump.sql');
    await fsp.writeFile(dump, "CREATE TABLE t (id INT, name TEXT); INSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c');");
    const worker = new Worker(path.join(root, 'dist/sqlDump.worker.js'), { workerData: dump });
    try {
        const result = await new Promise((resolve, reject) => {
            worker.once('message', resolve); worker.once('error', reject);
            worker.postMessage({ id: 1, table: 't', page: 1, pageSize: 1 });
        });
        assert.equal(result.result.rows.length, 1);
        assert.equal(result.result.rows[0].name, 'b');
    } finally { await worker.terminate(); }
}

async function testGitConcurrency() {
    const source = fs.readFileSync(path.join(root, 'src/providers/gitProvider.ts'), 'utf8');
    const slice = source.slice(source.indexOf('const remoteStatusJobs'), source.indexOf('async function getCurrentBranch'));
    let active = 0, peak = 0, fetches = 0;
    const context = vm.createContext({ exports: {}, path,
        createGitRunner: () => async command => {
            if (command.startsWith('git fetch')) {
                fetches++; active++; peak = Math.max(peak, active);
                await pause(10); active--;
            }
            return { stdout: '1 2', stderr: '' };
        },
        getProjectLocalStatus: async () => ({ isGitRepo: true, branch: 'main', localChanges: 0 }),
        withTransientRetry: fn => fn(),
    });
    vm.runInContext(ts.transpileModule(slice + '\nexports.status = getProjectGitStatus;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    await Promise.all(Array.from({ length: 20 }, (_, index) => context.exports.status('repo-' + (index % 5))));
    assert.equal(fetches, 5);
    assert.equal(peak, 2);
    console.log('Git: 20 simultaneous requests coalesced to 5 fetches, maximum concurrency 2');
}

function testGraph() {
    const source = fs.readFileSync(path.join(root, 'src/providers/codeGraphProvider.ts'), 'utf8');
    const simulate = source.slice(source.indexOf('function simulate() {'), source.indexOf('// ── Render', source.indexOf('function simulate() {')));
    const nodes = Array.from({ length: 40 }, (_, i) => ({ x: (i % 8) * 150 - 400, y: Math.floor(i / 8) * 150 - 300, vx: 0, vy: 0, pinned: false }));
    const expected = structuredClone(nodes);
    for (let i = 0; i < expected.length; i++) for (let j = i + 1; j < expected.length; j++) {
        const a = expected[i], b = expected[j], dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy || 0.01, d = Math.sqrt(d2);
        if (d > 250) continue;
        const f = 100 / d2;
        a.vx -= dx / d * f; a.vy -= dy / d * f;
        b.vx += dx / d * f; b.vy += dy / d * f;
    }
    const context = vm.createContext({ nodes, edges: [], alpha: 1, REPEL_CUTOFF: 250, REPULSION: 100, CENTER_K: 0, DAMPING: 1 });
    vm.runInContext(simulate + '\nsimulate();', context);
    for (let i = 0; i < nodes.length; i++) {
        assert.ok(Math.abs(nodes[i].vx - expected[i].vx) < 1e-9);
        assert.ok(Math.abs(nodes[i].vy - expected[i].vy) < 1e-9);
    }
    const tick = source.slice(source.indexOf('function tick() {'), source.indexOf('function simulate() {'));
    let frames = 0, renders = 0;
    const idle = vm.createContext({ alpha: 0, MIN_ALPHA: 0.01, rafId: null, simRunning: true,
        document: { hidden: false, addEventListener() {} }, window: { addEventListener() {} },
        requestAnimationFrame: () => ++frames, cancelAnimationFrame() {}, render: () => renders++,
    });
    vm.runInContext(tick + '\ntick();', idle);
    assert.equal(frames, 0); assert.equal(renders, 1);
    vm.runInContext('requestRender(); requestRender();', idle);
    assert.equal(frames, 1, 'interaction redraw requests must coalesce');
    console.log('Graph: spatial forces match all-pairs reference; settled graph schedules no frames');
}

async function testRuntime(temporary) {
    const storage = path.join(temporary, 'storage');
    const extension = path.join(temporary, 'extension');
    const resources = path.join(extension, 'resources');
    await fsp.mkdir(resources, { recursive: true });
    const marker = { version: '1.0.0', commit: 'a'.repeat(40), customizationFingerprint: 'b'.repeat(64) };
    await fsp.writeFile(path.join(resources, 'gitnexus-version.json'), JSON.stringify(marker));
    const payload = path.join(temporary, 'payload');
    await fsp.mkdir(path.join(payload, 'node_modules/gitnexus/dist/cli'), { recursive: true });
    await fsp.mkdir(path.join(payload, 'node'), { recursive: true });
    await fsp.writeFile(path.join(payload, 'node_modules/gitnexus/dist/cli/index.js'), '// fixture');
    await fsp.writeFile(path.join(payload, 'node', process.platform === 'win32' ? 'node.exe' : 'node'), 'fixture');
    await fsp.writeFile(path.join(payload, 'runtime.json'), JSON.stringify({ ...marker, platform: `${process.platform}-${process.arch}` }));
    const archive = path.join(temporary, 'fixture.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', payload, '.'], { windowsHide: true });
    const { GitNexusRuntime } = load('src/gitNexus/runtime.ts', { vscode, './client': { GitNexusClient: class { async info() { throw new Error('stopped'); } } } });
    const context = { extensionPath: extension, globalStorageUri: { fsPath: storage }, globalState: { get() {}, async update() {} } };
    const bytes = await fsp.readFile(archive);
    const manifest = { ...marker, platforms: { [`${process.platform}-${process.arch}`]: { url: 'https://runtime.invalid/fixture', sha256: createHash('sha256').update(bytes).digest('hex') } } };
    await fsp.writeFile(path.join(resources, 'gitnexus-downloads.json'), JSON.stringify(manifest));
    const first = new GitNexusRuntime(context), second = new GitNexusRuntime(context);
    const originalFetch = global.fetch;
    let downloads = 0;
    try {
        global.fetch = async () => { downloads++; return new Response(bytes); };
        assert.equal((await first.status()).needsDownload, true);
        assert.equal(downloads, 0, 'checking availability must not download anything');
        const connected = new GitNexusRuntime(context);
        Object.defineProperty(connected, 'client', { get: () => ({ info: async () => ({ version: '1.0.0' }) }) });
        await connected.start();
        assert.equal(await connected.integrationInfo(), undefined);
        assert.equal(downloads, 0, 'connecting to an existing server must not install a runtime');
        const [one, two] = await Promise.all([first.install(), second.install()]);
        assert.equal(one, two); assert.ok(fs.existsSync(one));
        assert.equal(downloads, 1, 'windows share one download/install');
        assert.equal((await first.status()).needsDownload, false);
        assert.equal((await fsp.readdir(storage)).filter(name => name.includes('.lock') || name.includes('.staging-')).length, 0);
        const installedRoot = first.extractedRuntimeRoot();
        const legacyRoot = installedRoot.replace('-r3-', '-r2-');
        await fsp.rename(installedRoot, legacyRoot);
        const reused = new GitNexusRuntime(context);
        assert.equal(await reused.install(), one.replace('-r3-', '-r2-'));
        assert.equal(reused.nodeExecutable(), path.join(legacyRoot, 'node', process.platform === 'win32' ? 'node.exe' : 'node'));
        assert.equal(downloads, 1, 'compatible previous installs are reused');
        global.fetch = async () => new Response(bytes);
        const downloaded = await first.obtainArchive(new AbortController().signal);
        assert.deepEqual(await fsp.readFile(downloaded), bytes);
        await fsp.unlink(downloaded);
        global.fetch = async () => new Response('corrupt');
        await assert.rejects(first.obtainArchive(new AbortController().signal), /checksum mismatch/);
        assert.equal((await fsp.readdir(storage)).filter(name => name.endsWith('.part')).length, 0);
    } finally { global.fetch = originalFetch; }
    console.log('Runtime: concurrent installation is atomic; corrupt downloads are rejected and cleaned up');
}

async function testBoundedProviders() {
    const { boundedQuery } = load('src/providers/postgresProvider.ts', {
        vscode, '../webview/dbHtml': {},
    }, source => source + '\nexport { boundedQuery };');
    const fields = [{ name: 'id' }];
    const result = await boundedQuery({ query(query) {
        const metadata = { fields, rowCount: 5000 };
        for (let id = 0; id < 5000; id++) query.emit('row', { id }, metadata);
        query.emit('end', metadata);
    } }, 'SELECT id FROM fixture', 25);
    assert.equal(result.rows.length, 25);
    assert.equal(result.rowCount, 5000);

    let handler;
    const messages = [];
    const connection = { async *stream() { for (let id = 0; id < 5000; id++) yield { id }; }, close() {} };
    const { DuckDbProvider } = load('src/providers/duckdbProvider.ts', {
        vscode: { ...vscode, Uri: { file: fsPath => ({ fsPath }) }, workspace: { getConfiguration: () => ({ get: () => 25 }) } },
        '../webview/dbHtml': { buildDbHtml: () => '' },
        duckdb: { Database: class { connect() { return connection; } close() {} } },
    });
    const panel = { webview: { onDidReceiveMessage: fn => { handler = fn; }, postMessage: msg => messages.push(msg) }, onDidDispose() {} };
    await new DuckDbProvider({ extensionPath: root }).resolveCustomEditor({ uri: { fsPath: 'fixture.duckdb' } }, panel);
    await handler({ type: 'runQuery', sql: 'SELECT id FROM fixture' });
    const queryResult = messages.find(message => message.type === 'queryResult');
    assert.ok(queryResult, JSON.stringify(messages));
    assert.equal(queryResult.rows.length, 25);
    console.log('PostgreSQL and DuckDB: 5,000 streamed rows retain only the requested 25');
}

async function testBackup(temporary) {
    let active = 0, peak = 0, destroyed = 0;
    const uploaded = [];
    class S3Client {
        async send(command) {
            active++; peak = Math.max(peak, active);
            assert.ok(command.input.Body instanceof fs.ReadStream);
            let bytes = 0;
            for await (const chunk of command.input.Body) bytes += chunk.length;
            assert.equal(bytes, command.input.ContentLength);
            await pause(5);
            uploaded.push(command.input.Key);
            active--;
        }
        destroy() { destroyed++; }
    }
    const { backupProject } = load('src/s3backup/s3BackupManager.ts', {
        '@aws-sdk/client-s3': { S3Client, PutObjectCommand: class { constructor(input) { this.input = input; } } },
    });
    const folder = path.join(temporary, 'backup');
    await fsp.mkdir(folder);
    for (let index = 0; index < 7; index++) await fsp.writeFile(path.join(folder, `${index}.txt`), 'content');
    const result = await backupProject('fixture', folder, { endpoint: 'https://unused.invalid', accessKeyId: 'fixture', secretAccessKey: 'fixture', bucket: 'fixture' });
    assert.equal(result.fileCount, 7); assert.equal(uploaded.length, 7);
    assert.equal(peak, 3); assert.equal(destroyed, 7);
    console.log('Backup: streamed all files with maximum concurrency 3 and disposed clients');
}

async function testActivation() {
    let finishStore;
    const initialized = new Promise(resolve => { finishStore = resolve; });
    const views = new Map();
    let editors = 0, gitResolutions = 0;
    const source = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
    const ast = ts.createSourceFile('extension.ts', source, ts.ScriptTarget.Latest, true);
    const mocks = {};
    for (const statement of ast.statements) {
        if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text === 'vscode') continue;
        const moduleExports = {};
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
            const name = binding.name.text;
            moduleExports[name] = class {
                static viewId = name;
                resolveWebviewView() { if (name === 'GitProvider') gitResolutions++; }
            };
        }
        mocks[statement.moduleSpecifier.text] = moduleExports;
    }
    mocks['./theme'] = { registerThemeCommands() {} };
    mocks['./sync/sharedStore'] = { SharedStore: class { initialize() { return initialized; } async dispose() {} } };
    mocks.vscode = { ...vscode, commands: { registerCommand: () => ({ dispose() {} }) }, window: {
        ...vscode.window,
        registerCustomEditorProvider() { editors++; return { dispose() {} }; },
        registerWebviewViewProvider(id, provider) { views.set(id, provider); return { dispose() {} }; },
    } };
    const extension = load('src/extension.ts', mocks);
    await extension.activate({ subscriptions: [] });
    assert.equal(editors, 8, 'editors register before the store is ready');
    const opening = views.get('GitProvider').resolveWebviewView({}, {}, { isCancellationRequested: false });
    await pause(1);
    assert.equal(gitResolutions, 0, 'store-dependent views must wait');
    finishStore();
    await opening;
    assert.equal(gitResolutions, 1);
    await extension.deactivate();
    console.log('Activation: editors register immediately; Git waits for store readiness');
}

(async () => {
    const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'ultraview-performance-'));
    try {
        await testStore(temporary);
        await testWorkers(temporary);
        await testGitConcurrency();
        testGraph();
        await testRuntime(temporary);
        await testBoundedProviders();
        await testBackup(temporary);
        await testActivation();
        console.log('All performance regression checks passed.');
    } finally { await fsp.rm(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
