import type { ScrollBoxRenderable } from "@opentui/core";
import { useEffectEvent, useRef, type RefObject } from "react";

export type ConversationTranscriptScrollDirection = "up" | "down";

export type ConversationTranscriptViewport = {
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  scrollConversationMessagesToBottom: () => void;
  scrollConversationMessagesByPage: (direction: ConversationTranscriptScrollDirection) => void;
};

export function useConversationTranscriptViewport(): ConversationTranscriptViewport {
  const conversationMessageScrollBoxRef = useRef<ScrollBoxRenderable | null>(null);

  const scrollConversationMessagesToBottom = useEffectEvent(() => {
    const conversationMessageScrollBox = conversationMessageScrollBoxRef.current;
    if (!conversationMessageScrollBox) {
      return;
    }

    conversationMessageScrollBox.scrollTo(conversationMessageScrollBox.scrollHeight);
  });

  const scrollConversationMessagesByPage = useEffectEvent((direction: ConversationTranscriptScrollDirection) => {
    const conversationMessageScrollBox = conversationMessageScrollBoxRef.current;
    if (!conversationMessageScrollBox) {
      return;
    }

    conversationMessageScrollBox.scrollBy(direction === "up" ? -1 : 1, "viewport");
  });

  return {
    conversationMessageScrollBoxRef,
    scrollConversationMessagesToBottom,
    scrollConversationMessagesByPage,
  };
}
