import { useEffect, useRef, type ReactNode } from "react";
import {
  RGBA,
  SyntaxStyle,
  type KeyBinding,
  type TextareaRenderable,
} from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { parsePromptContextReferencesFromPromptText } from "@buli/prompt-context-core";
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
  selectedPromptContextReferenceTexts?: readonly string[] | undefined;
  promptContextReferenceTextColor?: string | undefined;
  isFocused: boolean;
  rowCount?: number;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested?: (() => void | Promise<void>) | undefined;
};

type PromptContextReferenceRange = {
  startOffset: number;
  endOffset: number;
};

type PromptTextareaDecorativeExtmarkTypeIds = {
  promptImageAttachmentPlaceholderExtmarkTypeId: number | undefined;
  promptContextReferenceExtmarkTypeId: number | undefined;
};

const promptTextareaKeyBindings: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "return", ctrl: true, action: "newline" },
];

const promptImageAttachmentPlaceholderStyleScope = "prompt.image_attachment_placeholder";
const promptContextReferenceExtmarkTypeName = "prompt-context-reference";
const promptContextReferenceStyleScopePrefix = "prompt.context_reference.";
const promptContextReferenceStyleIdsByTextColor = new Map<string, number>();
const promptTextareaSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  [promptImageAttachmentPlaceholderStyleScope]: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true },
});
const promptImageAttachmentPlaceholderStyleId = promptTextareaSyntaxStyle.getStyleId(
  promptImageAttachmentPlaceholderStyleScope,
)!;

function resolvePromptContextReferenceStyleId(promptContextReferenceTextColor: string): number {
  const cachedPromptContextReferenceStyleId = promptContextReferenceStyleIdsByTextColor.get(
    promptContextReferenceTextColor,
  );
  if (cachedPromptContextReferenceStyleId !== undefined) {
    return cachedPromptContextReferenceStyleId;
  }

  const promptContextReferenceStyleId = promptTextareaSyntaxStyle.registerStyle(
    `${promptContextReferenceStyleScopePrefix}${promptContextReferenceTextColor}`,
    { fg: RGBA.fromHex(promptContextReferenceTextColor) },
  );
  promptContextReferenceStyleIdsByTextColor.set(promptContextReferenceTextColor, promptContextReferenceStyleId);
  return promptContextReferenceStyleId;
}

function clampPromptDraftCursorOffset(promptDraft: string, promptDraftCursorOffset: number): number {
  return Math.max(0, Math.min(promptDraftCursorOffset, promptDraft.length));
}

function arePromptTextareaEditsEqual(left: PromptTextareaEdit, right: PromptTextareaEdit): boolean {
  return left.promptDraft === right.promptDraft && left.promptDraftCursorOffset === right.promptDraftCursorOffset;
}

export function PromptTextarea(props: PromptTextareaProps): ReactNode {
  const promptTextareaRef = useRef<TextareaRenderable | null>(null);
  const promptImageAttachmentPlaceholderExtmarkTypeIdRef = useRef<number | undefined>(undefined);
  const promptContextReferenceExtmarkTypeIdRef = useRef<number | undefined>(undefined);
  const promptTextareaDecorativeExtmarkOwnerRef = useRef<TextareaRenderable | null>(null);
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

    if (promptTextareaDecorativeExtmarkOwnerRef.current !== promptTextarea) {
      promptTextareaDecorativeExtmarkOwnerRef.current = promptTextarea;
      promptImageAttachmentPlaceholderExtmarkTypeIdRef.current = undefined;
      promptContextReferenceExtmarkTypeIdRef.current = undefined;
    }

    const promptTextareaDecorativeExtmarkTypeIds = syncPromptTextareaDecorativeExtmarks({
      promptTextarea,
      promptDraft: props.promptDraft,
      promptImageAttachmentPlaceholderTexts: props.promptImageAttachmentPlaceholderTexts ?? [],
      selectedPromptContextReferenceTexts: props.selectedPromptContextReferenceTexts ?? [],
      promptContextReferenceTextColor: props.promptContextReferenceTextColor ?? chatScreenTheme.promptContextReferenceText,
      promptImageAttachmentPlaceholderExtmarkTypeId: promptImageAttachmentPlaceholderExtmarkTypeIdRef.current,
      promptContextReferenceExtmarkTypeId: promptContextReferenceExtmarkTypeIdRef.current,
    });
    promptImageAttachmentPlaceholderExtmarkTypeIdRef.current =
      promptTextareaDecorativeExtmarkTypeIds.promptImageAttachmentPlaceholderExtmarkTypeId;
    promptContextReferenceExtmarkTypeIdRef.current =
      promptTextareaDecorativeExtmarkTypeIds.promptContextReferenceExtmarkTypeId;
  }, [
    props.promptContextReferenceTextColor,
    props.promptDraft,
    props.promptImageAttachmentPlaceholderTexts,
    props.selectedPromptContextReferenceTexts,
  ]);

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
      wrapMode="char"
    />
  );
}

