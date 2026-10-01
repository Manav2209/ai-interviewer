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
  commitSha?: string;
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
  sources?: { path: string; content: string }[];
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
    commitSha?: string;
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
  services?: string[];
  databases?: string[];
  APIs?: string[];
  infrastructure?: string[];
  interestingTopics?: { topic: string; reason: string; difficulty: string }[];
  evidence: {
    claim: string;
    source: string;
  }[];
}

export interface IndexedFile {
  path: string;
  content: string;
}
export interface IndexedSymbol {
  name: string;
  path: string;
  line: number;
}
