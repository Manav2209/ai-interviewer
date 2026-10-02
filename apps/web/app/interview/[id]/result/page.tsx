"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getResult, getTranscript, retryEvaluation } from "../../../../lib/api";
import type {
  InterviewResult,
  TranscriptMessage,
} from "../../../../types/interview";
import InterviewResultView from "../../../../components/InterviewResult";
import Transcript from "../../../../components/Transcript";

export default function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [summary, setSummary] = useState<InterviewResult["summary"]>();
  const [error, setError] = useState<string | null>(null);
  const [evaluationFailed, setEvaluationFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(
    null,
  );
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const load = async () => {
      try {
        const data = await getResult(id);
        if (cancelled) return;
        failures = 0;
        setSummary(data.summary);
        if (data.status === "evaluation_failed" || data.status === "failed") {
          setEvaluationFailed(true);
          setError(
            "The assessment could not be completed. Your recorded answers are saved.",
          );
          return;
        }
        if (data.status === "completed" && data.score !== undefined) {
          setResult(data);
          return;
        }
      } catch {
        if (cancelled) return;
        if (++failures >= 5) {
          setError(
            "We couldn’t load your result. Check your connection and try again.",
          );
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
  const regenerate = async () => {
    setBusy(true);
    try {
      await retryEvaluation(id);
      setResult(null);
      setError(null);
      setEvaluationFailed(false);
      setRevision((n) => n + 1);
    } catch {
      setError("We couldn’t restart the assessment. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const showTranscript = async () => {
    setTranscriptBusy(true);
    setTranscriptError(null);
    try {
      setTranscript(await getTranscript(id));
    } catch {
      setTranscriptError("Couldn’t load your transcript. Please try again.");
    } finally {
      setTranscriptBusy(false);
    }
  };
  return (
    <main className="result-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {result ? "Interview complete" : "After the conversation"}
          </p>
          <h1>
            {result
              ? "Your interview, reviewed."
              : "Preparing your assessment."}
          </h1>
          <p className="subtitle">
            {summary?.repository ??
              "Feedback grounded in your recorded answers."}
          </p>
        </div>
        <Link href="/" className="button secondary">
          New interview <span aria-hidden="true">↗</span>
        </Link>
      </div>
      {summary && (
        <div className="session-summary">
          <span>
            <strong>{summary.answeredQuestions}</strong> questions answered
          </span>
          <span>
            <strong>{summary.candidateTurns}</strong> recorded answer segments
          </span>
          {summary.durationSeconds !== null && (
            <span>
              <strong>
                {Math.floor(summary.durationSeconds / 60)}m{" "}
                {summary.durationSeconds % 60}s
              </strong>{" "}
              session
            </span>
          )}
        </div>
      )}
      {error && (
        <section className="panel error-panel" role="alert">
          <h2>Let’s try that again</h2>
          <p>{error}</p>
          <button
            type="button"
            disabled={busy}
            onClick={
              evaluationFailed || result
                ? regenerate
                : () => {
                    setError(null);
                    setRevision((n) => n + 1);
                  }
            }
          >
            {busy
              ? "Restarting…"
              : evaluationFailed || result
                ? "Retry assessment"
                : "Retry loading"}
          </button>
        </section>
      )}
      {result ? (
        <>
          <InterviewResultView result={result} />
          <div className="result-actions">
            <p className="hint">Want a fresh assessment of the same answers?</p>
            <button
              className="secondary"
              type="button"
              onClick={regenerate}
              disabled={busy}
            >
              {busy ? "Restarting…" : "Regenerate assessment"}
            </button>
          </div>
        </>
      ) : (
        !error && (
          <section
            className="panel evaluation-pending"
            role="status"
            aria-live="polite"
          >
            <span className="loader" aria-hidden="true" />
            <h2>Reviewing what you shared</h2>
            <p>
              We’re checking your answers and preparing evidence-backed
              feedback. You can leave this page and return to this link.
            </p>
            {summary && (
              <p className="hint">
                {summary.analyzedTurns} of {summary.candidateTurns} answer
                segments analyzed
              </p>
            )}
          </section>
        )
      )}
      {(result || error) && (
        <section className="panel transcript-review">
          <div className="section-heading">
            <div>
              <h2>Conversation transcript</h2>
              <p className="hint">
                Review the answers that informed your assessment.
              </p>
            </div>
            {!transcript && (
              <button
                type="button"
                className="secondary"
                disabled={transcriptBusy}
                onClick={showTranscript}
              >
                {transcriptBusy ? "Loading…" : "View transcript"}
              </button>
            )}
          </div>
          {transcriptError && (
            <p className="error" role="alert">
              {transcriptError}
            </p>
          )}
          {transcript && <Transcript messages={transcript} />}
        </section>
      )}
    </main>
  );
}
