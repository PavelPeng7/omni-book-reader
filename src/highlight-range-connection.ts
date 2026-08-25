export interface HighlightRangeCandidate<T> {
  value: T;
  range: Range;
}

export interface ConnectedHighlightRange<T> {
  range: Range;
  connected: T[];
}

function whitespaceBetween(
  document: Document,
  startContainer: Node,
  startOffset: number,
  endContainer: Node,
  endOffset: number,
): boolean {
  const gap = document.createRange();
  gap.setStart(startContainer, startOffset);
  gap.setEnd(endContainer, endOffset);
  return gap.toString().trim().length === 0;
}

export function connectAdjacentHighlightRanges<T>(
  initialRange: Range,
  candidates: readonly HighlightRangeCandidate<T>[],
): ConnectedHighlightRange<T> {
  const range = initialRange.cloneRange();
  const document = range.startContainer.ownerDocument;
  const connected = new Set<T>();
  if (!document) return { range, connected: [] };

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const candidate of candidates) {
      if (connected.has(candidate.value) || candidate.range.collapsed) continue;
      try {
        const candidateEnd = range.comparePoint(candidate.range.endContainer, candidate.range.endOffset);
        const candidateStart = range.comparePoint(candidate.range.startContainer, candidate.range.startOffset);
        if (candidateEnd < 0) {
          if (!whitespaceBetween(
            document,
            candidate.range.endContainer,
            candidate.range.endOffset,
            range.startContainer,
            range.startOffset,
          )) continue;
          range.setStart(candidate.range.startContainer, candidate.range.startOffset);
        } else if (candidateStart > 0) {
          if (!whitespaceBetween(
            document,
            range.endContainer,
            range.endOffset,
            candidate.range.startContainer,
            candidate.range.startOffset,
          )) continue;
          range.setEnd(candidate.range.endContainer, candidate.range.endOffset);
        } else {
          if (candidateEnd > 0) range.setEnd(candidate.range.endContainer, candidate.range.endOffset);
          if (candidateStart < 0) range.setStart(candidate.range.startContainer, candidate.range.startOffset);
        }
        connected.add(candidate.value);
        expanded = true;
      } catch {
        // Ignore stale or cross-document ranges.
      }
    }
  }

  return { range, connected: [...connected] };
}
