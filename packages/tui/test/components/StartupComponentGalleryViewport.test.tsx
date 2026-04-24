import { act, createRef } from "react";
import { describe, expect, test } from "bun:test";
import type { ScrollBoxRenderable } from "@opentui/core";
import { StartupComponentGalleryViewport } from "../../src/components/StartupComponentGalleryViewport.tsx";
import { testRender } from "../testRenderWithCleanup.ts";

describe("StartupComponentGalleryViewport", () => {
  test("renders representative sections from the startup gallery", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <StartupComponentGalleryViewport
        conversationMessageScrollBoxRef={createRef<ScrollBoxRenderable | null>()}
        onConversationMessageWheelScroll={() => {}}
      />,
      { width: 120, height: 32 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Startup Component Gallery");
    expect(frame).toContain("Shell And Control Surfaces");
    expect(frame).toContain("Temporary redesign surface");
    expect(frame).toContain("TopBar");
    expect(frame).toContain("InputPanel idle");
    expect(frame).toContain("implementation");
  });

  test("forwards mouse wheel direction to the parent callback", async () => {
    let scrolledDirection: "up" | "down" | undefined;
    const { mockMouse, renderOnce } = await testRender(
      <StartupComponentGalleryViewport
        conversationMessageScrollBoxRef={createRef<ScrollBoxRenderable | null>()}
        onConversationMessageWheelScroll={(direction) => {
          scrolledDirection = direction;
        }}
      />,
      { width: 120, height: 24 },
    );

    await renderOnce();
    await mockMouse.scroll(5, 5, "down");
    await renderOnce();
    expect(scrolledDirection).toBe("down");
  });

  test("renders deeper exhaustive sections when the viewport is tall enough", async () => {
    const galleryScrollBoxRef = createRef<ScrollBoxRenderable | null>();
    const { captureCharFrame, renderOnce } = await testRender(
      <StartupComponentGalleryViewport
        conversationMessageScrollBoxRef={galleryScrollBoxRef}
        onConversationMessageWheelScroll={() => {}}
      />,
      { width: 120, height: 40 },
    );

    await renderOnce();
    await act(async () => {
      const galleryScrollBox = galleryScrollBoxRef.current;
      if (!galleryScrollBox) {
        return;
      }

      galleryScrollBox.scrollTop = Math.max(
        0,
        galleryScrollBox.scrollHeight - galleryScrollBox.viewport.height - 140,
      );
    });
    await renderOnce();

    let frame = captureCharFrame();
    expect(frame).toContain("ChatScreen branch: prompt context picker open");
    expect(frame).toContain("Context");

    await act(async () => {
      const galleryScrollBox = galleryScrollBoxRef.current;
      if (!galleryScrollBox) {
        return;
      }

      galleryScrollBox.scrollTop = Math.max(
        0,
        galleryScrollBox.scrollHeight - galleryScrollBox.viewport.height - 70,
      );
    });
    await renderOnce();

    frame = captureCharFrame();
    expect(frame).toContain("Approval required");
    expect(frame).toContain("approval required · [ y ] approve · [ n ] deny");
  });
});
