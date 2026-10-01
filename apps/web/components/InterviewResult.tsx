import type { InterviewResult as InterviewResultData } from "../types/interview";

const DIMENSION_LABELS: Record<string, string> = {
  technicalKnowledge: "Technical Knowledge",
  problemSolving: "Problem Solving",
  communication: "Communication",
  depth: "Depth",
  projectUnderstanding: "Project Understanding",
};

export default function InterviewResult({
  result,
}: {
  result: InterviewResultData;
}) {
  return (
    <div className="result">
      <h2>Interview Complete</h2>

      <div className="score">
        {result.score ?? "Insufficient evidence"}{" "}
        {result.score !== null && <span>/ 100</span>}
      </div>

      <div className="dimensions">
        {Object.entries(result.dimensions ?? {}).map(([key, value]) => (
          <div key={key} className="dimension">
            <div className="dimension-label">
              <span>{DIMENSION_LABELS[key] ?? key}</span>
              <span>{value ?? "Insufficient evidence"}</span>
            </div>
            <div className="dimension-bar">
              <div
                className="dimension-fill"
                style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="feedback">{result.feedback}</p>
      {result.evidence && (
        <details>
          <summary>Assessment evidence</summary>
          {Object.entries(result.evidence).map(([name, item]) => (
            <section key={name}>
              <h3>{name.replace(/([A-Z])/g, " $1")}</h3>
              <p>
                {item.level.replaceAll("_", " ")} ·{" "}
                {Math.round(item.confidence * 100)}% confidence
              </p>
              <p>{item.explanation}</p>
            </section>
          ))}
        </details>
      )}

      <div className="lists">
        <div>
          <h3>Strengths</h3>
          <ul>
            {result.strengths.map((s) => (
              <li key={s}>✓ {s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Areas to Improve</h3>
          <ul>
            {result.weaknesses.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
