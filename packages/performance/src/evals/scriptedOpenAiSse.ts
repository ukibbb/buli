export type ScriptedOpenAiFunctionCall = Readonly<{
  toolCallId: string;
  functionName: string;
  argumentsJsonText: string;
}>;

export type ScriptedOpenAiResponseStep = Readonly<{
  assistantText?: string | undefined;
  functionCalls?: readonly ScriptedOpenAiFunctionCall[] | undefined;
}>;

type SseDataFrame = Record<string, unknown>;

export function buildScriptedOpenAiSseResponseText(input: {
  responseId: string;
  scriptedResponseStep: ScriptedOpenAiResponseStep;
}): string {
  const outputItems: SseDataFrame[] = [];
  const frames: SseDataFrame[] = [];
  let sequenceNumber = 0;
  let outputIndex = 0;
  const nextSequenceNumber = (): number => sequenceNumber++;

  frames.push({
    type: "response.created",
    sequence_number: nextSequenceNumber(),
    response: { id: input.responseId, object: "response", created_at: 1_700_000_000, status: "in_progress", model: "gpt-5.5" },
  });

  if (input.scriptedResponseStep.assistantText !== undefined) {
    const messageItemId = `msg_${input.responseId}`;
    const completedMessageItem = {
      type: "message",
      id: messageItemId,
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: input.scriptedResponseStep.assistantText, annotations: [] }],
    };
    frames.push({
      type: "response.output_item.added",
      sequence_number: nextSequenceNumber(),
      output_index: outputIndex,
      item: { type: "message", id: messageItemId, role: "assistant", status: "in_progress", content: [] },
    });
    frames.push({
      type: "response.output_text.delta",
      sequence_number: nextSequenceNumber(),
      output_index: outputIndex,
      content_index: 0,
      item_id: messageItemId,
      delta: input.scriptedResponseStep.assistantText,
      logprobs: [],
    });
    frames.push({
      type: "response.output_text.done",
      sequence_number: nextSequenceNumber(),
      output_index: outputIndex,
      content_index: 0,
      item_id: messageItemId,
      text: input.scriptedResponseStep.assistantText,
      logprobs: [],
    });
    frames.push({
      type: "response.output_item.done",
      sequence_number: nextSequenceNumber(),
      output_index: outputIndex,
      item: completedMessageItem,
    });
    outputItems.push(completedMessageItem);
    outputIndex += 1;
  }

  for (const scriptedFunctionCall of input.scriptedResponseStep.functionCalls ?? []) {
    const functionCallItemId = `fc_${scriptedFunctionCall.toolCallId}`;
    const completedFunctionCallItem = {
      type: "function_call",
      id: functionCallItemId,
      call_id: scriptedFunctionCall.toolCallId,
      name: scriptedFunctionCall.functionName,
      arguments: scriptedFunctionCall.argumentsJsonText,
      status: "completed",
    };
    frames.push({
      type: "response.output_item.added",
      sequence_number: nextSequenceNumber(),
      output_index: outputIndex,
      item: { ...completedFunctionCallItem, arguments: "", status: "in_progress" },
    });
    frames.push({
      type: "response.function_call_arguments.delta",
      sequence_number: nextSequenceNumber(),
      output_index: outputIndex,
      item_id: functionCallItemId,
      delta: scriptedFunctionCall.argumentsJsonText,
    });
    frames.push({
      type: "response.function_call_arguments.done",
      sequence_number: nextSequenceNumber(),
      output_index: outputIndex,
      item_id: functionCallItemId,
      name: scriptedFunctionCall.functionName,
      arguments: scriptedFunctionCall.argumentsJsonText,
    });
    frames.push({
      type: "response.output_item.done",
      sequence_number: nextSequenceNumber(),
      output_index: outputIndex,
      item: completedFunctionCallItem,
    });
    outputItems.push(completedFunctionCallItem);
    outputIndex += 1;
  }

  frames.push({
    type: "response.completed",
    sequence_number: nextSequenceNumber(),
    response: {
      id: input.responseId,
      object: "response",
      created_at: 1_700_000_000,
      status: "completed",
      model: "gpt-5.5",
      output: outputItems,
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 10,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 20,
      },
    },
  });

  return `${frames.map((frame) => `data: ${JSON.stringify(frame)}`).join("\n\n")}\n\ndata: [DONE]\n`;
}

export function createScriptedOpenAiSseResponse(sseText: string): Response {
  return new Response(new Blob([sseText]).stream(), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}
