import type { QueuedChatAppPromptPreview } from "@buli/chat-app-controller";
import { chatScreenTheme, type ChatScreenTheme } from "@buli/assistant-design-tokens";
import type { ReactNode } from "react";

const QUEUED_PROMPT_PREVIEW_LIMIT = 3;

const queuedPromptFrameBorderChars = {
  topLeft: "",
  bottomLeft: "└",
  vertical: "│",
  topRight: "",
  bottomRight: "─",
  horizontal: "─",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
} as const;

export type QueuedPromptStackProps = {
  queuedPromptPreviews: readonly QueuedChatAppPromptPreview[];
  accentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
};

export function QueuedPromptStack(props: QueuedPromptStackProps): ReactNode {
  if (props.queuedPromptPreviews.length === 0) {
    return null;
  }

  const visibleQueuedPromptPreviews = props.queuedPromptPreviews.slice(0, QUEUED_PROMPT_PREVIEW_LIMIT);
  const hiddenQueuedPromptCount = Math.max(0, props.queuedPromptPreviews.length - visibleQueuedPromptPreviews.length);

  return (
    <box flexDirection="column" gap={1} paddingX={2} marginBottom={1} width="100%">
      <text fg={chatScreenTheme.textMuted} wrapMode="none" truncate={true}>
        {props.queuedPromptPreviews.length === 1 ? "Queued prompt" : `Queued prompts (${props.queuedPromptPreviews.length})`}
      </text>
      <box flexDirection="column" gap={1} width="100%">
        {visibleQueuedPromptPreviews.map((queuedPromptPreview) => (
          <box
            border={["left", "bottom"]}
            borderColor={props.accentColor}
            customBorderChars={queuedPromptFrameBorderChars}
            flexDirection="column"
            key={queuedPromptPreview.queuedPromptId}
            paddingLeft={1}
            width="100%"
          >
            <text fg={chatScreenTheme.textSecondary} wrapMode="none" truncate={true}>
              {formatQueuedPromptPreviewText(queuedPromptPreview)}
            </text>
          </box>
        ))}
      </box>
      {hiddenQueuedPromptCount > 0 ? (
        <text fg={chatScreenTheme.textMuted} wrapMode="none" truncate={true}>
          {`+ ${hiddenQueuedPromptCount} more queued`}
        </text>
      ) : null}
    </box>
  );
}

function formatQueuedPromptPreviewText(queuedPromptPreview: QueuedChatAppPromptPreview): string {
  const imageAttachmentText = formatQueuedPromptImageAttachmentText(
    queuedPromptPreview.submittedPromptImageAttachmentCount,
  );
  if (queuedPromptPreview.submittedPromptText.length === 0) {
    return imageAttachmentText ?? "Empty queued prompt";
  }

  return imageAttachmentText === undefined
    ? queuedPromptPreview.submittedPromptText
    : `${queuedPromptPreview.submittedPromptText}  ${imageAttachmentText}`;
}

function formatQueuedPromptImageAttachmentText(imageAttachmentCount: number): string | undefined {
  if (imageAttachmentCount === 0) {
    return undefined;
  }

  return imageAttachmentCount === 1 ? "[1 image]" : `[${imageAttachmentCount} images]`;
}
