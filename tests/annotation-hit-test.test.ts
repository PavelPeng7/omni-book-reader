import { describe, expect, it, vi } from "vitest";
import { annotationValueAtPoint } from "../src/annotation-hit-test";

describe("annotation hit testing", () => {
  it("returns the annotation under a point in the matching publication document", () => {
    const publicationDocument = document.implementation.createHTMLDocument();
    const otherDocument = document.implementation.createHTMLDocument();
    const hitTest = vi.fn().mockReturnValue(["epubcfi(/6/4)", publicationDocument.createRange()]);
    const renderer = {
      getContents: () => [
        { doc: otherDocument, index: 0 },
        { doc: publicationDocument, index: 1, overlayer: { hitTest } },
      ],
    };

    expect(annotationValueAtPoint(renderer, publicationDocument, 120, 80)).toBe("epubcfi(/6/4)");
    expect(hitTest).toHaveBeenCalledWith({ x: 120, y: 80 });
  });

  it("returns null when the point does not hit an annotation", () => {
    const publicationDocument = document.implementation.createHTMLDocument();
    const renderer = {
      getContents: () => [{
        doc: publicationDocument,
        index: 0,
        overlayer: { hitTest: () => [] },
      }],
    };

    expect(annotationValueAtPoint(renderer, publicationDocument, 20, 30)).toBeNull();
  });
});
