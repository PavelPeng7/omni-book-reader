import { afterEach, describe, expect, it, vi } from "vitest";
import { bookLoadTimeout, withLoadTimeout } from "../src/epub-loader";

describe("EPUB loading controls", () => {
  afterEach(() => vi.useRealTimers());

  it("gives large publications a bounded longer timeout", () => {
    expect(bookLoadTimeout(10 * 1024 * 1024)).toBe(45_000);
    expect(bookLoadTimeout(100 * 1024 * 1024)).toBe(105_000);
    expect(bookLoadTimeout(1024 * 1024 * 1024)).toBe(300_000);
  });

  it("reports slow loading and rejects a permanently stalled operation", async () => {
    vi.useFakeTimers();
    const onSlow = vi.fn();
    const result = withLoadTimeout(new Promise<never>(() => {}), 3_000, onSlow);
    const rejection = expect(result).rejects.toThrow("timed out after 3 seconds");

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onSlow).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2_000);
    await rejection;
  });
});
