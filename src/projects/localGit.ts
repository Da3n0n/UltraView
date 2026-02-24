import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { LocalGitConfig } from './types';

/**
 * Lightweight helpers for managing per-project (local) git settings.
 * These helpers do not execute git commands; they store local preferences
 * (e.g. which profile to use, preventAutoCommit) and provide hooks for later
 * integration with the git CLI or vscode.git extension.
 */

export class LocalGitManager {
  constructor(private pm: ProjectManager, private context: vscode.ExtensionContext) {}

  getConfig(projectId: string): LocalGitConfig | null {
    const proj = this.pm.listProjects().find(p => p.id === projectId);
    return proj ? (proj.localGitConfig || null) : null;
  }

  async setConfig(projectId: string, cfg: LocalGitConfig) {
    this.pm.setLocalGitConfig(projectId, cfg);
    // small UX nudges
    await this.context.globalState.update('ultraview.projects.lastLocalGitUpdate', { projectId, when: Date.now() });
  }

  // Placeholder: when integrated, this would configure the git repo at `path`.
  async applyToRepoPath(path: string, cfg: LocalGitConfig) {
    // Intentionally no side-effects for now. Caller may implement CLI calls.
    return Promise.resolve(true);
  }
}
