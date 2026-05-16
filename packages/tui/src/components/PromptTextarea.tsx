import { useEffect, useRef, type ReactNode } from "react";
import {
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

function clampPromptDraftCursorOffset(promptDraft: string, promptDraftCursorOffset: number): number {
  return Math.max(0, Math.min(promptDraftCursorOffset, promptDraft.length));
}

export function PromptTextarea(props: PromptTextareaProps): ReactNode {
  const promptTextareaRef = useRef<TextareaRenderable | null>(null);
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

  const publishPromptTextareaEdit = () => {
    if (isSynchronizingTextareaFromPromptStateRef.current) {
      return;
    }

    const promptTextarea = promptTextareaRef.current;
    if (!promptTextarea) {
      return;
    }

    props.onPromptDraftEdited({
      promptDraft: promptTextarea.plainText,
      promptDraftCursorOffset: promptTextarea.cursorOffset,
    });
  };

  return (
    <textarea
      ref={promptTextareaRef}
      backgroundColor={chatScreenTheme.bg}
      cursorColor={chatScreenTheme.textPrimary}
      focused={props.isFocused}
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
        void props.onNativeClipboardPasteRequested?.();
      }}
      onSubmit={() => {
        if (!isSynchronizingTextareaFromPromptStateRef.current) {
          props.onPromptSubmitted();
        }
      }}
      selectable={true}
      selectionBg={chatScreenTheme.accentPrimary}
      selectionFg={chatScreenTheme.textPrimary}
      showCursor={props.isFocused}
      textColor={chatScreenTheme.textPrimary}
      width="100%"
      wrapMode="word"
    />
  );
}
