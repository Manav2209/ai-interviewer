import { prisma } from "../db/client.js";
import { newId } from "../lib/ids.js";

export class InterviewBusyError extends Error {}

export async function withInterviewLock<T>(
  interviewId: string,
  operation: (token: string) => Promise<T>,
): Promise<T> {
  const token = newId("lock");
  const now = new Date();
  const claimed = await prisma.interviewRuntime.updateMany({
    where: {
      interviewId,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 180_000) },
  });
  if (!claimed.count) {
    if (
      !(await prisma.interviewRuntime.findUnique({
        where: { interviewId },
        select: { interviewId: true },
      }))
    )
      throw new Error("Interview runtime is missing");
    throw new InterviewBusyError(
      "Interview is processing another turn; retry shortly",
    );
  }
  try {
    return await operation(token);
  } finally {
    await prisma.interviewRuntime.updateMany({
      where: { interviewId, leaseToken: token },
      data: { leaseToken: null, leaseUntil: null },
    });
  }
}
