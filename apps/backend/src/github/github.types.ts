export interface GithubRepositoryInfo {
  owner: string;
  name: string;
  url: string;
  description?: string;
  defaultBranch: string;
  primaryLanguage?: string;
  stars?: number;
  forks?: number;
  cloneUrl?: string;
}

export interface GithubFile {
  path: string;
  size: number;
}

export interface GithubDependencyManifest {
  path: string;
  content: string;
}

export interface ScrapedGithubRepo {
  repository: GithubRepositoryInfo;
  languages: string[];
  tree: GithubFile[];
  manifests: GithubDependencyManifest[];
  readme?: string;
  recentCommits: {
    message: string;
    author: string;
    date: string;
  }[];
}

export interface GithubContext {
  repository: {
    owner: string;
    name: string;
    url: string;
    description?: string;
  };
  languages: string[];
  technologies: string[];
  dependencies: string[];
  architecture: {
    summary: string;
    components: string[];
  };
  importantFiles: {
    path: string;
    reason: string;
    content?: string;
  }[];
  projectSummary: string;
  evidence: {
    claim: string;
    source: string;
  }[];
}