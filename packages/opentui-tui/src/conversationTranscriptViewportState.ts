export type ConversationTranscriptViewportState = {
  hiddenTranscriptRowsAboveViewport: number;
  isFollowingNewestTranscriptRows: boolean;
};

export type ConversationTranscriptViewportMeasurements = {
  visibleViewportHeightInRows: number;
  fullTranscriptContentHeightInRows: number;
};

function calculateMaximumHiddenTranscriptRowsAboveViewport(
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
): number {
  return Math.max(
    conversationTranscriptViewportMeasurements.fullTranscriptContentHeightInRows -
      conversationTranscriptViewportMeasurements.visibleViewportHeightInRows,
    0,
  );
}

function clampHiddenTranscriptRowsAboveViewport(
  hiddenTranscriptRowsAboveViewport: number,
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
): number {
  return Math.min(
    Math.max(hiddenTranscriptRowsAboveViewport, 0),
    calculateMaximumHiddenTranscriptRowsAboveViewport(conversationTranscriptViewportMeasurements),
  );
}

function createViewportStateAtNewestTranscriptRows(
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
): ConversationTranscriptViewportState {
  return {
    hiddenTranscriptRowsAboveViewport: calculateMaximumHiddenTranscriptRowsAboveViewport(
      conversationTranscriptViewportMeasurements,
    ),
    isFollowingNewestTranscriptRows: true,
  };
}

export function createInitialConversationTranscriptViewportState(): ConversationTranscriptViewportState {
  return {
    hiddenTranscriptRowsAboveViewport: 0,
    isFollowingNewestTranscriptRows: true,
  };
}

export function reconcileConversationTranscriptViewportAfterMeasurement(
  conversationTranscriptViewportState: ConversationTranscriptViewportState,
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
): ConversationTranscriptViewportState {
  const maximumHiddenTranscriptRowsAboveViewport = calculateMaximumHiddenTranscriptRowsAboveViewport(
    conversationTranscriptViewportMeasurements,
  );

  if (maximumHiddenTranscriptRowsAboveViewport === 0) {
    return {
      hiddenTranscriptRowsAboveViewport: 0,
      isFollowingNewestTranscriptRows: true,
    };
  }

  if (conversationTranscriptViewportState.isFollowingNewestTranscriptRows) {
    return createViewportStateAtNewestTranscriptRows(conversationTranscriptViewportMeasurements);
  }

  const clampedHiddenTranscriptRowsAboveViewport = clampHiddenTranscriptRowsAboveViewport(
    conversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport,
    conversationTranscriptViewportMeasurements,
  );

  if (clampedHiddenTranscriptRowsAboveViewport === maximumHiddenTranscriptRowsAboveViewport) {
    return {
      hiddenTranscriptRowsAboveViewport: clampedHiddenTranscriptRowsAboveViewport,
      isFollowingNewestTranscriptRows: true,
    };
  }

  return {
    hiddenTranscriptRowsAboveViewport: clampedHiddenTranscriptRowsAboveViewport,
    isFollowingNewestTranscriptRows: false,
  };
}

export function scrollConversationTranscriptViewportUpByRows(
  conversationTranscriptViewportState: ConversationTranscriptViewportState,
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
  rowsToScroll: number,
): ConversationTranscriptViewportState {
  return {
    hiddenTranscriptRowsAboveViewport: clampHiddenTranscriptRowsAboveViewport(
      conversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport - rowsToScroll,
      conversationTranscriptViewportMeasurements,
    ),
    isFollowingNewestTranscriptRows: false,
  };
}

export function scrollConversationTranscriptViewportDownByRows(
  conversationTranscriptViewportState: ConversationTranscriptViewportState,
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
  rowsToScroll: number,
): ConversationTranscriptViewportState {
  const hiddenTranscriptRowsAboveViewport = clampHiddenTranscriptRowsAboveViewport(
    conversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport + rowsToScroll,
    conversationTranscriptViewportMeasurements,
  );
  const maximumHiddenTranscriptRowsAboveViewport = calculateMaximumHiddenTranscriptRowsAboveViewport(
    conversationTranscriptViewportMeasurements,
  );

  return {
    hiddenTranscriptRowsAboveViewport,
    isFollowingNewestTranscriptRows: hiddenTranscriptRowsAboveViewport === maximumHiddenTranscriptRowsAboveViewport,
  };
}

export function scrollConversationTranscriptViewportUpByPage(
  conversationTranscriptViewportState: ConversationTranscriptViewportState,
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
): ConversationTranscriptViewportState {
  return scrollConversationTranscriptViewportUpByRows(
    conversationTranscriptViewportState,
    conversationTranscriptViewportMeasurements,
    conversationTranscriptViewportMeasurements.visibleViewportHeightInRows,
  );
}

export function scrollConversationTranscriptViewportDownByPage(
  conversationTranscriptViewportState: ConversationTranscriptViewportState,
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
): ConversationTranscriptViewportState {
  return scrollConversationTranscriptViewportDownByRows(
    conversationTranscriptViewportState,
    conversationTranscriptViewportMeasurements,
    conversationTranscriptViewportMeasurements.visibleViewportHeightInRows,
  );
}

export function jumpConversationTranscriptViewportToOldestRows(
  conversationTranscriptViewportState: ConversationTranscriptViewportState,
): ConversationTranscriptViewportState {
  return {
    ...conversationTranscriptViewportState,
    hiddenTranscriptRowsAboveViewport: 0,
    isFollowingNewestTranscriptRows: false,
  };
}

export function jumpConversationTranscriptViewportToNewestRows(
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
): ConversationTranscriptViewportState {
  return createViewportStateAtNewestTranscriptRows(conversationTranscriptViewportMeasurements);
}

export function reconcileConversationTranscriptViewportAfterObservedScrollPosition(
  conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
  hiddenTranscriptRowsAboveViewport: number,
): ConversationTranscriptViewportState {
  const clampedHiddenTranscriptRowsAboveViewport = clampHiddenTranscriptRowsAboveViewport(
    hiddenTranscriptRowsAboveViewport,
    conversationTranscriptViewportMeasurements,
  );
  const maximumHiddenTranscriptRowsAboveViewport = calculateMaximumHiddenTranscriptRowsAboveViewport(
    conversationTranscriptViewportMeasurements,
  );

  return {
    hiddenTranscriptRowsAboveViewport: clampedHiddenTranscriptRowsAboveViewport,
    isFollowingNewestTranscriptRows:
      clampedHiddenTranscriptRowsAboveViewport === maximumHiddenTranscriptRowsAboveViewport,
  };
}
