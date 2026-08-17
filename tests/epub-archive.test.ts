// @vitest-environment node

import { describe, expect, it } from "vitest";
import { isReadableEpubArchive } from "../src/epub-loader";

// Standard stored ZIP containing an empty META-INF/container.xml entry.
const minimalEpubArchive = Uint8Array.from(Buffer.from(
  "UEsDBAoAAAAAAGiGEV0AAAAAAAAAAAAAAAAWABwATUVUQS1JTkYvY29udGFpbmVyLnhtbFVUCQADhMuCaoTLgmp1eAsAAQT2AQAABAAAAABQSwECHgMKAAAAAABohhFdAAAAAAAAAAAAAAAAFgAYAAAAAAAAAAAApIEAAAAATUVUQS1JTkYvY29udGFpbmVyLnhtbFVUBQADhMuCanV4CwABBPYBAAAEAAAAAFBLBQYAAAAAAQABAFwAAABQAAAAAAA=",
  "base64",
));

describe("isReadableEpubArchive", () => {
  it("checks the EPUB container entry instead of trusting the ZIP header", async () => {
    await expect(isReadableEpubArchive(minimalEpubArchive)).resolves.toBe(true);
    await expect(isReadableEpubArchive(minimalEpubArchive.subarray(0, 20))).resolves.toBe(false);
  });
});