function syncPromptTextareaDecorativeExtmarks(input: {
  promptTextarea: TextareaRenderable;
  promptDraft: string;
  promptImageAttachmentPlaceholderTexts: readonly string[];
  selectedPromptContextReferenceTexts: readonly string[];
  promptContextReferenceTextColor: string;
  promptImageAttachmentPlaceholderExtmarkTypeId: number | undefined;
  promptContextReferenceExtmarkTypeId: number | undefined;
}): PromptTextareaDecorativeExtmarkTypeIds {
  input.promptTextarea.extmarks.clear();

  let promptImageAttachmentPlaceholderExtmarkTypeId = input.promptImageAttachmentPlaceholderExtmarkTypeId;
  if (input.promptImageAttachmentPlaceholderTexts.length > 0) {
    promptImageAttachmentPlaceholderExtmarkTypeId = promptImageAttachmentPlaceholderExtmarkTypeId ??
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
  }

  let promptContextReferenceExtmarkTypeId = input.promptContextReferenceExtmarkTypeId;
  const selectedPromptContextReferenceRanges = listSelectedPromptContextReferenceRanges({
    promptDraft: input.promptDraft,
    selectedPromptContextReferenceTexts: input.selectedPromptContextReferenceTexts,
  });
  if (selectedPromptContextReferenceRanges.length > 0) {
    promptContextReferenceExtmarkTypeId = promptContextReferenceExtmarkTypeId ??
      input.promptTextarea.extmarks.registerType(promptContextReferenceExtmarkTypeName);
    const promptContextReferenceStyleId = resolvePromptContextReferenceStyleId(input.promptContextReferenceTextColor);
    for (const selectedPromptContextReferenceRange of selectedPromptContextReferenceRanges) {
      input.promptTextarea.extmarks.create({
        start: selectedPromptContextReferenceRange.startOffset,
        end: selectedPromptContextReferenceRange.endOffset,
        virtual: false,
        styleId: promptContextReferenceStyleId,
        typeId: promptContextReferenceExtmarkTypeId,
      });
    }
  }

  return {
    promptImageAttachmentPlaceholderExtmarkTypeId,
    promptContextReferenceExtmarkTypeId,
  };
}

function listSelectedPromptContextReferenceRanges(input: {
  promptDraft: string;
  selectedPromptContextReferenceTexts: readonly string[];
}): PromptContextReferenceRange[] {
  const selectedPromptContextReferenceRanges: PromptContextReferenceRange[] = [];
  const parsedPromptContextReferences = parsePromptContextReferencesFromPromptText(input.promptDraft);
  let searchStartOffset = 0;

  for (const selectedPromptContextReferenceText of input.selectedPromptContextReferenceTexts) {
    if (selectedPromptContextReferenceText.length === 0) {
      continue;
    }

    const matchedPromptContextReference = parsedPromptContextReferences.find(
      (parsedPromptContextReference) =>
        parsedPromptContextReference.startOffset >= searchStartOffset &&
        parsedPromptContextReference.promptReferenceText === selectedPromptContextReferenceText,
    );
    if (!matchedPromptContextReference) {
      continue;
    }

    selectedPromptContextReferenceRanges.push({
      startOffset: matchedPromptContextReference.startOffset,
      endOffset: matchedPromptContextReference.endOffset,
    });
    searchStartOffset = matchedPromptContextReference.endOffset;
  }

  return selectedPromptContextReferenceRanges;
}
