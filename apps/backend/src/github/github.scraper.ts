import { z } from "zod";
import type { ScrapedGithubRepo } from "./github.types.js";

const API = "https://api.github.com";
const manifestPattern =
  /(?:^|\/)(?:package\.json|requirements[^/]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|composer\.json|Gemfile|pom\.xml|build\.gradle(?:\.kts)?)$/i;
export function safeRepositoryPath(path: string): boolean {
  return (
    path.length <= 500 &&
    !path.includes("\\") &&
    !path.split("/").some((p) => p === ".." || p === "." || !p) &&
    !/(?:^|\/)(?:\.git|node_modules|vendor|dist|build|\.next|\.env[^/]*|credentials[^/]*|secrets?[^/]*)(?:\/|$)/i.test(
      path,
    ) &&
    !/\.(?:pem|key|p12|pfx|sqlite|db|png|jpe?g|gif|webp|woff2?|mp[34]|zip|pdf|lock)$/i.test(
      path,
    )
  );
}

async function boundedText(res: Response, limit: number): Promise<string> {
  if (Number(res.headers.get("content-length") ?? 0) > limit)
    throw new Error("Repository response exceeds size limit");
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit)
        throw new Error("Repository response exceeds size limit");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export class GithubScraperError extends Error {}
export class GithubScraper {
  private readonly headers: Record<string, string>;
  constructor(headers: Record<string, string> = {}) {
    this.headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "ai-interviewer",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
      ...headers,
    };
  }

  static parseGithubUrl(raw: string): {
    owner: string;
    name: string;
    url: string;
  } {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new GithubScraperError("Provide a valid GitHub repository URL");
    }
    const parts = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      parts.length !== 2 ||
      url.search ||
      url.hash
    )
      throw new GithubScraperError("Use https://github.com/owner/repository");
    const owner = parts[0]!;
    const name = parts[1]!.replace(/\.git$/, "");
    if (
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner) ||
      !/^[A-Za-z0-9_.-]{1,100}$/.test(name) ||
      [".", ".."].includes(name)
    )
      throw new GithubScraperError("Invalid GitHub repository identifier");
    return { owner, name, url: `https://github.com/${owner}/${name}` };
  }

  private async json(path: string): Promise<unknown> {
    const res = await fetch(`${API}${path}`, {
      headers: this.headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok)
      throw new GithubScraperError(`GitHub request failed (${res.status})`);
    return JSON.parse(await boundedText(res, 2_000_000));
  }

  private async file(
    owner: string,
    name: string,
    sha: string,
    path: string,
  ): Promise<string | undefined> {
    if (!safeRepositoryPath(path)) return undefined;
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${name}/${sha}/${encoded}`,
      {
        headers: { "User-Agent": "ai-interviewer" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return undefined;
    return boundedText(res, 24000).catch(() => undefined);
  }

  async scrape(owner: string, name: string): Promise<ScrapedGithubRepo> {
    const info = z
      .object({
        default_branch: z.string(),
        description: z.string().nullable(),
        language: z.string().nullable(),
        size: z.number(),
      })
      .parse(await this.json(`/repos/${owner}/${name}`));
    if (info.size > 100_000)
      throw new GithubScraperError("Repository exceeds the 100 MB limit");
    const commit = z
      .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
      .parse(
        await this.json(
          `/repos/${owner}/${name}/commits/${encodeURIComponent(info.default_branch)}`,
        ),
      );
    const treeData = z
      .object({
        tree: z.array(
          z.object({
            path: z.string(),
            type: z.string(),
            size: z.number().optional(),
          }),
        ),
      })
      .parse(
        await this.json(
          `/repos/${owner}/${name}/git/trees/${commit.sha}?recursive=1`,
        ),
      );
    const tree = treeData.tree
      .filter((f) => f.type === "blob" && safeRepositoryPath(f.path))
      .slice(0, 1500)
      .map((f) => ({ path: f.path, size: f.size ?? 0 }));
    const languages = z
      .record(z.number())
      .parse(await this.json(`/repos/${owner}/${name}/languages`));
    const ranked = tree.filter(
      (f) =>
        f.size <= 24000 &&
        (manifestPattern.test(f.path) ||
          /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|rb|php|json|prisma|ya?ml|toml|md)$/i.test(
            f.path,
          )),
    );
    const rank = (path: string) =>
      manifestPattern.test(path)
        ? 0
        : /(?:^|\/)readme\.md$/i.test(path)
          ? 1
          : /(?:route|server|main|index|schema|consumer|queue|socket|auth|service|controller)/i.test(
                path,
              )
            ? 2
            : 3;
    ranked.sort(
      (a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path),
    );
    const sources: { path: string; content: string }[] = [];
    let remaining = 120_000;
    const selected = ranked.slice(0, 24);
    for (
      let offset = 0;
      offset < selected.length && remaining > 0;
      offset += 4
    ) {
      const files = await Promise.all(
        selected
          .slice(offset, offset + 4)
          .map(async (file) => ({
            path: file.path,
            content: await this.file(owner, name, commit.sha, file.path).catch(
              () => undefined,
            ),
          })),
      );
      for (const file of files)
        if (file.content && remaining > 0) {
          const bounded = file.content.slice(0, Math.min(10000, remaining));
          sources.push({ path: file.path, content: bounded });
          remaining -= bounded.length;
        }
    }
    return {
      repository: {
        owner,
        name,
        url: `https://github.com/${owner}/${name}`,
        description: info.description ?? undefined,
        defaultBranch: info.default_branch,
        primaryLanguage: info.language ?? undefined,
        commitSha: commit.sha,
      },
      languages: Object.keys(languages),
      tree,
      sources,
      manifests: sources.filter((f) => manifestPattern.test(f.path)),
      readme: sources.find((f) => /(?:^|\/)readme\.md$/i.test(f.path))?.content,
      recentCommits: [],
    };
  }
}
