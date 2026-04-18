import { expect, test } from "bun:test";
import {
  createInitialConversationTranscriptViewportState,
  jumpConversationTranscriptViewportToNewestRows,
  jumpConversationTranscriptViewportToOldestRows,
  reconcileConversationTranscriptViewportAfterMeasurement,
  scrollConversationTranscriptViewportDownByPage,
  scrollConversationTranscriptViewportDownByRows,
  scrollConversationTranscriptViewportUpByPage,
  scrollConversationTranscriptViewportUpByRows,
} from "../src/index.ts";

test("createInitialConversationTranscriptViewportState starts at the newest transcript rows", () => {
  expect(createInitialConversationTranscriptViewportState()).toEqual({
    hiddenTranscriptRowsAboveViewport: 0,
    isFollowingNewestTranscriptRows: true,
  });
});

test("reconcileConversationTranscriptViewportAfterMeasurement pins the viewport to the newest rows when following newest transcript rows", () => {
  expect(
    reconcileConversationTranscriptViewportAfterMeasurement(
      {
        hiddenTranscriptRowsAboveViewport: 0,
        isFollowingNewestTranscriptRows: true,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 100,
      },
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 90,
    isFollowingNewestTranscriptRows: true,
  });
});

test("reconcileConversationTranscriptViewportAfterMeasurement keeps the current manual position when the user is reading older transcript rows", () => {
  expect(
    reconcileConversationTranscriptViewportAfterMeasurement(
      {
        hiddenTranscriptRowsAboveViewport: 30,
        isFollowingNewestTranscriptRows: false,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 100,
      },
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 30,
    isFollowingNewestTranscriptRows: false,
  });
});

test("reconcileConversationTranscriptViewportAfterMeasurement clamps the hidden row count when transcript content shrinks", () => {
  expect(
    reconcileConversationTranscriptViewportAfterMeasurement(
      {
        hiddenTranscriptRowsAboveViewport: 95,
        isFollowingNewestTranscriptRows: false,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 50,
      },
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 40,
    isFollowingNewestTranscriptRows: true,
  });
});

test("reconcileConversationTranscriptViewportAfterMeasurement resets the hidden row count to zero when the whole transcript fits inside the viewport", () => {
  expect(
    reconcileConversationTranscriptViewportAfterMeasurement(
      {
        hiddenTranscriptRowsAboveViewport: 25,
        isFollowingNewestTranscriptRows: false,
      },
      {
        visibleViewportHeightInRows: 20,
        fullTranscriptContentHeightInRows: 12,
      },
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 0,
    isFollowingNewestTranscriptRows: true,
  });
});

test("scrollConversationTranscriptViewportUpByRows moves one row upward and stops following newest transcript rows", () => {
  expect(
    scrollConversationTranscriptViewportUpByRows(
      {
        hiddenTranscriptRowsAboveViewport: 90,
        isFollowingNewestTranscriptRows: true,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 100,
      },
      1,
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 89,
    isFollowingNewestTranscriptRows: false,
  });
});

test("scrollConversationTranscriptViewportUpByRows clamps at the oldest visible transcript rows", () => {
  expect(
    scrollConversationTranscriptViewportUpByRows(
      {
        hiddenTranscriptRowsAboveViewport: 0,
        isFollowingNewestTranscriptRows: false,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 100,
      },
      5,
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 0,
    isFollowingNewestTranscriptRows: false,
  });
});

test("scrollConversationTranscriptViewportDownByRows moves one row downward", () => {
  expect(
    scrollConversationTranscriptViewportDownByRows(
      {
        hiddenTranscriptRowsAboveViewport: 50,
        isFollowingNewestTranscriptRows: false,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 100,
      },
      1,
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 51,
    isFollowingNewestTranscriptRows: false,
  });
});

test("scrollConversationTranscriptViewportDownByRows resumes following newest transcript rows when the viewport reaches the bottom", () => {
  expect(
    scrollConversationTranscriptViewportDownByRows(
      {
        hiddenTranscriptRowsAboveViewport: 89,
        isFollowingNewestTranscriptRows: false,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 100,
      },
      5,
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 90,
    isFollowingNewestTranscriptRows: true,
  });
});

test("scrollConversationTranscriptViewportUpByPage moves upward by one visible viewport height", () => {
  expect(
    scrollConversationTranscriptViewportUpByPage(
      {
        hiddenTranscriptRowsAboveViewport: 90,
        isFollowingNewestTranscriptRows: true,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 100,
      },
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 80,
    isFollowingNewestTranscriptRows: false,
  });
});

test("scrollConversationTranscriptViewportDownByPage moves downward by one visible viewport height", () => {
  expect(
    scrollConversationTranscriptViewportDownByPage(
      {
        hiddenTranscriptRowsAboveViewport: 50,
        isFollowingNewestTranscriptRows: false,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 100,
      },
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 60,
    isFollowingNewestTranscriptRows: false,
  });
});

test("jumpConversationTranscriptViewportToOldestRows jumps to the top and stops following newest transcript rows", () => {
  expect(
    jumpConversationTranscriptViewportToOldestRows({
      hiddenTranscriptRowsAboveViewport: 90,
      isFollowingNewestTranscriptRows: true,
    }),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 0,
    isFollowingNewestTranscriptRows: false,
  });
});

test("jumpConversationTranscriptViewportToNewestRows jumps to the bottom and starts following newest transcript rows", () => {
  expect(
    jumpConversationTranscriptViewportToNewestRows({
      visibleViewportHeightInRows: 10,
      fullTranscriptContentHeightInRows: 100,
    }),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 90,
    isFollowingNewestTranscriptRows: true,
  });
});

test("reconcileConversationTranscriptViewportAfterMeasurement follows new streamed content when the viewport is already following newest transcript rows", () => {
  expect(
    reconcileConversationTranscriptViewportAfterMeasurement(
      {
        hiddenTranscriptRowsAboveViewport: 90,
        isFollowingNewestTranscriptRows: true,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 105,
      },
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 95,
    isFollowingNewestTranscriptRows: true,
  });
});

test("reconcileConversationTranscriptViewportAfterMeasurement preserves manual reading position when new streamed content arrives", () => {
  expect(
    reconcileConversationTranscriptViewportAfterMeasurement(
      {
        hiddenTranscriptRowsAboveViewport: 60,
        isFollowingNewestTranscriptRows: false,
      },
      {
        visibleViewportHeightInRows: 10,
        fullTranscriptContentHeightInRows: 105,
      },
    ),
  ).toEqual({
    hiddenTranscriptRowsAboveViewport: 60,
    isFollowingNewestTranscriptRows: false,
  });
});
