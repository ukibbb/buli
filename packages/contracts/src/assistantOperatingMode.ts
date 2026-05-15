import { z } from "zod";

export const AssistantOperatingModeSchema = z.enum(["understand", "plan", "implementation"]);
export type AssistantOperatingMode = z.infer<typeof AssistantOperatingModeSchema>;

export const DEFAULT_ASSISTANT_OPERATING_MODE: AssistantOperatingMode = "understand";
