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
        case 'addRepo': {
          if (this.view) {
            await GitProvider._handleAddRepo(this.view.webview, this.manager, this.accounts, () => this.postState());
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
        case 'authOptions': {
          const accountId = msg.accountId;
          const account = this.accounts.getAccount(accountId);
          if (!account) break;
          const option = await vscode.window.showQuickPick([
            { label: '$(key) Manage SSH Key', description: 'Generate and configure SSH key' },
            { label: '$(key) Manage Token', description: 'Add or update personal access token' }
          ], { placeHolder: `Manage Auth for ${account.username}` });
          if (option?.label.includes('SSH')) {
            await GitProvider._handleGenerateSshKey(accountId, this.view?.webview, this.accounts, () => this.postState());
          } else if (option?.label.includes('Token')) {
            await GitProvider._handleAddToken(accountId, this.view?.webview, this.accounts);
          }
          break;
        }
        case 'accountContextMenu': {
          const accountId = msg.accountId;
          const workspaceUri = msg.workspaceUri;
          const acc = this.accounts.getAccount(accountId);
          if (!acc) break;
          const isGlobal = this.accounts.getGlobalAccount()?.id === accountId;
          const isLocal = workspaceUri && this.accounts.getLocalAccount(workspaceUri)?.id === accountId;

          const option = await vscode.window.showQuickPick([
            { label: '$(zap) Apply Credentials', description: 'Apply credentials to current workspace' },
            { label: isGlobal ? '$(close) Unset Global Account' : '$(globe) Set as Global Account', description: isGlobal ? 'Remove as default for all workspaces' : 'Use as default for all workspaces' },
            { label: isLocal ? '$(close) Unset Local Account' : '$(folder) Set as Local Account', description: isLocal ? 'Remove from this workspace' : 'Use specifically for this workspace' }
          ], { placeHolder: `Quick Actions for ${acc.username}` });

          if (option) {
            if (option.label.includes('Global')) {
              this.accounts.setGlobalAccount(isGlobal ? undefined : accountId);
              if (!isGlobal) await applyGlobalAccount(acc);
              this.postState();
            } else if (option.label.includes('Local')) {
              this.accounts.setLocalAccount(workspaceUri, isLocal ? undefined : accountId);
              if (isLocal) {
                await clearLocalAccount(workspaceUri);
              } else {
                await applyLocalAccount(workspaceUri, acc, acc.token);
              }
              this.postState();
            }
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
          if (!email) {
            const emailsRes = await fetch('https://api.github.com/user/emails', {
              headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'Ultraview-VSCode' }
            });
            if (emailsRes.ok) {
              const emailsData = await emailsRes.json() as { email: string, primary: boolean }[];
              const primaryEmail = emailsData.find(e => e.primary);
              if (primaryEmail) {
                email = primaryEmail.email;
              } else if (emailsData.length > 0) {
                email = emailsData[0].email;
              }
            }
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
        case 'addRepo': {
          await GitProvider._handleAddRepo(panel.webview, manager, accounts, () => {
            const activeRepo = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
            panel.webview.postMessage({ type: 'state', projects: manager.listProjects(), profiles: manager.listProfiles(), currentProfileId: context.workspaceState.get<string | null>('ultraview.git.currentProfile', null), activeRepo, accounts: accounts.listAccounts(), globalAccount: accounts.getGlobalAccount(), localAccount: activeRepo ? accounts.getLocalAccount(activeRepo) : undefined, sshKeys: accounts.listSshKeys() });
          });
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
                  if (!email) {
                    const emailsRes = await fetch('https://api.github.com/user/emails', { headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'Ultraview-VSCode' } });
                    if (emailsRes.ok) {
                      const emailsData = await emailsRes.json() as { email: string, primary: boolean }[];
                      const primaryEmail = emailsData.find(e => e.primary);
                      if (primaryEmail) email = primaryEmail.email;
                      else if (emailsData.length > 0) email = emailsData[0].email;
                    }
                  }
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
        case 'authOptions': {
          const accountId = msg.accountId;
          const account = accounts.getAccount(accountId);
          if (!account) break;
          const option = await vscode.window.showQuickPick([
            { label: '$(key) Manage SSH Key', description: 'Generate and configure SSH key' },
            { label: '$(key) Manage Token', description: 'Add or update personal access token' }
          ], { placeHolder: `Manage Auth for ${account.username}` });
          if (option?.label.includes('SSH')) {
            await GitProvider._handleGenerateSshKey(accountId, panel.webview, accounts);
          } else if (option?.label.includes('Token')) {
            await GitProvider._handleAddToken(accountId, panel.webview, accounts);
          }
          break;
        }
        case 'accountContextMenu': {
          const accountId = msg.accountId;
          const workspaceUri = msg.workspaceUri;
          const acc = accounts.getAccount(accountId);
          if (!acc) break;
          const isGlobal = accounts.getGlobalAccount()?.id === accountId;
          const isLocal = workspaceUri && accounts.getLocalAccount(workspaceUri)?.id === accountId;

          const option = await vscode.window.showQuickPick([
            { label: '$(zap) Apply Credentials', description: 'Apply credentials to current workspace' },
            { label: isGlobal ? '$(close) Unset Global Account' : '$(globe) Set as Global Account', description: isGlobal ? 'Remove as default for all workspaces' : 'Use as default for all workspaces' },
            { label: isLocal ? '$(close) Unset Local Account' : '$(folder) Set as Local Account', description: isLocal ? 'Remove from this workspace' : 'Use specifically for this workspace' }
          ], { placeHolder: `Quick Actions for ${acc.username}` });

          if (option) {
            if (option.label.includes('Global')) {
              accounts.setGlobalAccount(isGlobal ? undefined : accountId);
              if (!isGlobal) await applyGlobalAccount(acc);
              // Trigger refresh
              panel.webview.postMessage({ type: 'state', projects: manager.listProjects(), profiles: manager.listProfiles(), currentProfileId: context.workspaceState.get<string | null>('ultraview.git.currentProfile', null), activeRepo: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', accounts: accounts.listAccounts(), globalAccount: accounts.getGlobalAccount(), localAccount: workspaceUri ? accounts.getLocalAccount(workspaceUri) : undefined, sshKeys: accounts.listSshKeys() });
            } else if (option.label.includes('Local')) {
              accounts.setLocalAccount(workspaceUri, isLocal ? undefined : accountId);
              if (isLocal) {
                await clearLocalAccount(workspaceUri);
              } else {
                await applyLocalAccount(workspaceUri, acc, acc.token);
              }
              // Trigger refresh
              panel.webview.postMessage({ type: 'state', projects: manager.listProjects(), profiles: manager.listProfiles(), currentProfileId: context.workspaceState.get<string | null>('ultraview.git.currentProfile', null), activeRepo: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', accounts: accounts.listAccounts(), globalAccount: accounts.getGlobalAccount(), localAccount: workspaceUri ? accounts.getLocalAccount(workspaceUri) : undefined, sshKeys: accounts.listSshKeys() });
            }
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

  static async _handleGenerateSshKey(accountId: string, webview: vscode.Webview | undefined, activeAccs: GitAccounts, postStateCb?: () => void) {
    const account = activeAccs.getAccount(accountId);
    if (!account) return;
    const keyName = await vscode.window.showInputBox({ prompt: 'SSH key name (optional)', value: `ultraview-${account.username}` });
    const key = await activeAccs.generateSshKey(accountId, account.provider, keyName || undefined);
    const { sshKeyUrl } = activeAccs.getProviderUrl(account.provider);
    await vscode.env.clipboard.writeText(key.publicKey);
    vscode.window.showInformationMessage(`SSH key generated and copied to clipboard! Opening ${account.provider} settings...`);
    vscode.env.openExternal(vscode.Uri.parse(sshKeyUrl));
    if (postStateCb) postStateCb();
    webview?.postMessage({ type: 'sshKeyGenerated', key, accountId });
  }

  static async _handleAddToken(accountId: string, webview: vscode.Webview | undefined, activeAccs: GitAccounts) {
    const acct = activeAccs.getAccount(accountId);
    if (!acct) return;

    if (acct.provider === 'github') {
      const method = await vscode.window.showQuickPick([
        { label: 'browser', description: 'Sign in via browser (OAuth)' },
        { label: 'manual', description: 'Paste personal access token' }
      ], { placeHolder: 'How to add token?' });
      if (!method) return;
      if (method.label === 'browser') {
        try {
          const session = await vscode.authentication.getSession('github', ['repo', 'read:user', 'user:email'], { forceNewSession: true });
          activeAccs.updateAccount(accountId, { token: session.accessToken });
          webview?.postMessage({ type: 'accountUpdated', accountId });
          vscode.window.showInformationMessage(`Token updated for ${acct.username} via GitHub OAuth.`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`OAuth failed: ${err?.message ?? String(err)}`);
        }
        return;
      }
    }

    const token = await vscode.window.showInputBox({ prompt: 'Enter personal access token (with repo scope)', password: true });
    if (token) {
      activeAccs.updateAccount(accountId, { token });
      webview?.postMessage({ type: 'accountUpdated', accountId });
    }
  }

  static async _handleAddRepo(webview: vscode.Webview, manager: GitProjects, accounts: GitAccounts, postStateCb: () => void) {
    const activeRepo = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const activeAcc = accounts.getEffectiveAccount(activeRepo);
    if (!activeAcc) {
      vscode.window.showErrorMessage('No active Git account. Please add/select an account first.');
      return;
    }
    const accWithToken = await accounts.getAccountWithToken(activeAcc.id);
    if (!accWithToken || !accWithToken.token) {
      vscode.window.showErrorMessage(`Account ${activeAcc.username} has no token. Please authenticate first.`);
      return;
    }

    let repos: { name: string; url: string; private: boolean }[] = [];
    try {
      if (activeAcc.provider === 'github') {
        const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
          headers: { 'Authorization': `Bearer ${accWithToken.token}`, 'User-Agent': 'Ultraview-VSCode' }
        });
        if (!res.ok) throw new Error('GitHub API error');
        const data = await res.json() as any[];
        repos = data.map(r => ({ name: r.full_name, url: r.clone_url, private: r.private }));
      } else if (activeAcc.provider === 'gitlab') {
        const res = await fetch('https://gitlab.com/api/v4/projects?membership=true&simple=true&per_page=100&order_by=updated_at', {
          headers: { 'Authorization': `Bearer ${accWithToken.token}` }
        });
        if (!res.ok) throw new Error('GitLab API error');
        const data = await res.json() as any[];
        repos = data.map(r => ({ name: r.path_with_namespace, url: r.http_url_to_repo, private: r.visibility === 'private' || r.visibility === 'internal' }));
      } else {
        vscode.window.showInformationMessage('Fetching repos is currently only supported for GitHub and GitLab.');
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to fetch repos: ${err.message}`);
      return;
    }

    if (repos.length === 0) {
      const manualUrl = await vscode.window.showInputBox({ prompt: 'No repos found. Enter a clone URL manually' });
      if (!manualUrl) return;
      repos.push({ name: manualUrl.split('/').pop()?.replace('.git', '') || manualUrl, url: manualUrl, private: false });
    }

    const items = repos.map(r => ({ label: `$(repo) ${r.name}`, description: r.private ? 'Private' : 'Public', url: r.url, name: r.name }));
    const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select a repository to clone', matchOnDescription: true });
    if (!selected) return;

    const destUri = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Select clone destination folder' });
    if (!destUri || !destUri[0]) return;
    const destPath = destUri[0].fsPath;

    const repoName = selected.name.split('/').pop()?.replace('.git', '') || 'repo';
    const fullPath = require('path').join(destPath, repoName);

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Cloning ${selected.name}...` }, async () => {
      const execAsync = require('util').promisify(require('child_process').exec);
      try {
        const urlObj = new URL(selected.url);
        urlObj.username = accWithToken.username;
        urlObj.password = accWithToken.token!;
        const cloneUrl = urlObj.toString();

        await execAsync(`git clone "${cloneUrl}" "${repoName}"`, { cwd: destPath });

        const project = manager.addProject({ name: repoName, path: fullPath });

        accounts.setLocalAccount(fullPath, activeAcc.id);
        await applyLocalAccount(fullPath, accWithToken, accWithToken.token!);

        postStateCb();
        webview.postMessage({ type: 'projectAdded', project });
        vscode.window.showInformationMessage(`Successfully cloned and added ${selected.name}`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to clone: ${err.message}`);
      }
    });
  }
}

function nameFromPath(p: string) {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}
