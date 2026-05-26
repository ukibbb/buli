import {
  Profiler,
  useEffect,
  useRef,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from "react";
import { ChatScreen, type ChatScreenProps } from "./ChatScreen.tsx";
import { TerminalSelectionClipboardBridge } from "./clipboard/TerminalSelectionClipboardBridge.tsx";
import { logTuiDiagnosticEvent } from "./diagnostics/logTuiDiagnosticEvent.ts";

type ChatScreenReactRenderSummary = {
  commitCount: number;
  mountCommitCount: number;
  updateCommitCount: number;
  totalActualDurationMs: number;
  maxActualDurationMs: number;
  totalBaseDurationMs: number;
  maxBaseDurationMs: number;
  firstCommitAtMs: number | undefined;
  lastCommitAtMs: number | undefined;
};

export function TerminalChatScreenApp(props: ChatScreenProps): ReactNode {
  const chatScreen = props.diagnosticLogger && shouldProfileTerminalChatScreenRendering()
    ? <ProfiledTerminalChatScreen chatScreenProps={props} />
    : <ChatScreen {...props} />;

  return (
    <box height="100%" position="relative" width="100%">
      {chatScreen}
      <TerminalSelectionClipboardBridge />
    </box>
  );
}

function shouldProfileTerminalChatScreenRendering(): boolean {
  return Boolean(process.env["BULI_PROFILE_FILE"]?.trim()) || process.env["BULI_PROFILE_TUI_RENDER"] === "1";
}

function ProfiledTerminalChatScreen(props: { chatScreenProps: ChatScreenProps }): ReactNode {
  const diagnosticLogger = props.chatScreenProps.diagnosticLogger;
  const renderSummaryRef = useRef<ChatScreenReactRenderSummary>(createEmptyChatScreenReactRenderSummary());
  const recordReactRenderCommit: ProfilerOnRenderCallback = (
    profilerId,
    renderPhase,
    actualDurationMs,
    baseDurationMs,
    renderStartedAtMs,
    commitStartedAtMs,
  ) => {
    const renderSummary = renderSummaryRef.current;
    renderSummary.commitCount += 1;
    if (renderPhase === "mount") {
      renderSummary.mountCommitCount += 1;
    } else if (renderPhase === "update") {
      renderSummary.updateCommitCount += 1;
    }
    renderSummary.totalActualDurationMs += actualDurationMs;
    renderSummary.maxActualDurationMs = Math.max(renderSummary.maxActualDurationMs, actualDurationMs);
    renderSummary.totalBaseDurationMs += baseDurationMs;
    renderSummary.maxBaseDurationMs = Math.max(renderSummary.maxBaseDurationMs, baseDurationMs);
    renderSummary.firstCommitAtMs ??= commitStartedAtMs;
    renderSummary.lastCommitAtMs = commitStartedAtMs;

    logTuiDiagnosticEvent(diagnosticLogger, "chat_screen.react_render_commit", {
      profilerId,
      renderPhase,
      durationMs: actualDurationMs,
      actualDurationMs,
      baseDurationMs,
      renderStartedAtMs,
      commitStartedAtMs,
    });
  };

  useEffect(() => {
    return () => {
      const renderSummary = renderSummaryRef.current;
      if (renderSummary.commitCount === 0) {
        return;
      }

      logTuiDiagnosticEvent(diagnosticLogger, "chat_screen.react_render_summary", {
        commitCount: renderSummary.commitCount,
        mountCommitCount: renderSummary.mountCommitCount,
        updateCommitCount: renderSummary.updateCommitCount,
        totalActualDurationMs: renderSummary.totalActualDurationMs,
        maxActualDurationMs: renderSummary.maxActualDurationMs,
        meanActualDurationMs: renderSummary.totalActualDurationMs / renderSummary.commitCount,
        totalBaseDurationMs: renderSummary.totalBaseDurationMs,
        maxBaseDurationMs: renderSummary.maxBaseDurationMs,
        firstCommitAtMs: renderSummary.firstCommitAtMs ?? null,
        lastCommitAtMs: renderSummary.lastCommitAtMs ?? null,
      });
    };
  }, [diagnosticLogger]);

  return (
    <Profiler id="chat-screen" onRender={recordReactRenderCommit}>
      <ChatScreen {...props.chatScreenProps} />
    </Profiler>
  );
}

function createEmptyChatScreenReactRenderSummary(): ChatScreenReactRenderSummary {
  return {
    commitCount: 0,
    mountCommitCount: 0,
    updateCommitCount: 0,
    totalActualDurationMs: 0,
    maxActualDurationMs: 0,
    totalBaseDurationMs: 0,
    maxBaseDurationMs: 0,
    firstCommitAtMs: undefined,
    lastCommitAtMs: undefined,
  };
}
