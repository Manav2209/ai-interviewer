"use client";

import { use, useEffect, useState } from "react";
import { getResult } from "../../../../lib/api";
import type { InterviewResult } from "../../../../types/interview";
import InterviewResultView from "../../../../components/InterviewResult";

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: interviewId } = use(params);
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function load(): Promise<void> {
      try {
        const r = await getResult(interviewId);
        if (cancelled) return;
        if (r.score === undefined && r.message) {
          if (attempts++ < 10) {
            setTimeout(load, 3000);
          } else {
            setFailed(true);
          }
          return;
        }
        setResult(r);
      } catch {
        if (!cancelled && attempts++ >= 10) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  return (
    <main className="result-page">
      {failed ? (
        <p className="error">Something went wrong with the interview. Please try again.</p>
      ) : result ? (
        <InterviewResultView result={result} />
      ) : (
        <p>Loading result...</p>
      )}
    </main>
  );
}