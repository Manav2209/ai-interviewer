import InterviewRoom from "../../../components/InterviewRoom";

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InterviewRoom interviewId={id} />;
}