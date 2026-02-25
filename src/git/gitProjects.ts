import * as vscode from 'vscode';
import { GitProject, GitProfile } from './types';
// Lightweight UUID helper to avoid extra dependency
function simpleUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const KEY_PROJECTS = 'ultraview.git.projects.v1';
const KEY_PROFILES = 'ultraview.git.profiles.v1';

export class GitProjects {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  listProjects(): GitProject[] {
    return this.context.globalState.get<GitProject[]>(KEY_PROJECTS, []);
  }

  saveProjects(list: GitProject[]) {
    this.context.globalState.update(KEY_PROJECTS, list);
  }

  addProject(p: Partial<GitProject>): GitProject {
    const projects = this.listProjects();

    // Prevent duplicate entries for the same path
    if (p.path) {
      const existingIdx = projects.findIndex(existing => existing.path === p.path);
      if (existingIdx >= 0) {
        projects[existingIdx] = { ...projects[existingIdx], ...p };
        this.saveProjects(projects);
        return projects[existingIdx];
      }
    }

    const proj: GitProject = {
      id: p.id || simpleUuid(),
      name: p.name || 'New Project',
      path: p.path || '',
      repoUrl: p.repoUrl,
      gitProfile: p.gitProfile
    };
    projects.push(proj);
    this.saveProjects(projects);
    return proj;
  }

  updateProject(id: string, patch: Partial<GitProject>) {
    const projects = this.listProjects();
    const idx = projects.findIndex(p => p.id === id);
    if (idx >= 0) {
      projects[idx] = { ...projects[idx], ...patch };
      this.saveProjects(projects);
    }
  }

  removeProject(id: string) {
    const projects = this.listProjects().filter(p => p.id !== id);
    this.saveProjects(projects);
  }

  // Profiles
  listProfiles(): GitProfile[] {
    return this.context.globalState.get<GitProfile[]>(KEY_PROFILES, []);
  }

  saveProfiles(list: GitProfile[]) {
    this.context.globalState.update(KEY_PROFILES, list);
  }

  addProfile(p: Partial<GitProfile>): GitProfile {
    const profiles = this.listProfiles();
    const prof: GitProfile = {
      id: p.id || simpleUuid(),
      name: p.name || 'profile',
      userName: p.userName,
      userEmail: p.userEmail
    };
    profiles.push(prof);
    this.saveProfiles(profiles);
    return prof;
  }

  setProjectProfile(projectId: string, profileId?: string) {
    this.updateProject(projectId, { gitProfile: profileId });
  }
}
