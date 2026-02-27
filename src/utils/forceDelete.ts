import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Handles the "Force Delete" command for a file or folder.
 */
export async function forceDelete(uri: vscode.Uri) {
    if (!uri || uri.scheme !== 'file') {
        vscode.window.showErrorMessage('Force Delete only works on local files and folders.');
        return;
    }

    const filePath = uri.fsPath;
    if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('The selected file or folder does not exist.');
        return;
    }

    try {
        // 1. Identify locking processes
        const processes = await getLockingProcesses(filePath);

        if (processes.length > 0) {
            const processInfo = processes.map(p => `${p.name} (PID: ${p.pid})`).join(', ');
            const selection = await vscode.window.showWarningMessage(
                `The following processes are locking "${path.basename(filePath)}": ${processInfo}. Do you want to kill them and delete?`,
                { modal: true },
                'Force Delete'
            );

            if (selection !== 'Force Delete') {
                return;
            }

            // 2. Kill processes
            await killProcesses(processes.map(p => p.pid));
        }

        // 3. Delete the file or folder
        if (fs.lstatSync(filePath).isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(filePath);
        }

        vscode.window.showInformationMessage(`Successfully force deleted "${path.basename(filePath)}".`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to force delete: ${error.message}`);
    }
}

interface ProcessInfo {
    pid: number;
    name: string;
}

/**
 * Uses the appropriate tool based on platform to identify processes locking a file or folder.
 */
async function getLockingProcesses(targetPath: string): Promise<ProcessInfo[]> {
    const platform = process.platform;

    if (platform === 'win32') {
        return getLockingProcessesWindows(targetPath);
    } else {
        return getLockingProcessesUnix(targetPath);
    }
}

/**
 * Windows implementation using PowerShell and Restart Manager API.
 */
async function getLockingProcessesWindows(targetPath: string): Promise<ProcessInfo[]> {
    return new Promise((resolve) => {
        const script = `
$path = "${targetPath.replace(/"/g, '`"')}"
$signature = @'
[DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
public static extern int RmStartSession(out uint pSessionHandle, uint dwSessionFlags, string strSessionKey);
[DllImport("rstrtmgr.dll")]
public static extern int RmEndSession(uint dwSessionHandle);
[DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
public static extern int RmRegisterResources(uint dwSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, uint rgApplications, uint nServices, string[] rgsServiceNames);
[DllImport("rstrtmgr.dll")]
public static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, out uint lpdwRebootReasons);

[StructLayout(LayoutKind.Sequential)]
public struct RM_UNIQUE_PROCESS {
    public int dwProcessId;
    public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
    public string strServiceShortName;
    public int ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)]
    public bool bRestartable;
}
'@

Add-Type -TypeDefinition $signature -Namespace RestartManager -Name NativeMethods

$sessionHandle = 0
$sessionKey = [Guid]::NewGuid().ToString()
$res = [RestartManager.NativeMethods]::RmStartSession([ref]$sessionHandle, 0, $sessionKey)
if ($res -ne 0) { throw "RmStartSession failed with error $res" }

try {
    $res = [RestartManager.NativeMethods]::RmRegisterResources($sessionHandle, 1, @($path), 0, 0, 0, $null)
    if ($res -ne 0) { throw "RmRegisterResources failed with error $res" }

    $pnProcInfoNeeded = 0
    $pnProcInfo = 0
    $lpdwRebootReasons = 0
    $res = [RestartManager.NativeMethods]::RmGetList($sessionHandle, [ref]$pnProcInfoNeeded, [ref]$pnProcInfo, $null, [ref]$lpdwRebootReasons)
    
    if ($res -eq 234) { # ERROR_MORE_DATA
        $pnProcInfo = $pnProcInfoNeeded
        $rgAffectedApps = New-Object RestartManager.NativeMethods+RM_PROCESS_INFO[] $pnProcInfo
        $res = [RestartManager.NativeMethods]::RmGetList($sessionHandle, [ref]$pnProcInfoNeeded, [ref]$pnProcInfo, $rgAffectedApps, [ref]$lpdwRebootReasons)
        if ($res -eq 0) {
            $rgAffectedApps | Select-Object @{Name='pid'; Expression={$_.Process.dwProcessId}}, @{Name='name'; Expression={$_.strAppName}} | ConvertTo-Json
        }
    } elseif ($res -eq 0) {
        "[]"
    } else {
        throw "RmGetList failed with error $res"
    }
} finally {
    [RestartManager.NativeMethods]::RmEndSession($sessionHandle) | Out-Null
}
`;

        cp.exec(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`PS Error: ${stderr}`);
                resolve([]);
                return;
            }
            try {
                const output = stdout.trim();
                if (!output || output === "[]") {
                    resolve([]);
                } else {
                    const parsed = JSON.parse(output);
                    resolve(Array.isArray(parsed) ? parsed : [parsed]);
                }
            } catch (e) {
                console.error(`Parse Error: ${e}`);
                resolve([]);
            }
        });
    });
}

/**
 * macOS/Linux implementation using lsof.
 */
async function getLockingProcessesUnix(targetPath: string): Promise<ProcessInfo[]> {
    return new Promise((resolve) => {
        // Use +D for directory (recursive) or just path for file
        const isDir = fs.lstatSync(targetPath).isDirectory();
        const cmd = `lsof -F pc ${isDir ? '+D' : ''} "${targetPath}"`;

        cp.exec(cmd, (error, stdout) => {
            if (error && error.code !== 1) { // lsof returns 1 if no files are open
                console.error(`lsof Error: ${error.message}`);
                resolve([]);
                return;
            }

            const processes: ProcessInfo[] = [];
            const lines = stdout.split('\n');
            let currentPid: number | null = null;

            for (const line of lines) {
                if (line.startsWith('p')) {
                    currentPid = parseInt(line.substring(1));
                } else if (line.startsWith('c') && currentPid !== null) {
                    processes.push({
                        pid: currentPid,
                        name: line.substring(1)
                    });
                    currentPid = null;
                }
            }

            // De-duplicate by PID
            const unique = Array.from(new Map(processes.map(p => [p.pid, p])).values());
            resolve(unique);
        });
    });
}

/**
 * Kills processes by their PIDs.
 */
async function killProcesses(pids: number[]): Promise<void> {
    const uniquePids = [...new Set(pids)];
    const isWindows = process.platform === 'win32';

    for (const pid of uniquePids) {
        try {
            if (isWindows) {
                cp.execSync(`taskkill /F /PID ${pid}`);
            } else {
                cp.execSync(`kill -9 ${pid}`);
            }
        } catch (e) {
            console.error(`Failed to kill process ${pid}: ${e}`);
        }
    }
}
