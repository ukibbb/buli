import type { AssistantResponseEvent } from "@buli/contracts";

type AssistantResponseEventStream = {
  streamIndex: number;
  iterator: AsyncIterator<AssistantResponseEvent>;
};

type ActiveAssistantResponseEventStream = AssistantResponseEventStream & {
  nextEventPromise: Promise<AssistantResponseEventStreamResult>;
};

type AssistantResponseEventStreamResult = {
  streamIndex: number;
  iteratorResult: IteratorResult<AssistantResponseEvent>;
};

export async function* mergeAssistantResponseEventStreams(input: {
  assistantResponseEventStreams: readonly AsyncGenerator<AssistantResponseEvent, void, unknown>[];
  throwIfConversationTurnInterrupted: () => void;
}): AsyncGenerator<AssistantResponseEvent> {
  const assistantResponseEventStreams: AssistantResponseEventStream[] = input.assistantResponseEventStreams.map(
    (assistantResponseEventStream, streamIndex) => {
      const iterator = assistantResponseEventStream[Symbol.asyncIterator]();
      return {
        streamIndex,
        iterator,
      };
    },
  );

  let didFinishMergingAllStreams = false;
  try {
    const initialAssistantResponseEventStreamResults = await Promise.all(
      assistantResponseEventStreams.map((assistantResponseEventStream) =>
        readNextAssistantResponseEventFromStream(assistantResponseEventStream)
      ),
    );
    input.throwIfConversationTurnInterrupted();

    const assistantResponseEventStreamsWithRemainingEvents: AssistantResponseEventStream[] = [];
    for (const initialAssistantResponseEventStreamResult of initialAssistantResponseEventStreamResults) {
      const assistantResponseEventStream = assistantResponseEventStreams[initialAssistantResponseEventStreamResult.streamIndex];
      if (!assistantResponseEventStream) {
        throw new Error(`Missing assistant response stream at index ${initialAssistantResponseEventStreamResult.streamIndex}.`);
      }

      if (initialAssistantResponseEventStreamResult.iteratorResult.done) {
        continue;
      }

      assistantResponseEventStreamsWithRemainingEvents.push(assistantResponseEventStream);
      yield initialAssistantResponseEventStreamResult.iteratorResult.value;
      input.throwIfConversationTurnInterrupted();
    }

    const activeAssistantResponseEventStreams: ActiveAssistantResponseEventStream[] = assistantResponseEventStreamsWithRemainingEvents.map(
      (assistantResponseEventStream) => ({
        ...assistantResponseEventStream,
        nextEventPromise: readNextAssistantResponseEventFromStream(assistantResponseEventStream),
      }),
    );

    while (activeAssistantResponseEventStreams.length > 0) {
      input.throwIfConversationTurnInterrupted();
      const nextAssistantResponseEventStreamResult = await Promise.race(
        activeAssistantResponseEventStreams.map((activeAssistantResponseEventStream) =>
          activeAssistantResponseEventStream.nextEventPromise
        ),
      );
      input.throwIfConversationTurnInterrupted();

      const activeStreamIndex = activeAssistantResponseEventStreams.findIndex((activeAssistantResponseEventStream) =>
        activeAssistantResponseEventStream.streamIndex === nextAssistantResponseEventStreamResult.streamIndex
      );
      if (activeStreamIndex === -1) {
        throw new Error(`Received an event from inactive assistant response stream ${nextAssistantResponseEventStreamResult.streamIndex}.`);
      }

      const activeAssistantResponseEventStream = activeAssistantResponseEventStreams[activeStreamIndex];
      if (!activeAssistantResponseEventStream) {
        throw new Error(`Missing active assistant response stream at index ${activeStreamIndex}.`);
      }

      if (nextAssistantResponseEventStreamResult.iteratorResult.done) {
        activeAssistantResponseEventStreams.splice(activeStreamIndex, 1);
        continue;
      }

      activeAssistantResponseEventStream.nextEventPromise = readNextAssistantResponseEventFromStream({
        streamIndex: activeAssistantResponseEventStream.streamIndex,
        iterator: activeAssistantResponseEventStream.iterator,
      });
      yield nextAssistantResponseEventStreamResult.iteratorResult.value;
    }
    didFinishMergingAllStreams = true;
  } finally {
    if (!didFinishMergingAllStreams) {
      await Promise.allSettled(
        assistantResponseEventStreams.map((assistantResponseEventStream) => assistantResponseEventStream.iterator.return?.()),
      );
    }
  }
}

async function readNextAssistantResponseEventFromStream(input: {
  streamIndex: number;
  iterator: AsyncIterator<AssistantResponseEvent>;
}): Promise<AssistantResponseEventStreamResult> {
  return {
    streamIndex: input.streamIndex,
    iteratorResult: await input.iterator.next(),
  };
}
