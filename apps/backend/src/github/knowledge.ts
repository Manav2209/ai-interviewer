import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { safeRepositoryPath } from "./github.scraper.js";
import type {
  IndexedFile,
  IndexedSymbol,
  ScrapedGithubRepo,
} from "./github.types.js";
import type { RepositoryReference } from "../interview/interview.types.js";

export const fileSchema = z.object({
  path: z.string(),
  content: z.string().max(24000),
});
const symbolSchema = z.object({
  name: z.string(),
  path: z.string(),
  line: z.number().int().positive(),
});
export function indexSymbols(files: IndexedFile[]): IndexedSymbol[] {
  const symbols: IndexedSymbol[] = [];
  for (const file of files)
    file.content.split("\n").forEach((line, i) => {
      const match = line.match(
        /\b(?:function|class|interface|def|func|fn|const|let|type)\s+([A-Za-z_$][\w$]*)/,
      );
      if (match)
        symbols.push({ name: match[1]!, path: file.path, line: i + 1 });
    });
  return symbols.slice(0, 1000);
}

export async function storeKnowledge(
  interviewId: string,
  scraped: ScrapedGithubRepo,
  facts: unknown,
): Promise<void> {
  const files = (scraped.sources ?? []).filter((f) =>
    safeRepositoryPath(f.path),
  );
  const data = {
    commitSha: scraped.repository.commitSha ?? "unknown",
    files,
    symbols: indexSymbols(files) as unknown as Prisma.InputJsonValue,
    facts: JSON.parse(JSON.stringify(facts)) as Prisma.InputJsonValue,
  };
  await prisma.repositoryKnowledge.upsert({
    where: { interviewId },
    create: { interviewId, ...data },
    update: data,
  });
}

export interface CodeExcerpt {
  content: string;
  reference: RepositoryReference;
}
export class RepositoryKnowledge {
  constructor(
    readonly commitSha: string,
    readonly files: IndexedFile[],
    readonly symbols: IndexedSymbol[],
    readonly facts: Record<string, unknown>,
  ) {}
  static async load(interviewId: string): Promise<RepositoryKnowledge> {
    const row = await prisma.repositoryKnowledge.findUnique({
      where: { interviewId },
    });
    if (!row) return new RepositoryKnowledge("unknown", [], [], {});
    return new RepositoryKnowledge(
      row.commitSha,
      z.array(fileSchema).parse(row.files),
      z.array(symbolSchema).parse(row.symbols),
      z.record(z.unknown()).parse(row.facts),
    );
  }
  getFile(path: string, startLine = 1, maxLines = 60): CodeExcerpt | null {
    if (!safeRepositoryPath(path)) throw new Error("Unsafe repository path");
    const file = this.files.find((f) => f.path === path);
    if (!file) return null;
    const lines = file.content.split("\n");
    const start = Math.max(1, Math.min(lines.length, Math.trunc(startLine)));
    const end = Math.min(
      lines.length,
      start + Math.min(80, Math.max(1, maxLines)) - 1,
    );
    return {
      content: lines
        .slice(start - 1, end)
        .map((l, i) => `${start + i}: ${l}`)
        .join("\n")
        .slice(0, 6000),
      reference: {
        path,
        commitSha: this.commitSha,
        startLine: start,
        endLine: end,
      },
    };
  }
  getSymbol(name: string): CodeExcerpt[] {
    return this.symbols
      .filter((s) => s.name.toLowerCase() === name.toLowerCase())
      .slice(0, 3)
      .map((s) => this.getFile(s.path, Math.max(1, s.line - 2), 40)!)
      .filter(Boolean);
  }
  search(query: string): CodeExcerpt[] {
    const terms = query
      .toLowerCase()
      .split(/[^a-z0-9_$]+/)
      .filter((t) => t.length > 2)
      .slice(0, 6);
    if (!terms.length) return [];
    const hits: { path: string; line: number; score: number }[] = [];
    for (const f of this.files)
      f.content.split("\n").forEach((line, index) => {
        const score = terms.filter((term) =>
          line.toLowerCase().includes(term),
        ).length;
        if (score) hits.push({ path: f.path, line: index + 1, score });
      });
    hits.sort((a, b) => b.score - a.score);
    const selected: CodeExcerpt[] = [];
    for (const hit of hits) {
      if (
        selected.some(
          (e) =>
            e.reference.path === hit.path &&
            Math.abs(e.reference.startLine - hit.line) < 30,
        )
      )
        continue;
      const excerpt = this.getFile(hit.path, Math.max(1, hit.line - 5), 30);
      if (excerpt) selected.push(excerpt);
      if (selected.length === 3) break;
    }
    return selected;
  }
  getDependency(
    name: string,
  ): { name: string; version: string; path: string }[] {
    const found: { name: string; version: string; path: string }[] = [];
    for (const file of this.files.filter((f) =>
      f.path.endsWith("package.json"),
    )) {
      try {
        const json = JSON.parse(file.content) as Record<
          string,
          Record<string, unknown>
        >;
        const version =
          json.dependencies?.[name] ?? json.devDependencies?.[name];
        if (typeof version === "string")
          found.push({ name, version, path: file.path });
      } catch {
        /* truncated manifests are unavailable */
      }
    }
    return found.slice(0, 5);
  }
  validReference(ref: RepositoryReference): boolean {
    const file = this.files.find((f) => f.path === ref.path);
    return (
      !!file &&
      ref.commitSha === this.commitSha &&
      ref.startLine >= 1 &&
      ref.endLine >= ref.startLine &&
      ref.endLine <= file.content.split("\n").length
    );
  }
}
