import type { ScrapedGithubRepo, GithubFile, GithubDependencyManifest } from "./github.types.js";

const GITHUB_API = "https://api.github.com";

const MANIFEST_PATTERNS: { regex: RegExp; path: string }[] = [
  { regex: /^package\.json$/i, path: "package.json" },
  { regex: /^requirements.*\.txt$/i, path: "requirements.txt" },
  { regex: /^pyproject\.toml$/i, path: "pyproject.toml" },
  { regex: /^go\.mod$/i, path: "go.mod" },
  { regex: /^Cargo\.toml$/i, path: "Cargo.toml" },
  { regex: /^Dockerfile(\.\w+)?$/i, path: "Dockerfile" },
  { regex: /^docker-compose.*\.ya?ml$/i, path: "docker-compose.yml" },
  { regex: /^composer\.json$/i, path: "composer.json" },
  { regex: /^Gemfile$/i, path: "Gemfile" },
  { regex: /^pom\.xml$/i, path: "pom.xml" },
  { regex: /^build\.gradle(?:\.kts)?$/i, path: "build.gradle" },
];

const MAX_TREE_FILES = 400;
const MAX_COMMITS = 20;

export class GithubScraperError extends Error {}

export class GithubScraper {
  private readonly headers: Record<string, string>;

  constructor(headers: Record<string, string> = {}) {
    this.headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "github-ai-interviewer-backend",
      ...headers,
    };
  }

  static parseGithubUrl(rawUrl: string): { owner: string; name: string; url: string } {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new GithubScraperError("Invalid URL. Provide a full GitHub repository URL.");
    }
    if (url.hostname !== "github.com") {
      throw new GithubScraperError("URL must point to github.com.");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      throw new GithubScraperError("GitHub URL must include owner and repository, e.g. https://github.com/user/project");
    }
    const owner = parts[0]!;
    const name = parts[1]!.replace(/\.git$/, "");
    return { owner, name, url: `https://github.com/${owner}/${name}` };
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${GITHUB_API}${path}`, { headers: this.headers });
    if (res.status === 404) {
      throw new GithubScraperError(`GitHub resource not found: ${path}`);
    }
    if (res.status === 403) {
      throw new GithubScraperError("GitHub API rate limit exceeded (60 requests/hour unauthenticated).");
    }
    if (!res.ok) {
      throw new GithubScraperError(`GitHub API error ${res.status} for ${path}`);
    }
    return (await res.json()) as T;
  }

  private async getText(path: string): Promise<string | undefined> {
    const res = await fetch(`${GITHUB_API}${path}`, { headers: this.headers });
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new GithubScraperError(`GitHub API error ${res.status} for ${path}`);
    }
    return await res.text();
  }

  async scrape(owner: string, name: string): Promise<ScrapedGithubRepo> {
    const repo = await this.getJson<any>(`/repos/${owner}/${name}`);
    const languages = await this.getJson<Record<string, number>>(`/repos/${owner}/${name}/languages`);

    const defaultBranch = repo.default_branch ?? "main";
    const tree = await this.getTree(owner, name, defaultBranch);

    const manifests = await this.collectManifests(owner, name, defaultBranch, tree);
    const readme = await this.getText(`/repos/${owner}/${name}/readme`).then((text) =>
      text?.replace(/^\{[\s\S]*?\}\s*/, "")?.trim(),
    );
    const recentCommits = await this.getRecentCommits(owner, name);

    return {
      repository: {
        owner,
        name,
        url: repo.html_url ?? `https://github.com/${owner}/${name}`,
        description: repo.description ?? undefined,
        defaultBranch,
        primaryLanguage: repo.language ?? undefined,
        stars: repo.stargazers_count ?? undefined,
        forks: repo.forks_count ?? undefined,
        cloneUrl: repo.clone_url ?? undefined,
      },
      languages: Object.keys(languages),
      tree,
      manifests,
      readme,
      recentCommits,
    };
  }

  private async getTree(owner: string, name: string, branch: string): Promise<GithubFile[]> {
    try {
      const data = await this.getJson<any>(
        `/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
      );
      const entries: { path?: string; type?: string; size?: number }[] = data.tree ?? [];
      const files = entries
        .filter((e) => e.type === "blob" && typeof e.path === "string")
        .map((e) => ({ path: e.path!, size: e.size ?? 0 }))
        .filter((f) => !f.path.startsWith(".git/"));
      return files.slice(0, MAX_TREE_FILES);
    } catch {
      return [];
    }
  }

  private async collectManifests(
    owner: string,
    name: string,
    branch: string,
    tree: GithubFile[],
  ): Promise<GithubDependencyManifest[]> {
    const matched = new Set<string>();
    for (const file of tree) {
      for (const pattern of MANIFEST_PATTERNS) {
        if (pattern.regex.test(file.path) && !matched.has(pattern.path)) {
          matched.add(pattern.path);
        }
      }
      if (matched.size >= MANIFEST_PATTERNS.length) break;
    }

    const manifests: GithubDependencyManifest[] = [];
    for (const path of matched) {
      const content = await this.getFileContent(owner, name, branch, path);
      if (content) manifests.push({ path, content });
    }
    return manifests;
  }

  private async getFileContent(
    owner: string,
    name: string,
    branch: string,
    path: string,
  ): Promise<string | undefined> {
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${path}`,
      { headers: { "User-Agent": "github-ai-interviewer-backend" } },
    );
    if (res.status === 404) return undefined;
    if (!res.ok) return undefined;
    return await res.text();
  }

  private async getRecentCommits(
    owner: string,
    name: string,
  ): Promise<ScrapedGithubRepo["recentCommits"]> {
    try {
      const data = await this.getJson<any[]>(
        `/repos/${owner}/${name}/commits?per_page=${MAX_COMMITS}`,
      );
      return (data ?? []).map((c) => ({
        message: c.commit?.message ?? "",
        author: c.commit?.author?.name ?? "",
        date: c.commit?.author?.date ?? "",
      }));
    } catch {
      return [];
    }
  }
}