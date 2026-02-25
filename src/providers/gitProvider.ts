import * as vscode from 'vscode';
import { buildGitHtml } from '../git/gitUi';
import { GitProjects } from '../git/gitProjects';
import { GitAccounts } from '../git/gitAccounts';
import { GitProfile, GitProvider as GitProviderType } from '../git/types';
import { applyLocalAccount, applyGlobalAccount, clearLocalAccount } from '../git/gitCredentials';
import { SharedStore } from '../sync/sharedStore';

export class GitProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'ultraview.git';
  private view?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  private manager: GitProjects;
  private accounts: GitAccounts;
  private store: SharedStore;

  constructor(context: vscode.ExtensionContext, store: SharedStore) {
    this.context = context;
    this.store = store;
    this.manager = new GitProjects(context, store);
    this.accounts = new GitAccounts(context, store);
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = buildGitHtml();

    // Hot-reload when another IDE writes the shared sync file
    this.store.on('changed', () => this.postState());

    webviewView.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready': {
          this.postState();
          break;
        }
        case 'addProject': {
          const uri = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Select folder for project' });
          if (uri && uri[0]) {
            const folder = uri[0].fsPath;
            const name = await vscode.window.showInputBox({ prompt: 'Project name', value: nameFromPath(folder) });
            if (name !== undefined) {
              const project = this.manager.addProject({ name: name || nameFromPath(folder), path: folder });
              this.postState();
              this.view?.webview.postMessage({ type: 'projectAdded', project });
            }
          }
          break;
        }
        case 'addCurrentProject': {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders && workspaceFolders.length > 0) {
            const folder = workspaceFolders[0].uri.fsPath;
            const name = workspaceFolders[0].name;
            const project = this.manager.addProject({ name, path: folder });
            this.postState();
            this.view?.webview.postMessage({ type: 'projectAdded', project });
          } else {
            vscode.window.showInformationMessage('No workspace folder open. Use "+ Add" to select a folder.');
          }
          break;
        }
        case 'refresh': {
          this.postState();
          break;
        }
        case 'delete': {
          const id = msg.id;
          console.log('[Ultraview] Delete project:', id);
          this.manager.removeProject(id);
          this.postState();
          this.view?.webview.postMessage({ type: 'projectRemoved', id });
          break;
        }
        case 'manageProfiles': {
          const profiles = this.manager.listProfiles();
          if (profiles.length === 0) {
            vscode.window.showInformationMessage('No profiles yet. Click "+ New" to create one.');
          } else {
            const items = profiles.map(p => ({ label: p.name, description: p.userEmail || '', profile: p }));
            const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select profile to edit' });
            if (selected) {
              await this._editProfile(selected.profile);
            }
          }
          break;
        }
        case 'newProfile': {
          await this._createProfile();
          break;
        }
        case 'setProfile': {
          const pid = msg.profileId || null;
          this.context.workspaceState.update('ultraview.git.currentProfile', pid);
          this.postState();
          break;
        }
        case 'open': {
          const id = msg.id;
          const project = this.manager.listProjects().find(p => p.id === id);
          if (project) {
            const uri = vscode.Uri.file(project.path);
            vscode.commands.executeCommand('vscode.openFolder', uri, false);
          }
          break;
        }
        case 'getAccounts': {
          this.postState();
          break;
        }
        case 'addAccount': {
          await this._addAccount();
          break;
        }
        case 'removeAccount': {
          const accountId = msg.accountId;
          console.log('[Ultraview] Remove account:', accountId);
          if (accountId) {
            const keys = this.accounts.listSshKeys().filter(k => k.accountId === accountId);
            for (const key of keys) {
              await this.accounts.deletePrivateKey(key.id);
              this.accounts.removeSshKey(key.id);
            }
            this.accounts.removeAccount(accountId);
            this.postState();
            this.view?.webview.postMessage({ type: 'accountRemoved', accountId });
          }
          break;
        }
        case 'generateSshKey': {
          const accountId = msg.accountId;
          const account = this.accounts.getAccount(accountId);
          if (account) {
            const keyName = await vscode.window.showInputBox({ prompt: 'SSH key name (optional)', value: `ultraview-${account.username}` });
            const key = await this.accounts.generateSshKey(accountId, account.provider, keyName || undefined);
            const { sshKeyUrl } = this.accounts.getProviderUrl(account.provider);
            await vscode.env.clipboard.writeText(key.publicKey);
            vscode.window.showInformationMessage(`SSH key generated and copied to clipboard! Opening ${account.provider} settings...`);
            vscode.env.openExternal(vscode.Uri.parse(sshKeyUrl));
            this.postState();
            this.view?.webview.postMessage({ type: 'sshKeyGenerated', key, accountId });
          }
          break;
        }
        case 'openSshSettings': {
          const accountId = msg.accountId;
          const account = this.accounts.getAccount(accountId);
          if (account) {
            const { sshKeyUrl } = this.accounts.getProviderUrl(account.provider);
            vscode.env.openExternal(vscode.Uri.parse(sshKeyUrl));
          }
          break;
        }
        case 'openTokenSettings': {
          const accountId = msg.accountId;
          const account = this.accounts.getAccount(accountId);
          if (account) {
            const { tokenUrl } = this.accounts.getProviderUrl(account.provider);
            vscode.env.openExternal(vscode.Uri.parse(tokenUrl));
          }
          break;
        }
        case 'setGlobalAccount': {
          const accountId = msg.accountId || undefined;
          this.accounts.setGlobalAccount(accountId);
          // Apply git identity globally
          if (accountId) {
            const acc = this.accounts.getAccount(accountId);
            if (acc) {
              await applyGlobalAccount(acc);
            }
          }
          this.postState();
          break;
        }
        case 'setLocalAccount': {
          const workspaceUri = msg.workspaceUri;
          const accountId = msg.accountId || undefined;
          this.accounts.setLocalAccount(workspaceUri, accountId);
          // Apply or clear git credentials in the local repo
          if (accountId && workspaceUri) {
            const acc = this.accounts.getAccount(accountId);
            if (acc) {
              await applyLocalAccount(workspaceUri, acc, acc.token);
            }
          } else if (workspaceUri) {
            await clearLocalAccount(workspaceUri);
          }
          this.postState();
          break;
        }
        case 'applyCredentials': {
          const accountId = msg.accountId;
          const workspaceUri = msg.workspaceUri || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '');
          const acc = this.accounts.getAccount(accountId);
          if (acc && workspaceUri) {
            await applyLocalAccount(workspaceUri, acc, acc.token);
            vscode.window.showInformationMessage(
              `✓ Git credentials applied for ${acc.username} in this workspace. Reload the Source Control panel.`
            );
          } else {
            vscode.window.showWarningMessage('No account or workspace found to apply credentials to.');
          }
          break;
        }
        case 'addToken': {
          const accountId = msg.accountId;
          const account = this.accounts.getAccount(accountId);
          if (!account) break;

          if (account.provider === 'github') {
            const method = await vscode.window.showQuickPick([
              { label: 'browser', description: 'Sign in via browser (OAuth)' },
              { label: 'manual', description: 'Paste personal access token' }
            ], { placeHolder: 'How to add token?' });
            if (!method) break;
            if (method.label === 'browser') {
              try {
                const session = await vscode.authentication.getSession('github', ['repo', 'read:user', 'user:email'], { forceNewSession: true });
                this.accounts.updateAccount(accountId, { token: session.accessToken });
                this.postState();
                this.view?.webview.postMessage({ type: 'accountUpdated', accountId });
                vscode.window.showInformationMessage(`Token updated for ${account.username} via GitHub OAuth.`);
              } catch (err: any) {
                vscode.window.showErrorMessage(`OAuth failed: ${err?.message ?? String(err)}`);
              }
              break;
            }
          }

          const token = await vscode.window.showInputBox({ prompt: 'Enter personal access token (with repo scope)', password: true });
          if (token) {
            this.accounts.updateAccount(accountId, { token });
            this.postState();
            this.view?.webview.postMessage({ type: 'accountUpdated', accountId });
          }
          break;
        }
      }
    });

    // initial state
    this.postState();
  }

  postState() {
    if (!this.view) return;
    const projects = this.manager.listProjects();
    const profiles = this.manager.listProfiles();
    const currentProfileId = this.context.workspaceState.get<string | null>('ultraview.git.currentProfile', null);
    const activeRepo = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
    const accounts = this.accounts.listAccounts();
    const globalAccount = this.accounts.getGlobalAccount();
    const localAccount = activeRepo ? this.accounts.getLocalAccount(activeRepo) : undefined;
    const sshKeys = this.accounts.listSshKeys();
    this.view.webview.postMessage({ type: 'state', projects, profiles, currentProfileId, activeRepo, accounts, globalAccount, localAccount, sshKeys });
  }

  private async _addAccount(): Promise<void> {
    const provider = await vscode.window.showQuickPick([
      { label: 'github', description: 'GitHub' },
      { label: 'gitlab', description: 'GitLab' },
      { label: 'azure', description: 'Azure DevOps' }
    ], { placeHolder: 'Select provider' });

    if (!provider) return;

    // Offer browser OAuth for supported providers
    const browserProviders: Record<string, string> = { github: 'github', gitlab: 'gitlab', azure: 'microsoft' };
    const authMethodItems: { label: string; description: string }[] = [
      { label: 'browser', description: 'Sign in via browser (OAuth) — recommended' },
      { label: 'ssh', description: 'Generate SSH key' },
      { label: 'token', description: 'Enter personal access token manually' }
    ];

    const authMethod = await vscode.window.showQuickPick(authMethodItems, { placeHolder: 'How do you want to authenticate?' });
    if (!authMethod) return;

    if (authMethod.label === 'browser') {
      await this._addAccountViaOAuth(provider.label as GitProviderType, browserProviders[provider.label]);
      return;
    }

    const username = await vscode.window.showInputBox({ prompt: `${provider.label} username` });
    if (!username) return;

    const isGlobal = await vscode.window.showQuickPick([
      { label: 'global', description: 'Use for all workspaces' },
      { label: 'local', description: 'Use only for current workspace' }
    ], { placeHolder: 'Account scope' });

    const account = this.accounts.addAccount({
      provider: provider.label as GitProviderType,
      username,
      isGlobal: isGlobal?.label === 'global'
    });

    const activeRepo = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
    if (account.isGlobal) {
      this.accounts.setGlobalAccount(account.id);
      await applyGlobalAccount(account);
    } else if (activeRepo) {
      this.accounts.setLocalAccount(activeRepo, account.id);
      await applyLocalAccount(activeRepo, account, account.token);
    }

    if (authMethod.label === 'ssh') {
      const keyName = await vscode.window.showInputBox({ prompt: 'SSH key name (optional)', value: `ultraview-${username}` });
      const key = await this.accounts.generateSshKey(account.id, account.provider, keyName || undefined);
      const { sshKeyUrl } = this.accounts.getProviderUrl(account.provider);
      await vscode.env.clipboard.writeText(key.publicKey);
      vscode.window.showInformationMessage(`SSH key generated and copied to clipboard! Opening ${account.provider} settings...`);
      vscode.env.openExternal(vscode.Uri.parse(sshKeyUrl));
      this.accounts.updateAccount(account.id, { sshKeyId: key.id });
    } else if (authMethod.label === 'token') {
      const token = await vscode.window.showInputBox({ prompt: 'Enter personal access token', password: true });
      if (token) {
        this.accounts.updateAccount(account.id, { token });
      }
    }

    this.postState();
    this.view?.webview.postMessage({ type: 'accountAdded', account });
  }

  private async _addAccountViaOAuth(gitProvider: GitProviderType, vsCodeProviderId: string): Promise<void> {
    const scopes: Record<string, string[]> = {
      github: ['repo', 'read:user', 'user:email'],
      gitlab: ['read_user', 'api'],
      microsoft: ['499b84ac-1321-427f-aa17-267ca6975798/.default']
    };

    try {
      const session = await vscode.authentication.getSession(vsCodeProviderId, scopes[vsCodeProviderId] || [], { forceNewSession: true });
      const username = session.account.label;
      const token = session.accessToken;

      // Try to fetch email from provider API
      let email: string | undefined;
      try {
        if (gitProvider === 'github') {
          const res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'Ultraview-VSCode' }
          });
          if (res.ok) {
            const data = await res.json() as { email?: string };
            email = data.email || undefined;
          }
        } else if (gitProvider === 'gitlab') {
          const res = await fetch('https://gitlab.com/api/v4/user', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json() as { email?: string };
            email = data.email || undefined;
          }
        }
      } catch {
        // email is optional
      }

      const isGlobal = await vscode.window.showQuickPick([
        { label: 'global', description: 'Use for all workspaces' },
        { label: 'local', description: 'Use only for current workspace' }
      ], { placeHolder: 'Account scope' });

      const account = this.accounts.addAccount({ provider: gitProvider, username, email, token, isGlobal: isGlobal?.label === 'global' });

      const activeRepo = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      if (account.isGlobal) {
        this.accounts.setGlobalAccount(account.id);
        await applyGlobalAccount(account);
      } else if (activeRepo) {
        this.accounts.setLocalAccount(activeRepo, account.id);
        await applyLocalAccount(activeRepo, account, token);
      }

      vscode.window.showInformationMessage(`Signed in as ${username} via ${gitProvider}!`);
      this.postState();
      this.view?.webview.postMessage({ type: 'accountAdded', account });
    } catch (err: any) {
      if (err?.name === 'Error' && String(err?.message).includes('No authentication provider')) {
        vscode.window.showErrorMessage(`Browser sign-in for ${gitProvider} requires the ${gitProvider} extension to be installed. Use manual token instead.`);
      } else {
        vscode.window.showErrorMessage(`OAuth sign-in failed: ${err?.message ?? String(err)}`);
      }
    }
  }

  static openAsPanel(context: vscode.ExtensionContext, store: SharedStore) {
    const panel = vscode.window.createWebviewPanel('ultraview.git.panel', 'Git Projects', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    panel.webview.html = buildGitHtml();

    const manager = new GitProjects(context, store);
    const accounts = new GitAccounts(context, store);

    // Hot-reload when another IDE writes the shared sync file
    const onChanged = () => {
      const projects = manager.listProjects();
      const profiles = manager.listProfiles();
      const currentProfileId = context.workspaceState.get<string | null>('ultraview.git.currentProfile', null);
      const activeRepo = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      const accountList = accounts.listAccounts();
      const globalAccount = accounts.getGlobalAccount();
      const localAccount = activeRepo ? accounts.getLocalAccount(activeRepo) : undefined;
      const sshKeys = accounts.listSshKeys();
      panel.webview.postMessage({ type: 'state', projects, profiles, currentProfileId, activeRepo, accounts: accountList, globalAccount, localAccount, sshKeys });
    };
    store.on('changed', onChanged);
    panel.onDidDispose(() => store.off('changed', onChanged));

    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready': {
          const projects = manager.listProjects();
          const profiles = manager.listProfiles();
          const currentProfileId = context.workspaceState.get<string | null>('ultraview.git.currentProfile', null);
          const activeRepo = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
          const accountList = accounts.listAccounts();
          const globalAccount = accounts.getGlobalAccount();
          const localAccount = activeRepo ? accounts.getLocalAccount(activeRepo) : undefined;
          const sshKeys = accounts.listSshKeys();
          panel.webview.postMessage({ type: 'state', projects, profiles, currentProfileId, activeRepo, accounts: accountList, globalAccount, localAccount, sshKeys });
          break;
        }
        case 'addProject': {
          const uri = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Select folder for project' });
          if (uri && uri[0]) {
            const folder = uri[0].fsPath;
            const name = await vscode.window.showInputBox({ prompt: 'Project name', value: nameFromPath(folder) });
            if (name !== undefined) {
              const project = manager.addProject({ name: name || nameFromPath(folder), path: folder });
              panel.webview.postMessage({ type: 'projectAdded', project });
            }
          }
          break;
        }
        case 'addCurrentProject': {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders && workspaceFolders.length > 0) {
            const folder = workspaceFolders[0].uri.fsPath;
            const name = workspaceFolders[0].name;
            const project = manager.addProject({ name, path: folder });
            panel.webview.postMessage({ type: 'projectAdded', project });
          } else {
            vscode.window.showInformationMessage('No workspace folder open. Use "+ Add" to select a folder.');
          }
          break;
        }
        case 'refresh': {
          const projects = manager.listProjects();
          const profiles = manager.listProfiles();
          const currentProfileId = context.workspaceState.get<string | null>('ultraview.git.currentProfile', null);
          const activeRepo = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
          panel.webview.postMessage({ type: 'state', projects, profiles, currentProfileId, activeRepo });
          break;
        }
        case 'delete': {
          const id = msg.id;
          manager.removeProject(id);
          panel.webview.postMessage({ type: 'projectRemoved', id });
          break;
        }
        case 'setProfile': {
          const pid = msg.profileId || null;
          context.workspaceState.update('ultraview.git.currentProfile', pid);
          const projects = manager.listProjects();
          const profiles = manager.listProfiles();
          const currentProfileId = context.workspaceState.get<string | null>('ultraview.git.currentProfile', null);
          const activeRepo = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
          panel.webview.postMessage({ type: 'state', projects, profiles, currentProfileId, activeRepo });
          break;
        }
        case 'open': {
          const id = msg.id;
          const project = manager.listProjects().find(p => p.id === id);
          if (project) {
            const uri = vscode.Uri.file(project.path);
            vscode.commands.executeCommand('vscode.openFolder', uri, false);
          }
          break;
        }
        case 'newProfile': {
          const name = await vscode.window.showInputBox({ prompt: 'Profile name' });
          if (name) {
            const userName = await vscode.window.showInputBox({ prompt: 'Git user name (optional)' });
            const userEmail = await vscode.window.showInputBox({ prompt: 'Git user email (optional)' });
            const profile = manager.addProfile({ name, userName: userName || undefined, userEmail: userEmail || undefined });
            panel.webview.postMessage({ type: 'profileAdded', profile });
          }
          break;
        }
        case 'manageProfiles': {
          vscode.window.showInformationMessage('Manage profiles from the sidebar panel');
          break;
        }
        case 'getAccounts': {
          const activeRepo = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
          const accountList = accounts.listAccounts();
          const globalAccount = accounts.getGlobalAccount();
          const localAccount = activeRepo ? accounts.getLocalAccount(activeRepo) : undefined;
          const sshKeys = accounts.listSshKeys();
          panel.webview.postMessage({ type: 'state', projects: manager.listProjects(), profiles: manager.listProfiles(), currentProfileId: context.workspaceState.get<string | null>('ultraview.git.currentProfile', null), activeRepo, accounts: accountList, globalAccount, localAccount, sshKeys });
          break;
        }
        case 'addAccount': {
          const provider = await vscode.window.showQuickPick([
            { label: 'github', description: 'GitHub' },
            { label: 'gitlab', description: 'GitLab' },
            { label: 'azure', description: 'Azure DevOps' }
          ], { placeHolder: 'Select provider' });
          if (!provider) break;

          const browserProviders: Record<string, string> = { github: 'github', gitlab: 'gitlab', azure: 'microsoft' };
          const authMethod = await vscode.window.showQuickPick([
            { label: 'browser', description: 'Sign in via browser (OAuth) — recommended' },
            { label: 'ssh', description: 'Generate SSH key' },
            { label: 'token', description: 'Enter personal access token manually' }
          ], { placeHolder: 'How do you want to authenticate?' });
          if (!authMethod) break;

          if (authMethod.label === 'browser') {
            const vsCodeProviderId = browserProviders[provider.label];
            const scopes: Record<string, string[]> = {
              github: ['repo', 'read:user', 'user:email'],
              gitlab: ['read_user', 'api'],
              microsoft: ['499b84ac-1321-427f-aa17-267ca6975798/.default']
            };
            try {
              const session = await vscode.authentication.getSession(vsCodeProviderId, scopes[vsCodeProviderId] || [], { forceNewSession: true });
              const username = session.account.label;
              const token = session.accessToken;
              let email: string | undefined;
              try {
                if (provider.label === 'github') {
                  const res = await fetch('https://api.github.com/user', { headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'Ultraview-VSCode' } });
                  if (res.ok) { const d = await res.json() as { email?: string }; email = d.email || undefined; }
                } else if (provider.label === 'gitlab') {
                  const res = await fetch('https://gitlab.com/api/v4/user', { headers: { 'Authorization': `Bearer ${token}` } });
                  if (res.ok) { const d = await res.json() as { email?: string }; email = d.email || undefined; }
                }
              } catch { /* email optional */ }
              const isGlobal = await vscode.window.showQuickPick([
                { label: 'global', description: 'Use for all workspaces' },
                { label: 'local', description: 'Use only for current workspace' }
              ], { placeHolder: 'Account scope' });
              const account = accounts.addAccount({ provider: provider.label as GitProviderType, username, email, token, isGlobal: isGlobal?.label === 'global' });
              const activeRepo = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
              if (account.isGlobal) { accounts.setGlobalAccount(account.id); } else if (activeRepo) { accounts.setLocalAccount(activeRepo, account.id); }
              vscode.window.showInformationMessage(`Signed in as ${username} via ${provider.label}!`);
              panel.webview.postMessage({ type: 'accountAdded', account });
            } catch (err: any) {
              if (String(err?.message).includes('No authentication provider')) {
                vscode.window.showErrorMessage(`Browser sign-in for ${provider.label} requires the ${provider.label} extension. Use manual token instead.`);
              } else {
                vscode.window.showErrorMessage(`OAuth sign-in failed: ${err?.message ?? String(err)}`);
              }
            }
            break;
          }

          const username = await vscode.window.showInputBox({ prompt: `${provider.label} username` });
          if (!username) break;
          const isGlobal = await vscode.window.showQuickPick([
            { label: 'global', description: 'Use for all workspaces' },
            { label: 'local', description: 'Use only for current workspace' }
          ], { placeHolder: 'Account scope' });
          const account = accounts.addAccount({ provider: provider.label as GitProviderType, username, isGlobal: isGlobal?.label === 'global' });
          const activeRepo = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
          if (account.isGlobal) { accounts.setGlobalAccount(account.id); } else if (activeRepo) { accounts.setLocalAccount(activeRepo, account.id); }
          if (authMethod.label === 'ssh') {
            const keyName = await vscode.window.showInputBox({ prompt: 'SSH key name (optional)', value: `ultraview-${username}` });
            const key = await accounts.generateSshKey(account.id, account.provider, keyName || undefined);
            const { sshKeyUrl } = accounts.getProviderUrl(account.provider);
            await vscode.env.clipboard.writeText(key.publicKey);
            vscode.window.showInformationMessage(`SSH key generated and copied to clipboard! Opening ${account.provider} settings...`);
            vscode.env.openExternal(vscode.Uri.parse(sshKeyUrl));
            accounts.updateAccount(account.id, { sshKeyId: key.id });
          } else if (authMethod.label === 'token') {
            const token = await vscode.window.showInputBox({ prompt: 'Enter personal access token (with repo scope)', password: true });
            if (token) { accounts.updateAccount(account.id, { token }); }
          }
          panel.webview.postMessage({ type: 'accountAdded', account });
          break;
        }
        case 'removeAccount': {
          const accountId = msg.accountId;
          if (accountId) {
            const keys = accounts.listSshKeys().filter(k => k.accountId === accountId);
            for (const key of keys) {
              await accounts.deletePrivateKey(key.id);
              accounts.removeSshKey(key.id);
            }
            accounts.removeAccount(accountId);
            panel.webview.postMessage({ type: 'accountRemoved', accountId });
          }
          break;
        }
        case 'generateSshKey': {
          const accountId = msg.accountId;
          const account = accounts.getAccount(accountId);
          if (account) {
            const keyName = await vscode.window.showInputBox({ prompt: 'SSH key name (optional)', value: `ultraview-${account.username}` });
            const key = await accounts.generateSshKey(accountId, account.provider, keyName || undefined);
            const { sshKeyUrl } = accounts.getProviderUrl(account.provider);
            await vscode.env.clipboard.writeText(key.publicKey);
            vscode.window.showInformationMessage(`SSH key generated and copied to clipboard! Opening ${account.provider} settings...`);
            vscode.env.openExternal(vscode.Uri.parse(sshKeyUrl));
            panel.webview.postMessage({ type: 'sshKeyGenerated', key, accountId });
          }
          break;
        }
        case 'openSshSettings': {
          const accountId = msg.accountId;
          const account = accounts.getAccount(accountId);
          if (account) {
            const { sshKeyUrl } = accounts.getProviderUrl(account.provider);
            vscode.env.openExternal(vscode.Uri.parse(sshKeyUrl));
          }
          break;
        }
        case 'openTokenSettings': {
          const accountId = msg.accountId;
          const account = accounts.getAccount(accountId);
          if (account) {
            const { tokenUrl } = accounts.getProviderUrl(account.provider);
            vscode.env.openExternal(vscode.Uri.parse(tokenUrl));
          }
          break;
        }
        case 'setGlobalAccount': {
          const accountId = msg.accountId || undefined;
          accounts.setGlobalAccount(accountId);
          break;
        }
        case 'setLocalAccount': {
          const workspaceUri = msg.workspaceUri;
          const accountId = msg.accountId || undefined;
          accounts.setLocalAccount(workspaceUri, accountId);
          panel.webview.postMessage({ type: 'state', projects: manager.listProjects(), profiles: manager.listProfiles(), currentProfileId: context.workspaceState.get<string | null>('ultraview.git.currentProfile', null), activeRepo: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', accounts: accounts.listAccounts(), globalAccount: accounts.getGlobalAccount(), localAccount: workspaceUri ? accounts.getLocalAccount(workspaceUri) : undefined, sshKeys: accounts.listSshKeys() });
          break;
        }
        case 'addToken': {
          const accountId = msg.accountId;
          const acct = accounts.getAccount(accountId);
          if (!acct) break;

          if (acct.provider === 'github') {
            const method = await vscode.window.showQuickPick([
              { label: 'browser', description: 'Sign in via browser (OAuth)' },
              { label: 'manual', description: 'Paste personal access token' }
            ], { placeHolder: 'How to add token?' });
            if (!method) break;
            if (method.label === 'browser') {
              try {
                const session = await vscode.authentication.getSession('github', ['repo', 'read:user', 'user:email'], { forceNewSession: true });
                accounts.updateAccount(accountId, { token: session.accessToken });
                panel.webview.postMessage({ type: 'accountUpdated', accountId });
                vscode.window.showInformationMessage(`Token updated for ${acct.username} via GitHub OAuth.`);
              } catch (err: any) {
                vscode.window.showErrorMessage(`OAuth failed: ${err?.message ?? String(err)}`);
              }
              break;
            }
          }

          const token = await vscode.window.showInputBox({ prompt: 'Enter personal access token (with repo scope)', password: true });
          if (token) {
            accounts.updateAccount(accountId, { token });
            panel.webview.postMessage({ type: 'accountUpdated', accountId });
          }
          break;
        }
      }
    });
  }

  private async _createProfile(): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: 'Profile name' });
    if (!name) return;

    const userName = await vscode.window.showInputBox({ prompt: 'Git user name (optional)' });
    const userEmail = await vscode.window.showInputBox({ prompt: 'Git user email (optional)' });

    const profile = this.manager.addProfile({ name, userName: userName || undefined, userEmail: userEmail || undefined });
    this.postState();
    this.view?.webview.postMessage({ type: 'profileAdded', profile });
  }

  private async _editProfile(profile: GitProfile): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: 'Profile name', value: profile.name });
    if (name === undefined) return;

    const userName = await vscode.window.showInputBox({ prompt: 'Git user name (optional)', value: profile.userName || '' });
    const userEmail = await vscode.window.showInputBox({ prompt: 'Git user email (optional)', value: profile.userEmail || '' });

    const profiles = this.manager.listProfiles();
    const idx = profiles.findIndex(p => p.id === profile.id);
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], name, userName: userName || undefined, userEmail: userEmail || undefined };
      this.manager.saveProfiles(profiles);
      this.postState();
    }
  }
}

function nameFromPath(p: string) {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}
