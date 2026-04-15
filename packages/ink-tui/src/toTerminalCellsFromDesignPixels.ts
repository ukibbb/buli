// Terminal cells have no sub-cell resolution. Every pen-file pixel value
// (gap, padding, width, height when expressed in pixels) passes through
// this mapping so the resulting component layout stays predictable and
// reviewable against ink-limitations.md.
export function toTerminalCellsFromDesignPixels(designPixelValue: number): number {
  if (designPixelValue <= 0) {
    return 0;
  }
  if (designPixelValue <= 10) {
    return 1;
  }
  if (designPixelValue <= 18) {
    return 2;
  }
  return 3;
}
