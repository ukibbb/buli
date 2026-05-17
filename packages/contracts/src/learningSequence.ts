import { z } from "zod";

const LearningSequenceTextSchema = z.string().trim().min(1);

export const LearningSequenceItemSchema = z
  .object({
    labelText: LearningSequenceTextSchema,
    detailText: LearningSequenceTextSchema.optional(),
  })
  .strict();

export const LearningSequenceSchema = z
  .object({
    titleText: LearningSequenceTextSchema,
    summaryText: LearningSequenceTextSchema.optional(),
    sequenceItems: z.array(LearningSequenceItemSchema).min(1),
  })
  .strict();

export type LearningSequenceItem = z.infer<typeof LearningSequenceItemSchema>;
export type LearningSequence = z.infer<typeof LearningSequenceSchema>;

export function formatLearningSequenceAsMarkdownText(learningSequence: LearningSequence): string {
  const sequenceLine = learningSequence.sequenceItems.map((sequenceItem) => sequenceItem.labelText).join(" -> ");
  const detailLines = learningSequence.sequenceItems.flatMap((sequenceItem) =>
    sequenceItem.detailText ? [`- ${sequenceItem.labelText}: ${sequenceItem.detailText}`] : []
  );
  return [
    `**${learningSequence.titleText}**`,
    ...(learningSequence.summaryText !== undefined ? [learningSequence.summaryText] : []),
    sequenceLine,
    ...(detailLines.length > 0 ? ["", ...detailLines] : []),
  ].join("\n");
}
