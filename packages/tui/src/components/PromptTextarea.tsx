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

export const PROMPT_TEXTAREA_MIN_ROW_COUNT = 3;
export const PROMPT_TEXTAREA_MAX_ROW_COUNT = 6;

export type PromptTextareaEdit = {
  promptDraft: string;
  promptDraftCursorOffset: number;
};

export type PromptTextareaSummarizedPaste = {
  pastedText: string;
  replacementStartOffset?: number;
  replacementEndOffset?: number;
};

export type PromptTextareaProps = {
  promptDraft: string;
  promptDraftCursorOffset: number;
  promptImageAttachmentPlaceholderTexts?: readonly string[] | undefined;
  promptTextPastePlaceholderTexts?: readonly string[] | undefined;
  selectedPromptContextReferenceTexts?: readonly string[] | undefined;
  promptContextReferenceTextColor?: string | undefined;
  isFocused: boolean;
  rowCount?: number;
  onPromptDraftEdited: (promptTextareaEdit: PromptTextareaEdit) => void;
  onPromptSubmitted: () => void;
  onNativeClipboardPasteRequested?: (() => void | Promise<void>) | undefined;
  onSummarizedPromptTextPasted?: ((summarizedPromptTextPaste: PromptTextareaSummarizedPaste) => void) | undefined;
};

type PromptContextReferenceRange = {
  startOffset: number;
  endOffset: number;
};

type PromptTextareaDecorativeExtmarkTypeIds = {
  promptImageAttachmentPlaceholderExtmarkTypeId: number | undefined;
  promptTextPastePlaceholderExtmarkTypeId: number | undefined;
  promptContextReferenceExtmarkTypeId: number | undefined;
  hasPromptTextareaDecorativeExtmarks: boolean;
};

const promptTextareaKeyBindings: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "return", ctrl: true, action: "newline" },
];

