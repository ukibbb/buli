import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { PlanStep, PlanStepStatus } from "@buli/contracts";
import { chatScreenTheme } from "../../chatScreenTheme.ts";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";

// PlanProposalBlock renders a proposed plan with per-step lifecycle status.
// The header carries the plan title, the body is a numbered list keyed by
// stepIndex so updates mutate in place as steps progress from pending →
// in_progress → completed.
export type PlanProposalBlockProps = {
  planTitle: string;
  planSteps: PlanStep[];
};

const planStepStatusGlyphs: Record<PlanStepStatus, string> = {
  pending: "·",
  in_progress: "▸",
  completed: glyphs.checkMark,
};

const planStepStatusColors: Record<PlanStepStatus, string> = {
  pending: chatScreenTheme.textDim,
  in_progress: chatScreenTheme.accentAmber,
  completed: chatScreenTheme.accentGreen,
};

export function PlanProposalBlock(props: PlanProposalBlockProps): ReactNode {
  const highestStepNumber = props.planSteps.length;
  const gutterWidth = String(highestStepNumber).length + 1;
  return (
    <SurfaceCard
      stripeColor={chatScreenTheme.accentPrimary}
      headerLeft={
        <Box>
          <Text color={chatScreenTheme.accentPrimary}>{glyphs.chevronRight}</Text>
          <Text bold color={chatScreenTheme.textPrimary}>
            {` Plan`}
          </Text>
          <Box marginLeft={1}>
            <Text color={chatScreenTheme.textSecondary}>{props.planTitle}</Text>
          </Box>
        </Box>
      }
      headerRight={
        <Text color={chatScreenTheme.textMuted}>{`${props.planSteps.length} steps`}</Text>
      }
      bodyContent={
        <Box flexDirection="column" paddingX={1} width="100%">
          {props.planSteps.map((planStep) => (
            <Box flexDirection="column" key={`plan-step-${planStep.stepIndex}`} width="100%">
              <Box width="100%">
                <Box flexShrink={0} marginRight={1} width={gutterWidth}>
                  <Text color={planStepStatusColors[planStep.stepStatus]}>
                    {`${planStep.stepIndex + 1}.`.padStart(gutterWidth, " ")}
                  </Text>
                </Box>
                <Box flexShrink={0} marginRight={1}>
                  <Text color={planStepStatusColors[planStep.stepStatus]}>
                    {planStepStatusGlyphs[planStep.stepStatus]}
                  </Text>
                </Box>
                <Box flexShrink={1}>
                  <Text
                    color={
                      planStep.stepStatus === "completed"
                        ? chatScreenTheme.textMuted
                        : chatScreenTheme.textPrimary
                    }
                    strikethrough={planStep.stepStatus === "completed"}
                  >
                    {planStep.stepTitle}
                  </Text>
                </Box>
              </Box>
              {planStep.stepDetail ? (
                <Box paddingLeft={gutterWidth + 2} width="100%">
                  <Text color={chatScreenTheme.textDim}>{planStep.stepDetail}</Text>
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
      }
    />
  );
}
