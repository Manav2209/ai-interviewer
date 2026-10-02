"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInterview } from "../lib/api";

const GITHUB_URL_PATTERN =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export default function GithubInput() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = url.trim().replace(/\/$/, "");
    if (!trimmed) {
      setError("Please enter a GitHub repository URL.");
      return;
    }
    if (!GITHUB_URL_PATTERN.test(trimmed)) {
      setError("Please enter a valid GitHub repository URL.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const interview = await createInterview(trimmed);
      router.push(`/interview/${interview.interviewId}/preparing`);
    } catch {
      setError("We couldn't analyze this repository. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form className="github-input" onSubmit={onSubmit}>
      <label className="input-label" htmlFor="repository-url">
        Repository URL
      </label>
      <div className="input-row">
        <input
          id="repository-url"
          type="url"
          aria-describedby={error ? "repository-error" : undefined}
          aria-invalid={Boolean(error)}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/user/project"
          aria-label="GitHub repository URL"
          disabled={submitting}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Starting..." : "Start Interview"}
        </button>
      </div>
      {error && (
        <p id="repository-error" role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
