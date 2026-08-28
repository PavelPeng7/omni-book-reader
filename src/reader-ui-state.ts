export type ReaderOverlay = "appearance" | "page-jump" | "selection" | "highlight" | null;

/** Keeps reader chrome mutually exclusive without coupling it to EPUB state. */
export class ReaderUiState {
  private overlay: ReaderOverlay = null;
  private chromeHidden = false;

  constructor(private readonly onChange: (overlay: ReaderOverlay, chromeHidden: boolean) => void) {}

  open(overlay: Exclude<ReaderOverlay, null>): void {
    this.overlay = overlay;
    this.chromeHidden = false;
    this.emit();
  }

  close(overlay?: Exclude<ReaderOverlay, null>): void {
    if (overlay && this.overlay !== overlay) return;
    this.overlay = null;
    this.emit();
  }

  hideChrome(): void {
    if (this.overlay || this.chromeHidden) return;
    this.chromeHidden = true;
    this.emit();
  }

  revealChrome(): void {
    if (!this.chromeHidden) return;
    this.chromeHidden = false;
    this.emit();
  }

  get activeOverlay(): ReaderOverlay { return this.overlay; }
  get isChromeHidden(): boolean { return this.chromeHidden; }

  private emit(): void { this.onChange(this.overlay, this.chromeHidden); }
}
