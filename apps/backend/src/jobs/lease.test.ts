import { expect, test } from "bun:test";
import { withLeaseRenewal } from "./lease.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("long jobs renew without overlap, finish pending renewal, and stop the heartbeat", async () => {
  const handler = deferred();
  const renewalStarted = deferred();
  const renewal = deferred();
  let calls = 0;
  const result = withLeaseRenewal(
    () => handler.promise,
    async () => {
      calls++;
      renewalStarted.resolve();
      await renewal.promise;
    },
    10,
  );
  await renewalStarted.promise;
  await delay(30);
  expect(calls).toBe(1);
  handler.resolve();
  let completed = false;
  void result.then(() => {
    completed = true;
  });
  await delay(20);
  expect(completed).toBe(false);
  renewal.resolve();
  await result;
  await delay(30);
  expect(calls).toBe(1);
});

test("a failed handler stops renewing and preserves its error", async () => {
  const handler = deferred();
  const renewalStarted = deferred();
  let calls = 0;
  const result = withLeaseRenewal(
    () => handler.promise,
    async () => {
      calls++;
      renewalStarted.resolve();
    },
    10,
  );
  await renewalStarted.promise;
  handler.reject(new Error("Model timed out"));
  await expect(result).rejects.toThrow("Model timed out");
  const stoppedCalls = calls;
  await delay(30);
  expect(calls).toBe(stoppedCalls);
});
