import * as vscode from 'vscode';
import { Project, LocalGitConfig } from './types';

const KEY_PROJECTS = 'ultraview.projects.v1';

function simpleUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nameFromPath(p: string) {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

export class ProjectManager {
  constructor(private context: vscode.ExtensionContext) {}

  listProjects(): Project[] {
    return this.context.globalState.get<Project[]>(KEY_PROJECTS, []);
  }

  saveProjects(list: Project[]) {
    return this.context.globalState.update(KEY_PROJECTS, list);
  }

  addProject(p: Partial<Project>): Project {
    const list = this.listProjects();
    const proj: Project = {
      id: p.id || simpleUuid(),
      name: p.name || (p.path ? nameFromPath(p.path) : 'New Project'),
      path: p.path || '',
      description: p.description || '',
      localGitConfig: p.localGitConfig || null,
    };
    list.push(proj);
    this.saveProjects(list);
    return proj;
  }

// djakdawkj

  updateProject(id: string, patch: Partial<Project>) {
    const list = this.listProjects();
    const idx = list.findIndex(p => p.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
      this.saveProjects(list);
    }
  }

  removeProject(id: string) {
    const list = this.listProjects().filter(p => p.id !== id);
    this.saveProjects(list);
  }

  setLocalGitConfig(projectId: string, cfg: LocalGitConfig | null) {
    const list = this.listProjects();
    const idx = list.findIndex(p => p.id === projectId);
    if (idx >= 0) {
      list[idx].localGitConfig = cfg;
      this.saveProjects(list);
    }
  }
}
