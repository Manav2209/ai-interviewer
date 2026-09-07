import GithubInput from "../components/GithubInput";

export default function Home() {
  return (
    <main className="landing">
      <h1>AI Technical Interview</h1>
      <p className="subtitle">Get interviewed on your actual project.</p>
      <GithubInput />
    </main>
  );
}