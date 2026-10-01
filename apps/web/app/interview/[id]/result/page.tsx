"use client";
import { use, useEffect, useState } from "react";
import { getResult, retryEvaluation } from "../../../../lib/api";
import type { InterviewResult } from "../../../../types/interview";
import InterviewResultView from "../../../../components/InterviewResult";

export default function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const load = async () => {
      try {
        const data = await getResult(id);
        if (cancelled) return;
        failures = 0;
        if (data.status === "evaluation_failed" || data.status === "failed") {
          setError("Evaluation could not be completed. You can retry it.");
          return;
        }
        if (data.status === "completed" && data.score !== undefined) {
          setResult(data);
          return;
        }
      } catch {
        if (cancelled) return;
        if (++failures >= 5) {
          setError("Unable to load the result. Please try again.");
          return;
        }
      }
      if (!cancelled) timer = setTimeout(load, 3000);
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, revision]);
  const retry = async () => {
    try {
      await retryEvaluation(id);
      setError(null);
      setRevision((n) => n + 1);
    } catch {
      setError("Unable to retry. Please try again.");
    }
  };
  return (
    <main className="result-page">
      {error ? (
        <div>
          <p className="error">{error}</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : result ? (
        <InterviewResultView result={result} />
      ) : (
        <p>Preparing your evaluation...</p>
      )}
    </main>
  );
}
