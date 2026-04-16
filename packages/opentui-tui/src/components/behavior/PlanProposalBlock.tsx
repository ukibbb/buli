import type { ReactNode } from "react";
import type { PlanStep, PlanStepStatus } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
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
        <box flexDirection="row">
          <text fg={chatScreenTheme.accentPrimary}>{glyphs.chevronRight}</text>
          <text>
            <b>{` Plan`}</b>
          </text>
          <box marginLeft={1}>
            <text fg={chatScreenTheme.textSecondary}>{props.planTitle}</text>
          </box>
        </box>
      }
      headerRight={
        <text fg={chatScreenTheme.textMuted}>{`${props.planSteps.length} steps`}</text>
      }
      bodyContent={
        <box flexDirection="column" paddingX={1} width="100%">
          {props.planSteps.map((planStep) => (
            <box flexDirection="column" key={`plan-step-${planStep.stepIndex}`} width="100%">
              <box flexDirection="row" width="100%">
                <box flexShrink={0} marginRight={1} width={gutterWidth}>
                  <text fg={planStepStatusColors[planStep.stepStatus]}>
                    {`${planStep.stepIndex + 1}.`.padStart(gutterWidth, " ")}
                  </text>
                </box>
                <box flexShrink={0} marginRight={1}>
                  <text fg={planStepStatusColors[planStep.stepStatus]}>
                    {planStepStatusGlyphs[planStep.stepStatus]}
                  </text>
                </box>
                <box flexShrink={1}>
                  <text
                    fg={
                      planStep.stepStatus === "completed"
                        ? chatScreenTheme.textMuted
                        : chatScreenTheme.textPrimary
                    }
                  >
                    {planStep.stepTitle}
                  </text>
                </box>
              </box>
              {planStep.stepDetail != null ? (
                <box paddingLeft={gutterWidth + 2} width="100%">
                  <text fg={chatScreenTheme.textDim}>{planStep.stepDetail}</text>
                </box>
              ) : null}
            </box>
          ))}
        </box>
      }
    />
  );
}
