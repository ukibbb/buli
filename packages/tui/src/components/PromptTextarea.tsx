import { useEffect, useRef, type ReactNode } from "react";
import {
  RGBA,
  SyntaxStyle,
  type KeyBinding,
  type TextareaRenderable,
} from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { normalizeOpenTuiPasteEventText } from "../behavior/normalizeOpenTuiPasteEventText.ts";

export const PROMPT_TEXTAREA_MIN_ROW_COUNT = 2;
export const PROMPT_TEXTAREA_MAX_ROW_COUNT = 6;

export type PromptTextareaEdit = {
  promptDraft: string;
  promptDraftCursorOffset: number;
};

export type PromptTextareaProps = {
  promptDraft: string;
  promptDraftCursorOffset: number;
  promptImageAttachmentPlaceholderTexts?: readonly string[] | undefined;
  isFocused: boolean;
  rowCount?: number;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested?: (() => void | Promise<void>) | undefined;
};

const promptTextareaKeyBindings: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "return", ctrl: true, action: "newline" },
];

const promptImageAttachmentPlaceholderStyleScope = "prompt.image_attachment_placeholder";
const promptTextareaSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  [promptImageAttachmentPlaceholderStyleScope]: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true },
});
const promptImageAttachmentPlaceholderStyleId = promptTextareaSyntaxStyle.getStyleId(
  promptImageAttachmentPlaceholderStyleScope,
)!;

function clampPromptDraftCursorOffset(promptDraft: string, promptDraftCursorOffset: number): number {
  return Math.max(0, Math.min(promptDraftCursorOffset, promptDraft.length));
}

function arePromptTextareaEditsEqual(left: PromptTextareaEdit, right: PromptTextareaEdit): boolean {
  return left.promptDraft === right.promptDraft && left.promptDraftCursorOffset === right.promptDraftCursorOffset;
}

