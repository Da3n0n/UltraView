export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  localGitConfig?: LocalGitConfig | null;
}

export interface LocalGitConfig {
  profileId?: string;
  preventAutoCommit?: boolean;
}
