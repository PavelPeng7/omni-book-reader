export function canNavigateToSavedLocation(
  cfi: string,
  resolveNavigation: (target: string) => unknown,
): boolean {
  return Boolean(cfi.trim()) && Boolean(resolveNavigation(cfi));
}
