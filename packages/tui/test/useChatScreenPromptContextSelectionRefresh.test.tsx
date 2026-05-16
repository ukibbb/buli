import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import {
  createInitialChatSessionState,
  replacePromptDraftFromEditor,
  type ChatSessionState,
} from "@buli/chat-session-state";
import type { PromptContextCandidate } from "@buli/engine";
import { act, useState } from "react";
import {
  useChatScreenPromptContextSelectionRefresh,
  type LoadChatScreenPromptContextCandidates,
  type UseChatScreenPromptContextSelectionRefreshResult,
} from "../src/behavior/useChatScreenPromptContextSelectionRefresh.ts";
import { testRender } from "./testRenderWithCleanup.ts";

type PromptContextRefreshHarnessApi = {
  chatSessionState: ChatSessionState;
  replacePromptDraft: (promptDraft: string) => void;
  dismissActivePromptContextQuery: UseChatScreenPromptContextSelectionRefreshResult["dismissActivePromptContextQuery"];
};

type RenderedPromptContextRefreshHook = {
  readCurrentChatSessionState: () => ChatSessionState;
  replacePromptDraft: (promptDraft: string) => Promise<void>;
  flushHookEffects: (delayMs?: number) => Promise<void>;
};

type PendingPromptContextLoad = {
  promptContextQueryText: string;
  resolvePromptContextCandidates: (promptContextCandidates: readonly PromptContextCandidate[]) => void;
};

async function renderPromptContextRefreshHook(input: {
  loadPromptContextCandidates: LoadChatScreenPromptContextCandidates;
  diagnosticLogEvents: BuliDiagnosticLogEvent[];
}): Promise<RenderedPromptContextRefreshHook> {
  let latestHarnessApi: PromptContextRefreshHarnessApi | undefined;
  const renderedHook = await testRender(
    <PromptContextRefreshHookProbe
      loadPromptContextCandidates={input.loadPromptContextCandidates}
      diagnosticLogEvents={input.diagnosticLogEvents}
      observeHarnessApi={(harnessApi) => {
        latestHarnessApi = harnessApi;
      }}
    />,
  );

  const readCurrentHarnessApi = (): PromptContextRefreshHarnessApi => {
    if (!latestHarnessApi) {
      throw new Error("Prompt context refresh hook did not render.");
    }

    return latestHarnessApi;
  };

  return {
    readCurrentChatSessionState(): ChatSessionState {
      return readCurrentHarnessApi().chatSessionState;
    },
    async replacePromptDraft(promptDraft: string): Promise<void> {
      await act(async () => {
        readCurrentHarnessApi().replacePromptDraft(promptDraft);
      });
      await renderedHook.renderOnce();
    },
    async flushHookEffects(delayMs = 0): Promise<void> {
      await act(async () => {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          await Promise.resolve();
        }
      });
      await renderedHook.renderOnce();
    },
  };
}

function PromptContextRefreshHookProbe(props: {
  loadPromptContextCandidates: LoadChatScreenPromptContextCandidates;
  diagnosticLogEvents: BuliDiagnosticLogEvent[];
  observeHarnessApi: (harnessApi: PromptContextRefreshHarnessApi) => void;
}) {
  const [chatSessionState, setChatSessionState] = useState(() =>
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" })
  );
  const hookResult = useChatScreenPromptContextSelectionRefresh({
    chatSessionState,
    setChatSessionState,
    loadPromptContextCandidates: props.loadPromptContextCandidates,
    diagnosticLogger: (diagnosticLogEvent) => {
      props.diagnosticLogEvents.push(diagnosticLogEvent);
    },
  });

  props.observeHarnessApi({
    chatSessionState,
    replacePromptDraft(promptDraft) {
      setChatSessionState((currentChatSessionState) =>
        replacePromptDraftFromEditor({
          chatSessionState: currentChatSessionState,
          promptDraft,
          promptDraftCursorOffset: promptDraft.length,
        })
      );
    },
    dismissActivePromptContextQuery: hookResult.dismissActivePromptContextQuery,
  });

  return <box />;
}

test("useChatScreenPromptContextSelectionRefresh loads current-directory candidates immediately", async () => {
  const diagnosticLogEvents: BuliDiagnosticLogEvent[] = [];
  const requestedPromptContextQueryTexts: string[] = [];
  const promptContextCandidates = [createPromptContextCandidate("README.md")];
  const renderedHook = await renderPromptContextRefreshHook({
    diagnosticLogEvents,
    async loadPromptContextCandidates(promptContextQueryText) {
      requestedPromptContextQueryTexts.push(promptContextQueryText);
      return promptContextCandidates;
    },
  });

  await renderedHook.replacePromptDraft("@");
  await renderedHook.flushHookEffects();

  expect(requestedPromptContextQueryTexts).toEqual([""]);
  expect(renderedHook.readCurrentChatSessionState().promptContextSelectionState).toEqual({
    step: "showing_prompt_context_candidates",
    promptContextQueryText: "",
    promptContextCandidates,
    highlightedPromptContextCandidateIndex: 0,
  });
});

