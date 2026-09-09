"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getInterview } from "../../../../lib/api";
import type { InterviewView } from "../../../../types/interview";

export default function PreparingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: interviewId } = use(params);
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function poll(): Promise<void> {
      try {
        const view: InterviewView = await getInterview(interviewId);
        if (cancelled) return;
        if (view.status === "ready") {
          router.replace(`/interview/${interviewId}`);
          return;
        }
        if (view.status === "failed") {
          setFailed(true);
          return;
        }
        if (view.status === "completed") {
          router.replace(`/interview/${interviewId}/result`);
          return;
        }
      } catch {
        if (!cancelled && attempts++ > 3) {
          setFailed(true);
          return;
        }
      }
      setTimeout(poll, 3000);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [interviewId, router]);

  return (
    <main className="preparing">
      <h1>Preparing your interview...</h1>
      {failed ? (
        <p className="error">We couldn't analyze this repository. Please try again.</p>
      ) : (
        <ul className="steps">
          <li className="done">✓ Repository received</li>
          <li className="done">✓ Analyzing project</li>
          <li>• Creating interview</li>
          <li>• Starting voice session</li>
        </ul>
      )}
    </main>
  );
}