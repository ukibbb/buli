import { expect, test } from "bun:test";
import { createUserPromptImageAttachmentFromPngBytes } from "../src/clipboard/readNativeClipboardImageAttachment.ts";

test("createUserPromptImageAttachmentFromPngBytes creates a PNG data URL attachment", () => {
  const attachment = createUserPromptImageAttachmentFromPngBytes({
    pngBytes: Buffer.from("hello", "utf8"),
    fileName: "clipboard.png",
  });

  expect(attachment).toMatchObject({
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,aGVsbG8=",
    fileName: "clipboard.png",
  });
  expect(attachment?.attachmentId.startsWith("clipboard-image-")).toBe(true);
});

test("createUserPromptImageAttachmentFromPngBytes ignores empty image bytes", () => {
  expect(createUserPromptImageAttachmentFromPngBytes({ pngBytes: Buffer.alloc(0) })).toBeUndefined();
});
