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
    const pendingInitialAssistantResponseEventStreams: ActiveAssistantResponseEventStream[] = assistantResponseEventStreams.map(
      (assistantResponseEventStream) => ({
        ...assistantResponseEventStream,
        nextEventPromise: readNextAssistantResponseEventFromStream(assistantResponseEventStream),
      }),
    );

    const assistantResponseEventStreamsWithRemainingEvents: AssistantResponseEventStream[] = [];
    while (pendingInitialAssistantResponseEventStreams.length > 0) {
      input.throwIfConversationTurnInterrupted();
      const initialAssistantResponseEventStreamResult = await Promise.race(
        pendingInitialAssistantResponseEventStreams.map((activeAssistantResponseEventStream) =>
          activeAssistantResponseEventStream.nextEventPromise
        ),
      );

      const initialStreamIndex = pendingInitialAssistantResponseEventStreams.findIndex((activeAssistantResponseEventStream) =>
        activeAssistantResponseEventStream.streamIndex === initialAssistantResponseEventStreamResult.streamIndex
      );
      if (initialStreamIndex === -1) {
        throw new Error(`Received an initial event from inactive assistant response stream ${initialAssistantResponseEventStreamResult.streamIndex}.`);
      }

      const initialAssistantResponseEventStream = pendingInitialAssistantResponseEventStreams[initialStreamIndex];
      if (!initialAssistantResponseEventStream) {
        throw new Error(`Missing initial assistant response stream at index ${initialStreamIndex}.`);
      }

      pendingInitialAssistantResponseEventStreams.splice(initialStreamIndex, 1);
      if (initialAssistantResponseEventStreamResult.iteratorResult.done) {
        continue;
      }

      assistantResponseEventStreamsWithRemainingEvents.push(initialAssistantResponseEventStream);
      yield initialAssistantResponseEventStreamResult.iteratorResult.value;
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
