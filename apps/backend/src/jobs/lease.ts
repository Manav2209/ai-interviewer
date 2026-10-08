// Keep slow handlers covered by their lease without overlapping renewals.
export async function withLeaseRenewal<T>(
  operation: () => Promise<T>,
  renew: () => Promise<unknown>,
  intervalMs = 30000,
): Promise<T> {
  let renewing: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (renewing) return;
    renewing = renew()
      .then(() => {})
      .catch((error: unknown) => {
        console.error(
          "Job lease renewal failed:",
          error instanceof Error ? error.name : "UnknownError",
        );
      })
      .finally(() => {
        renewing = undefined;
      });
  }, intervalMs);
  try {
    return await operation();
  } finally {
    clearInterval(timer);
    await renewing;
  }
}
