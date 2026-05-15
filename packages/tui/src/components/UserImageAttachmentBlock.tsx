import type { ReactNode } from "react";
import type { UserPromptImageAttachment } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type UserImageAttachmentBlockProps = {
  attachment: UserPromptImageAttachment;
};

export function UserImageAttachmentBlock(props: UserImageAttachmentBlockProps): ReactNode {
  const imageLabel = props.attachment.fileName ?? props.attachment.attachmentId;
  return (
    <box flexDirection="row" gap={1}>
      <text fg={chatScreenTheme.accentCyan}>[img]</text>
      <text fg={chatScreenTheme.textMuted}>{`Image attached: ${imageLabel} · ${props.attachment.mimeType}`}</text>
    </box>
  );
}
