import { expect, test } from "bun:test";
import { RepositoryKnowledge, indexSymbols } from "./knowledge.js";
import { GithubScraper, safeRepositoryPath } from "./github.scraper.js";

test("repository tools return bounded excerpts pinned to the fetched commit", () => {
  const sha = "a".repeat(40);
  const files = [
    {
      path: "src/server.ts",
      content: "export function route() {\n  return cache.get('key');\n}\n",
    },
    { path: "package.json", content: '{"dependencies":{"redis":"^5.0.0"}}' },
  ];
  const knowledge = new RepositoryKnowledge(
    sha,
    files,
    indexSymbols(files),
    {},
  );
  const excerpt = knowledge.getFile("src/server.ts", 2, 1)!;
  expect(excerpt.content).toBe("2:   return cache.get('key');");
  expect(excerpt.reference).toEqual({
    path: "src/server.ts",
    commitSha: sha,
    startLine: 2,
    endLine: 2,
  });
  expect(knowledge.getSymbol("route")[0]!.reference.path).toBe("src/server.ts");
  expect(knowledge.search("cache").length).toBe(1);
  expect(knowledge.getDependency("redis")[0]!.version).toBe("^5.0.0");
  expect(knowledge.validReference({ ...excerpt.reference, endLine: 500 })).toBe(
    false,
  );
  expect(
    knowledge.validReference({
      ...excerpt.reference,
      commitSha: "b".repeat(40),
    }),
  ).toBe(false);
  expect(() => knowledge.getFile("../.env")).toThrow("Unsafe");
  expect(knowledge.getFile("src/missing.ts")).toBeNull();
});

test("repository paths and URLs reject traversal, secrets, credentials and other hosts", () => {
  for (const path of [
    "../foo",
    "src/../.env",
    "src\\server.ts",
    ".env.local",
    "keys/signing.pem",
    "node_modules/foo.js",
    "/etc/passwd",
  ])
    expect(safeRepositoryPath(path)).toBe(false);
  for (const url of [
    "http://github.com/a/b",
    "https://example.com/a/b",
    "https://user:pass@github.com/a/b",
    "https://github.com/a/b/tree/main",
    "https://github.com/a/b?x=1",
  ])
    expect(() => GithubScraper.parseGithubUrl(url)).toThrow();
  expect(
    GithubScraper.parseGithubUrl("https://github.com/example/project.git").url,
  ).toBe("https://github.com/example/project");
});
