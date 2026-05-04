import { z } from "zod";

export const AssistantOperatingModeSchema = z.enum(["implementation", "plan"]);
export type AssistantOperatingMode = z.infer<typeof AssistantOperatingModeSchema>;

export const DEFAULT_ASSISTANT_OPERATING_MODE: AssistantOperatingMode = "implementation";
