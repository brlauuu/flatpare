import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression guard for #201.
//
// `vi.clearAllMocks()` clears recorded calls but does NOT drain values queued
// with `mockReturnValueOnce`. So a test that queues more than it consumes —
// which happens whenever a mocked chain throws part-way through — leaves the
// surplus sitting in the queue, and the NEXT test in the same file silently
// receives it. During the E1 epic this corrupted six unrelated assertions in
// one file, each failing for a reason that had nothing to do with the code
// under test.
//
// `mockReset: true` in vitest.config.ts resets every mock before each test,
// which drains the queue. These two tests only pass together, and only in this
// order: the first deliberately over-queues, the second asserts it sees a clean
// mock rather than the leftover.
const chain = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queued once-values do not leak between tests", () => {
  it("over-queues, consuming only the first value", () => {
    chain.mockReturnValueOnce("first").mockReturnValueOnce("LEAKED");
    expect(chain()).toBe("first");
    // "LEAKED" is deliberately left in the queue.
  });

  it("sees a drained mock, not the previous test's leftover", () => {
    chain.mockReturnValueOnce("mine");
    expect(chain()).toBe("mine");
  });
});
