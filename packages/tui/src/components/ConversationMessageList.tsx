import { memo, type ReactNode, type RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import { ConversationMessageRow } from "./ConversationMessageRow.tsx";

export type ConversationMessageListProps = {
  conversationMessages: readonly ConversationMessage[];
  resolveConversationMessageParts: (messageId: string) => readonly ConversationMessagePart[];
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  onConversationMessageWheelScroll: (direction: "up" | "down") => void;
};

const MemoizedConversationMessageRow = memo(ConversationMessageRow);

export function ConversationMessageList(props: ConversationMessageListProps): ReactNode {
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      onMouseScroll={(mouseEvent) => {
        const scrollDirection = mouseEvent.scroll?.direction;
        if (scrollDirection !== "up" && scrollDirection !== "down") {
          return;
        }

        mouseEvent.stopPropagation();
        props.onConversationMessageWheelScroll(scrollDirection);
      }}
    >
      <scrollbox
        flexDirection="column"
        flexGrow={1}
        ref={props.conversationMessageScrollBoxRef}
        scrollX={false}
        stickyScroll={true}
        stickyStart="bottom"
        verticalScrollbarOptions={{ visible: false, showArrows: false }}
        horizontalScrollbarOptions={{ visible: false, showArrows: false }}
      >
        {props.conversationMessages.map((conversationMessage, index) => (
          <box flexDirection="column" key={conversationMessage.id} marginTop={index === 0 ? 0 : 1} width="100%">
            <MemoizedConversationMessageRow
              conversationMessage={conversationMessage}
              conversationMessageParts={props.resolveConversationMessageParts(conversationMessage.id)}
            />
          </box>
        ))}
      </scrollbox>
    </box>
  );
}