const promptImageAttachmentPlaceholderStyleScope = "prompt.image_attachment_placeholder";
const promptTextPastePlaceholderExtmarkTypeName = "prompt-text-paste-placeholder";
const promptTextPastePlaceholderStyleScope = "prompt.text_paste_placeholder";
const promptContextReferenceExtmarkTypeName = "prompt-context-reference";
const promptContextReferenceStyleScopePrefix = "prompt.context_reference.";
const promptContextReferenceStyleIdsByTextColor = new Map<string, number>();
const promptTextareaSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  [promptImageAttachmentPlaceholderStyleScope]: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true },
  [promptTextPastePlaceholderStyleScope]: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
});
const promptImageAttachmentPlaceholderStyleId = promptTextareaSyntaxStyle.getStyleId(
  promptImageAttachmentPlaceholderStyleScope,
)!;
const promptTextPastePlaceholderStyleId = promptTextareaSyntaxStyle.getStyleId(
  promptTextPastePlaceholderStyleScope,
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

function shouldSummarizePromptTextareaPastedText(pastedText: string): boolean {
  return countPromptTextareaPastedTextLines(pastedText) >= 3 || pastedText.length > 150;
}

function countPromptTextareaPastedTextLines(pastedText: string): number {
  return (pastedText.match(/\n/g)?.length ?? 0) + 1;
}

export function PromptTextarea(props: PromptTextareaProps): ReactNode {
  const promptTextareaRef = useRef<TextareaRenderable | null>(null);
  const promptImageAttachmentPlaceholderExtmarkTypeIdRef = useRef<number | undefined>(undefined);
  const promptTextPastePlaceholderExtmarkTypeIdRef = useRef<number | undefined>(undefined);
  const promptContextReferenceExtmarkTypeIdRef = useRef<number | undefined>(undefined);
  const promptTextareaDecorativeExtmarkOwnerRef = useRef<TextareaRenderable | null>(null);
  const hasPromptTextareaDecorativeExtmarksRef = useRef(false);
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
      promptTextPastePlaceholderExtmarkTypeIdRef.current = undefined;
      promptContextReferenceExtmarkTypeIdRef.current = undefined;
      hasPromptTextareaDecorativeExtmarksRef.current = false;
    }

    const promptTextareaDecorativeExtmarkTypeIds = syncPromptTextareaDecorativeExtmarks({
      promptTextarea,
      promptDraft: props.promptDraft,
      promptImageAttachmentPlaceholderTexts: props.promptImageAttachmentPlaceholderTexts ?? [],
      promptTextPastePlaceholderTexts: props.promptTextPastePlaceholderTexts ?? [],
      selectedPromptContextReferenceTexts: props.selectedPromptContextReferenceTexts ?? [],
      promptContextReferenceTextColor: props.promptContextReferenceTextColor ?? chatScreenTheme.promptContextReferenceText,
      promptImageAttachmentPlaceholderExtmarkTypeId: promptImageAttachmentPlaceholderExtmarkTypeIdRef.current,
      promptTextPastePlaceholderExtmarkTypeId: promptTextPastePlaceholderExtmarkTypeIdRef.current,
      promptContextReferenceExtmarkTypeId: promptContextReferenceExtmarkTypeIdRef.current,
      hasPromptTextareaDecorativeExtmarks: hasPromptTextareaDecorativeExtmarksRef.current,
    });
    promptImageAttachmentPlaceholderExtmarkTypeIdRef.current =
      promptTextareaDecorativeExtmarkTypeIds.promptImageAttachmentPlaceholderExtmarkTypeId;
    promptTextPastePlaceholderExtmarkTypeIdRef.current =
      promptTextareaDecorativeExtmarkTypeIds.promptTextPastePlaceholderExtmarkTypeId;
    promptContextReferenceExtmarkTypeIdRef.current =
      promptTextareaDecorativeExtmarkTypeIds.promptContextReferenceExtmarkTypeId;
    hasPromptTextareaDecorativeExtmarksRef.current =
      promptTextareaDecorativeExtmarkTypeIds.hasPromptTextareaDecorativeExtmarks;
  }, [
    props.promptContextReferenceTextColor,
    props.promptDraft,
    props.promptImageAttachmentPlaceholderTexts,
    props.promptTextPastePlaceholderTexts,
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
          const promptTextarea = promptTextareaRef.current;
          if (props.onSummarizedPromptTextPasted && shouldSummarizePromptTextareaPastedText(pastedText)) {
            const promptTextareaSelection = promptTextarea?.getSelection();
            const promptTextareaCursorOffset = promptTextarea?.cursorOffset ?? props.promptDraftCursorOffset;
            props.onSummarizedPromptTextPasted({
              pastedText,
              replacementStartOffset: promptTextareaSelection?.start ?? promptTextareaCursorOffset,
              replacementEndOffset: promptTextareaSelection?.end ?? promptTextareaCursorOffset,
            });
            return;
          }

          promptTextarea?.insertText(pastedText);
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
  promptTextPastePlaceholderTexts: readonly string[];
  selectedPromptContextReferenceTexts: readonly string[];
  promptContextReferenceTextColor: string;
  promptImageAttachmentPlaceholderExtmarkTypeId: number | undefined;
  promptTextPastePlaceholderExtmarkTypeId: number | undefined;
  promptContextReferenceExtmarkTypeId: number | undefined;
  hasPromptTextareaDecorativeExtmarks: boolean;
}): PromptTextareaDecorativeExtmarkTypeIds {
  if (
    input.promptImageAttachmentPlaceholderTexts.length === 0 &&
    input.promptTextPastePlaceholderTexts.length === 0 &&
    input.selectedPromptContextReferenceTexts.length === 0 &&
    !input.hasPromptTextareaDecorativeExtmarks
  ) {
    return {
      promptImageAttachmentPlaceholderExtmarkTypeId: input.promptImageAttachmentPlaceholderExtmarkTypeId,
      promptTextPastePlaceholderExtmarkTypeId: input.promptTextPastePlaceholderExtmarkTypeId,
      promptContextReferenceExtmarkTypeId: input.promptContextReferenceExtmarkTypeId,
      hasPromptTextareaDecorativeExtmarks: false,
    };
  }

  input.promptTextarea.extmarks.clear();
  let hasPromptTextareaDecorativeExtmarks = false;

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
      hasPromptTextareaDecorativeExtmarks = true;
      searchStartOffset = endOffset;
    }
  }

  let promptTextPastePlaceholderExtmarkTypeId = input.promptTextPastePlaceholderExtmarkTypeId;
  if (input.promptTextPastePlaceholderTexts.length > 0) {
    promptTextPastePlaceholderExtmarkTypeId = promptTextPastePlaceholderExtmarkTypeId ??
      input.promptTextarea.extmarks.registerType(promptTextPastePlaceholderExtmarkTypeName);
    let searchStartOffset = 0;
    for (const promptTextPastePlaceholderText of input.promptTextPastePlaceholderTexts) {
      const startOffset = input.promptDraft.indexOf(promptTextPastePlaceholderText, searchStartOffset);
      if (startOffset === -1) {
        continue;
      }

      const endOffset = startOffset + promptTextPastePlaceholderText.length;
      input.promptTextarea.extmarks.create({
        start: startOffset,
        end: endOffset,
        virtual: true,
        styleId: promptTextPastePlaceholderStyleId,
        typeId: promptTextPastePlaceholderExtmarkTypeId,
      });
      hasPromptTextareaDecorativeExtmarks = true;
      searchStartOffset = endOffset;
    }
  }

  let promptContextReferenceExtmarkTypeId = input.promptContextReferenceExtmarkTypeId;
  const selectedPromptContextReferenceRanges = input.selectedPromptContextReferenceTexts.length === 0
    ? []
    : listSelectedPromptContextReferenceRanges({
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
      hasPromptTextareaDecorativeExtmarks = true;
    }
  }

  return {
    promptImageAttachmentPlaceholderExtmarkTypeId,
    promptTextPastePlaceholderExtmarkTypeId,
    promptContextReferenceExtmarkTypeId,
    hasPromptTextareaDecorativeExtmarks,
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
