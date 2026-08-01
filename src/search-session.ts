export class SearchSession {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  cancel(): void {
    this.generation += 1;
  }

  isActive(token: number): boolean {
    return token === this.generation;
  }
}
