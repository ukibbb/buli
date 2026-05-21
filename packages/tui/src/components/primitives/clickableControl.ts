export type ClickableControlMouseEvent = {
  preventDefault(): void;
  stopPropagation(): void;
};

export function createClickableControlMouseDownHandler(
  onActivate: () => void | Promise<void>,
): (mouseEvent: ClickableControlMouseEvent) => void {
  return (mouseEvent) => {
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    void onActivate();
  };
}
