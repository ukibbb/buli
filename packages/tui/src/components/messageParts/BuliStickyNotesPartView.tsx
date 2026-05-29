import type { ReactNode } from "react";
import type { AssistantBuliStickyNotesConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";

export function BuliStickyNotesPartView(props: {
  assistantBuliStickyNotesConversationMessagePart: AssistantBuliStickyNotesConversationMessagePart;
}): ReactNode {
  return (
    <SurfaceCard
      accentColor={chatScreenTheme.accentPurple}
      density="compact"
      headerLeft={(
        <box flexDirection="row" gap={1} width="100%">
          <text fg={chatScreenTheme.accentPurple}>Buli Sticky Notes</text>
          <text fg={chatScreenTheme.textSecondary}>Loaded into model context</text>
        </box>
      )}
      bodyContent={(
        <FencedCodeBlock
          codeText={props.assistantBuliStickyNotesConversationMessagePart.buliStickyNotesContextText}
          languageLabel="text"
          showLabel={false}
          showLineNumbers={false}
          variant="embedded"
          wrapMode="word"
        />
      )}
    />
  );
}
