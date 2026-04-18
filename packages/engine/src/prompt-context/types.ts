export type PromptContextCandidateKind = "file" | "directory";

export type PromptContextCandidate = {
  kind: PromptContextCandidateKind;
  displayPath: string;
  promptReferenceText: string;
};

export type ParsedPromptContextReference = {
  promptReferenceText: string;
  displayPath: string;
  startOffset: number;
  endOffset: number;
};

export type PromptDraftDisplaySegment =
  | {
      segmentKind: "plain_text";
      text: string;
    }
  | {
      segmentKind: "selected_prompt_context_reference";
      text: string;
    };

export type ActivePromptContextQuery = {
  rawQueryText: string;
  decodedQueryText: string;
  startOffset: number;
  endOffset: number;
};
