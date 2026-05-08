import { describe, expect, test } from "bun:test";
import { CalloutSeveritySchema, ChecklistItemSchema } from "../src/index.ts";

describe("presentation primitive contracts", () => {
  test("CalloutSeveritySchema parses supported severities", () => {
    expect(CalloutSeveritySchema.parse("info")).toBe("info");
    expect(CalloutSeveritySchema.parse("success")).toBe("success");
    expect(CalloutSeveritySchema.parse("warning")).toBe("warning");
    expect(CalloutSeveritySchema.parse("error")).toBe("error");
  });

  test("ChecklistItemSchema parses checklist item state", () => {
    expect(ChecklistItemSchema.parse({ itemTitle: "ship it", itemStatus: "completed" })).toEqual({
      itemTitle: "ship it",
      itemStatus: "completed",
    });
  });
});
