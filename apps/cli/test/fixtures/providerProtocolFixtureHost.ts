import {
  PROVIDER_PROTOCOL_VERSION,
  encodeProviderProtocolFrameAsJsonLine,
  streamProviderProtocolHostFramesFromJsonLines,
  type ProviderProtocolHostFrame,
  type ProviderProtocolProviderFrame,
} from "@buli/contracts";

let hasCompletedTurn = false;

async function writeProviderFrame(frame: ProviderProtocolProviderFrame): Promise<void> {
  await Bun.write(Bun.stdout, encodeProviderProtocolFrameAsJsonLine(frame));
}

async function handleStartTurnFrame(frame: Extract<ProviderProtocolHostFrame, { frameKind: "host_start_turn" }>): Promise<void> {
  await writeProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_request_acknowledged",
    requestId: frame.requestId,
    turnId: frame.turnId,
    acknowledgedFrameKind: "host_start_turn",
  });
  await writeProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_event",
    turnId: frame.turnId,
    sequenceNumber: 1,
    providerStreamEvent: {
      type: "tool_call_requested",
      toolCallId: "call-read-fixture",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "README.md",
      },
    },
  });
}

async function handleSubmitToolResultFrame(frame: Extract<ProviderProtocolHostFrame, { frameKind: "host_submit_tool_result" }>): Promise<void> {
  await writeProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_request_acknowledged",
    requestId: frame.requestId,
    turnId: frame.turnId,
    acknowledgedFrameKind: "host_submit_tool_result",
  });
  await writeProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_event",
    turnId: frame.turnId,
    sequenceNumber: 2,
    providerStreamEvent: {
      type: "text_chunk",
      text: `Tool result length: ${frame.toolResultText.length}`,
    },
  });
  await writeProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_event",
    turnId: frame.turnId,
    sequenceNumber: 3,
    providerStreamEvent: {
      type: "completed",
      usage: {
        input: 10,
        output: 4,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  });
  await writeProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_turn_closed",
    turnId: frame.turnId,
    closedReason: "completed",
    finalSequenceNumber: 3,
    providerTurnReplay: {
      provider: "openai",
      inputItems: [],
    },
  });
  hasCompletedTurn = true;
}

async function handleCancelTurnFrame(frame: Extract<ProviderProtocolHostFrame, { frameKind: "host_cancel_turn" }>): Promise<void> {
  await writeProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_request_acknowledged",
    requestId: frame.requestId,
    turnId: frame.turnId,
    acknowledgedFrameKind: "host_cancel_turn",
  });
  if (!hasCompletedTurn) {
    await writeProviderFrame({
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_turn_closed",
      turnId: frame.turnId,
      closedReason: "cancelled",
    });
  }
}

for await (const hostFrame of streamProviderProtocolHostFramesFromJsonLines(Bun.stdin.stream())) {
  switch (hostFrame.frameKind) {
    case "host_start_turn":
      await handleStartTurnFrame(hostFrame);
      break;
    case "host_submit_tool_result":
      await handleSubmitToolResultFrame(hostFrame);
      break;
    case "host_cancel_turn":
      await handleCancelTurnFrame(hostFrame);
      break;
  }
}
