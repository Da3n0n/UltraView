import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { GitAccount, GitProvider, SshKey } from './types';

function simpleUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const KEY_ACCOUNTS = 'ultraview.git.accounts.v1';
const KEY_SSH_KEYS = 'ultraview.git.sshKeys.v1';
const KEY_GLOBAL_ACCOUNT = 'ultraview.git.globalAccount';
const KEY_LOCAL_ACCOUNTS = 'ultraview.git.localAccounts';

export class GitAccounts {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  listAccounts(): GitAccount[] {
    return this.context.globalState.get<GitAccount[]>(KEY_ACCOUNTS, []);
  }

  saveAccounts(list: GitAccount[]) {
    this.context.globalState.update(KEY_ACCOUNTS, list);
  }

  addAccount(account: Partial<GitAccount>): GitAccount {
    const accounts = this.listAccounts();
    
    const existingIdx = accounts.findIndex(a => 
      a.provider === (account.provider || 'github') && 
      a.username.toLowerCase() === (account.username || '').toLowerCase()
    );
    if (existingIdx >= 0) {
      accounts[existingIdx] = { ...accounts[existingIdx], ...account };
      this.saveAccounts(accounts);
      return accounts[existingIdx];
    }
    
    const acc: GitAccount = {
      id: account.id || simpleUuid(),
      provider: account.provider || 'github',
      username: account.username || '',
      email: account.email,
      token: account.token,
      sshKeyId: account.sshKeyId,
      tokenExpiresAt: account.tokenExpiresAt,
      isGlobal: account.isGlobal ?? false,
      createdAt: account.createdAt || Date.now()
    };
    accounts.push(acc);
    this.saveAccounts(accounts);
    return acc;
  }

  updateAccount(id: string, patch: Partial<GitAccount>) {
    const accounts = this.listAccounts();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx >= 0) {
      accounts[idx] = { ...accounts[idx], ...patch };
      this.saveAccounts(accounts);
    }
  }

  removeAccount(id: string) {
    const accounts = this.listAccounts().filter(a => a.id !== id);
    this.saveAccounts(accounts);
    const local = this.getLocalAccounts();
    const filtered = local.filter(l => l.accountId !== id);
    this.context.globalState.update(KEY_LOCAL_ACCOUNTS, filtered);
  }

  getAccount(id: string): GitAccount | undefined {
    return this.listAccounts().find(a => a.id === id);
  }

  getGlobalAccount(): GitAccount | undefined {
    const id = this.context.globalState.get<string | undefined>(KEY_GLOBAL_ACCOUNT);
    if (!id) return undefined;
    return this.getAccount(id);
  }

  setGlobalAccount(accountId: string | undefined) {
    if (accountId) {
      this.context.globalState.update(KEY_GLOBAL_ACCOUNT, accountId);
    } else {
      this.context.globalState.update(KEY_GLOBAL_ACCOUNT, undefined);
    }
  }

  setLocalAccount(workspaceUri: string, accountId: string | undefined) {
    const local = this.getLocalAccounts();
    const existing = local.findIndex(l => l.workspaceUri === workspaceUri);
    if (accountId) {
      if (existing >= 0) {
        local[existing].accountId = accountId;
      } else {
        local.push({ workspaceUri, accountId });
      }
    } else if (existing >= 0) {
      local.splice(existing, 1);
    }
    this.context.globalState.update(KEY_LOCAL_ACCOUNTS, local);
  }

  getLocalAccount(workspaceUri: string): GitAccount | undefined {
    const local = this.getLocalAccounts();
    const entry = local.find(l => l.workspaceUri === workspaceUri);
    if (!entry) return undefined;
    return this.getAccount(entry.accountId);
  }

  private getLocalAccounts(): { workspaceUri: string; accountId: string }[] {
    return this.context.globalState.get<{ workspaceUri: string; accountId: string }[]>(KEY_LOCAL_ACCOUNTS, []);
  }

  getEffectiveAccount(workspaceUri?: string): GitAccount | undefined {
    const local = workspaceUri ? this.getLocalAccount(workspaceUri) : undefined;
    return local || this.getGlobalAccount();
  }

  listSshKeys(): SshKey[] {
    return this.context.globalState.get<SshKey[]>(KEY_SSH_KEYS, []);
  }

  saveSshKeys(list: SshKey[]) {
    this.context.globalState.update(KEY_SSH_KEYS, list);
  }

  addSshKey(key: Partial<SshKey>): SshKey {
    const keys = this.listSshKeys();
    const sshKey: SshKey = {
      id: key.id || simpleUuid(),
      name: key.name || 'SSH Key',
      publicKey: key.publicKey || '',
      privateKeyPath: key.privateKeyPath,
      provider: key.provider || 'github',
      accountId: key.accountId || '',
      createdAt: key.createdAt || Date.now()
    };
    keys.push(sshKey);
    this.saveSshKeys(keys);
    return sshKey;
  }

  removeSshKey(id: string) {
    const keys = this.listSshKeys().filter(k => k.id !== id);
    this.saveSshKeys(keys);
  }

  getSshKey(id: string): SshKey | undefined {
    return this.listSshKeys().find(k => k.id === id);
  }

  async generateSshKey(accountId: string, provider: GitProvider, keyName?: string): Promise<SshKey> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const key = this.addSshKey({
      name: keyName || `ultraview-${provider}-${Date.now()}`,
      publicKey: publicKey.replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').trim(),
      provider,
      accountId,
      privateKeyPath: `ultraview-ssh-${Date.now()}.pem`
    });

    await this.context.secrets.store(`ultraview.git.sshkey.${key.id}`, privateKey);

    return key;
  }

  async getPrivateKey(keyId: string): Promise<string | undefined> {
    return this.context.secrets.get(`ultraview.git.sshkey.${keyId}`);
  }

  async deletePrivateKey(keyId: string): Promise<void> {
    await this.context.secrets.delete(`ultraview.git.sshkey.${keyId}`);
  }

  getProviderUrl(provider: GitProvider): { sshKeyUrl: string; tokenUrl: string } {
    switch (provider) {
      case 'github':
        return {
          sshKeyUrl: 'https://github.com/settings/ssh/new',
          tokenUrl: 'https://github.com/settings/tokens/new'
        };
      case 'gitlab':
        return {
          sshKeyUrl: 'https://gitlab.com/-/profile/keys',
          tokenUrl: 'https://gitlab.com/-/profile/personal_access_tokens'
        };
      case 'azure':
        return {
          sshKeyUrl: 'https://dev.azure.com/{user}/_settings/ssh',
          tokenUrl: 'https://dev.azure.com/_usersSettings/tokens'
        };
      default:
        return { sshKeyUrl: '', tokenUrl: '' };
    }
  }
}
