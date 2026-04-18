import type { DOMElement } from "ink";

export type ConversationTranscriptPointerZone = {
  leftColumn: number;
  topRow: number;
  width: number;
  height: number;
};

function measureAbsoluteElementOffset(domElement: DOMElement | null | undefined): { leftColumn: number; topRow: number } {
  let leftColumn = 0;
  let topRow = 0;
  let currentDomElement = domElement;

  while (currentDomElement) {
    const currentDomElementLayout = currentDomElement.yogaNode?.getComputedLayout();
    leftColumn += currentDomElementLayout?.left ?? 0;
    topRow += currentDomElementLayout?.top ?? 0;
    currentDomElement = currentDomElement.parentNode;
  }

  return { leftColumn, topRow };
}

export function measureConversationTranscriptPointerZone(
  conversationTranscriptViewportFrameElement: DOMElement | null,
): ConversationTranscriptPointerZone | undefined {
  if (!conversationTranscriptViewportFrameElement?.yogaNode) {
    return undefined;
  }

  const conversationTranscriptViewportLayout = conversationTranscriptViewportFrameElement.yogaNode.getComputedLayout();
  const absoluteElementOffset = measureAbsoluteElementOffset(conversationTranscriptViewportFrameElement.parentNode);

  return {
    leftColumn: absoluteElementOffset.leftColumn + conversationTranscriptViewportLayout.left,
    topRow: absoluteElementOffset.topRow + conversationTranscriptViewportLayout.top,
    width: conversationTranscriptViewportLayout.width,
    height: conversationTranscriptViewportLayout.height,
  };
}

export function isPointerInsideConversationTranscriptPointerZone(
  conversationTranscriptPointerZone: ConversationTranscriptPointerZone,
  input: { x: number; y: number },
): boolean {
  return (
    input.x >= conversationTranscriptPointerZone.leftColumn &&
    input.x < conversationTranscriptPointerZone.leftColumn + conversationTranscriptPointerZone.width &&
    input.y >= conversationTranscriptPointerZone.topRow &&
    input.y < conversationTranscriptPointerZone.topRow + conversationTranscriptPointerZone.height
  );
}