test("useChatScreenPromptContextSelectionRefresh debounces fuzzy candidate loads", async () => {
  const diagnosticLogEvents: BuliDiagnosticLogEvent[] = [];
  const requestedPromptContextQueryTexts: string[] = [];
  const renderedHook = await renderPromptContextRefreshHook({
    diagnosticLogEvents,
    async loadPromptContextCandidates(promptContextQueryText) {
      requestedPromptContextQueryTexts.push(promptContextQueryText);
      return [createPromptContextCandidate(`${promptContextQueryText}.ts`)];
    },
  });

  await renderedHook.replacePromptDraft("@pr");
  await renderedHook.flushHookEffects(60);

  expect(requestedPromptContextQueryTexts).toEqual([]);

  await renderedHook.flushHookEffects(90);

  expect(requestedPromptContextQueryTexts).toEqual(["pr"]);
  expect(renderedHook.readCurrentChatSessionState().promptContextSelectionState).toMatchObject({
    step: "showing_prompt_context_candidates",
    promptContextQueryText: "pr",
  });
});

test("useChatScreenPromptContextSelectionRefresh discards stale resolved loads", async () => {
  const diagnosticLogEvents: BuliDiagnosticLogEvent[] = [];
  const pendingPromptContextLoads: PendingPromptContextLoad[] = [];
  const renderedHook = await renderPromptContextRefreshHook({
    diagnosticLogEvents,
    loadPromptContextCandidates(promptContextQueryText) {
      return new Promise<readonly PromptContextCandidate[]>((resolvePromptContextCandidates) => {
        pendingPromptContextLoads.push({ promptContextQueryText, resolvePromptContextCandidates });
      });
    },
  });

  await renderedHook.replacePromptDraft("@./old");
  await renderedHook.flushHookEffects();
  await renderedHook.replacePromptDraft("@./new");
  await renderedHook.flushHookEffects();

  expect(pendingPromptContextLoads.map((pendingPromptContextLoad) => pendingPromptContextLoad.promptContextQueryText))
    .toEqual(["./old", "./new"]);

  const stalePromptContextLoad = pendingPromptContextLoads[0];
  if (!stalePromptContextLoad) {
    throw new Error("Expected stale prompt-context load to be pending.");
  }

  stalePromptContextLoad.resolvePromptContextCandidates([createPromptContextCandidate("old.ts")]);
  await renderedHook.flushHookEffects();

  expect(renderedHook.readCurrentChatSessionState().promptContextSelectionState.step).toBe("hidden");
  expect(diagnosticLogEvents.some((diagnosticLogEvent) =>
    diagnosticLogEvent.eventName === "chat_screen.prompt_context_load_discarded"
  )).toBe(true);

  const currentPromptContextLoad = pendingPromptContextLoads[1];
  if (!currentPromptContextLoad) {
    throw new Error("Expected current prompt-context load to be pending.");
  }

  const currentPromptContextCandidates = [createPromptContextCandidate("new.ts")];
  currentPromptContextLoad.resolvePromptContextCandidates(currentPromptContextCandidates);
  await renderedHook.flushHookEffects();

  expect(renderedHook.readCurrentChatSessionState().promptContextSelectionState).toEqual({
    step: "showing_prompt_context_candidates",
    promptContextQueryText: "./new",
    promptContextCandidates: currentPromptContextCandidates,
    highlightedPromptContextCandidateIndex: 0,
  });
});

test("useChatScreenPromptContextSelectionRefresh hides candidates when loading fails", async () => {
  const diagnosticLogEvents: BuliDiagnosticLogEvent[] = [];
  const renderedHook = await renderPromptContextRefreshHook({
    diagnosticLogEvents,
    async loadPromptContextCandidates(promptContextQueryText) {
      if (promptContextQueryText === "") {
        return [createPromptContextCandidate("README.md")];
      }

      throw new Error("prompt context index unavailable");
    },
  });

  await renderedHook.replacePromptDraft("@");
  await renderedHook.flushHookEffects();
  expect(renderedHook.readCurrentChatSessionState().promptContextSelectionState).toMatchObject({
    step: "showing_prompt_context_candidates",
    promptContextQueryText: "",
  });

  await renderedHook.replacePromptDraft("@./broken");
  await renderedHook.flushHookEffects();

  expect(renderedHook.readCurrentChatSessionState().promptContextSelectionState.step).toBe("hidden");
  expect(diagnosticLogEvents).toContainEqual(
    expect.objectContaining({
      eventName: "chat_screen.prompt_context_load_failed",
      fields: expect.objectContaining({
        promptContextQueryLength: 8,
        errorMessage: "prompt context index unavailable",
      }),
    }),
  );
});

function createPromptContextCandidate(displayPath: string): PromptContextCandidate {
  return {
    kind: "file",
    displayPath,
    promptReferenceText: `@${displayPath}`,
  };
}
