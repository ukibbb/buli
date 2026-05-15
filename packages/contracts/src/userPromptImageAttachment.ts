import { z } from "zod";

export const UserPromptImageAttachmentMimeTypeSchema = z.enum([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const UserPromptImageAttachmentSchema = z
  .object({
    attachmentId: z.string().min(1),
    mimeType: UserPromptImageAttachmentMimeTypeSchema,
    dataUrl: z.string().min(1),
    fileName: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((attachment, context) => {
    const expectedPrefix = `data:${attachment.mimeType};base64,`;
    if (!attachment.dataUrl.startsWith(expectedPrefix)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataUrl"],
        message: `Expected data URL to start with ${expectedPrefix}`,
      });
      return;
    }

    if (attachment.dataUrl.slice(expectedPrefix.length).trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataUrl"],
        message: "Image attachment data URL must include non-empty base64 data",
      });
    }
  });

export type UserPromptImageAttachmentMimeType = z.infer<typeof UserPromptImageAttachmentMimeTypeSchema>;
export type UserPromptImageAttachment = z.infer<typeof UserPromptImageAttachmentSchema>;