export function PromptTextarea(props: PromptTextareaProps): ReactNode {
  const promptTextareaRef = useRef<TextareaRenderable | null>(null);
  const promptImageAttachmentPlaceholderExtmarkTypeIdRef = useRef<number | undefined>(undefined);
  const promptImageAttachmentPlaceholderExtmarkOwnerRef = useRef<TextareaRenderable | null>(null);
  const isSynchronizingTextareaFromPromptStateRef = useRef(false);
  const promptTextareaRowSizing =
    props.rowCount === undefined
      ? {
          minHeight: PROMPT_TEXTAREA_MIN_ROW_COUNT,
          maxHeight: PROMPT_TEXTAREA_MAX_ROW_COUNT,
        }
      : {
          height: props.rowCount,
        };

  useEffect(() => {
    const promptTextarea = promptTextareaRef.current;
    if (!promptTextarea) {
      return;
    }

    if (props.isFocused) {
      if (!promptTextarea.focused) {
        promptTextarea.focus();
      }
      return;
    }

    if (promptTextarea.focused) {
      promptTextarea.blur();
    }
  }, [props.isFocused]);

  useEffect(() => {
    const promptTextarea = promptTextareaRef.current;
    if (!promptTextarea) {
      return;
    }

    const nextCursorOffset = clampPromptDraftCursorOffset(props.promptDraft, props.promptDraftCursorOffset);
    if (promptTextarea.plainText === props.promptDraft && promptTextarea.cursorOffset === nextCursorOffset) {
      return;
    }

    isSynchronizingTextareaFromPromptStateRef.current = true;
    try {
      if (promptTextarea.plainText !== props.promptDraft) {
        promptTextarea.setText(props.promptDraft);
      }
      if (promptTextarea.cursorOffset !== nextCursorOffset) {
        promptTextarea.cursorOffset = nextCursorOffset;
      }
    } finally {
      isSynchronizingTextareaFromPromptStateRef.current = false;
    }
  }, [props.promptDraft, props.promptDraftCursorOffset]);

  useEffect(() => {
    const promptTextarea = promptTextareaRef.current;
    if (!promptTextarea) {
      return;
    }

    if (promptImageAttachmentPlaceholderExtmarkOwnerRef.current !== promptTextarea) {
      promptImageAttachmentPlaceholderExtmarkOwnerRef.current = promptTextarea;
      promptImageAttachmentPlaceholderExtmarkTypeIdRef.current = undefined;
    }

    promptImageAttachmentPlaceholderExtmarkTypeIdRef.current = syncPromptImageAttachmentPlaceholderExtmarks({
      promptTextarea,
      promptDraft: props.promptDraft,
      promptImageAttachmentPlaceholderTexts: props.promptImageAttachmentPlaceholderTexts ?? [],
      promptImageAttachmentPlaceholderExtmarkTypeId: promptImageAttachmentPlaceholderExtmarkTypeIdRef.current,
    });
  }, [props.promptDraft, props.promptImageAttachmentPlaceholderTexts]);

  const publishPromptTextareaEdit = () => {
    if (isSynchronizingTextareaFromPromptStateRef.current) {
      return;
    }

    const promptTextarea = promptTextareaRef.current;
    if (!promptTextarea) {
      return;
    }

    const promptTextareaEdit = {
      promptDraft: promptTextarea.plainText,
      promptDraftCursorOffset: promptTextarea.cursorOffset,
    };
    const controlledPromptTextareaEdit = {
      promptDraft: props.promptDraft,
      promptDraftCursorOffset: clampPromptDraftCursorOffset(props.promptDraft, props.promptDraftCursorOffset),
    };
    if (arePromptTextareaEditsEqual(promptTextareaEdit, controlledPromptTextareaEdit)) {
      return;
    }

    props.onPromptDraftEdited(promptTextareaEdit);
  };

  return (
    <textarea
      ref={promptTextareaRef}
      backgroundColor={chatScreenTheme.bg}
      cursorColor={chatScreenTheme.textPrimary}
      focusedBackgroundColor={chatScreenTheme.bg}
      focusedTextColor={chatScreenTheme.textPrimary}
      {...promptTextareaRowSizing}
      initialValue={props.promptDraft}
      keyBindings={promptTextareaKeyBindings}
      onContentChange={publishPromptTextareaEdit}
      onCursorChange={publishPromptTextareaEdit}
      onPaste={(pasteEvent) => {
        const pastedText = normalizeOpenTuiPasteEventText(pasteEvent);
        pasteEvent.preventDefault();
        if (pastedText.length > 0) {
          promptTextareaRef.current?.insertText(pastedText);
          return;
        }
        if (pasteEvent.bytes.length === 0) {
          void props.onNativeClipboardPasteRequested?.();
        }
      }}
      onSubmit={() => {
        if (!isSynchronizingTextareaFromPromptStateRef.current) {
          props.onPromptSubmitted();
        }
      }}
      selectable={true}
      selectionBg={chatScreenTheme.accentPrimary}
      selectionFg={chatScreenTheme.textPrimary}
      syntaxStyle={promptTextareaSyntaxStyle}
      textColor={chatScreenTheme.textPrimary}
      width="100%"
      wrapMode="word"
    />
  );
}

function syncPromptImageAttachmentPlaceholderExtmarks(input: {
  promptTextarea: TextareaRenderable;
  promptDraft: string;
  promptImageAttachmentPlaceholderTexts: readonly string[];
  promptImageAttachmentPlaceholderExtmarkTypeId: number | undefined;
}): number | undefined {
  input.promptTextarea.extmarks.clear();
  if (input.promptImageAttachmentPlaceholderTexts.length === 0) {
    return input.promptImageAttachmentPlaceholderExtmarkTypeId;
  }

  const promptImageAttachmentPlaceholderExtmarkTypeId = input.promptImageAttachmentPlaceholderExtmarkTypeId ??
    input.promptTextarea.extmarks.registerType("prompt-image-attachment-placeholder");
  let searchStartOffset = 0;
  for (const promptImageAttachmentPlaceholderText of input.promptImageAttachmentPlaceholderTexts) {
    const startOffset = input.promptDraft.indexOf(promptImageAttachmentPlaceholderText, searchStartOffset);
    if (startOffset === -1) {
      continue;
    }

    const endOffset = startOffset + promptImageAttachmentPlaceholderText.length;
    input.promptTextarea.extmarks.create({
      start: startOffset,
      end: endOffset,
      virtual: true,
      styleId: promptImageAttachmentPlaceholderStyleId,
      typeId: promptImageAttachmentPlaceholderExtmarkTypeId,
    });
    searchStartOffset = endOffset;
  }

  return promptImageAttachmentPlaceholderExtmarkTypeId;
}
