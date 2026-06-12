import { z } from "zod";

export const CODEBASE_KNOWLEDGE_INDEX_SCHEMA_VERSION = 4;

const CodebaseEvidenceSourceRangeSchema = z
  .object({
    filePath: z.string().min(1),
    startLineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive(),
    contentHash: z.string().min(1),
  })
  .strict();

const CodebaseImportDeclarationSchema = z
  .object({
    moduleSpecifier: z.string().min(1),
    importedSymbolNames: z.array(z.string().min(1)),
    isTypeOnly: z.boolean(),
    startLineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive(),
  })
  .strict();

const CodebaseExportDeclarationSchema = z
  .object({
    exportedSymbolNames: z.array(z.string().min(1)),
    moduleSpecifier: z.string().min(1).optional(),
    startLineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive(),
  })
  .strict();

const CodebaseSymbolDeclarationPreviewSchema = z
  .object({
    declarationPreviewText: z.string().min(1),
    documentationCommentText: z.string().min(1).optional(),
  })
  .strict();

const CodebaseKnowledgeRecordBaseSchema = z.object({
  recordId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  tags: z.array(z.string()),
  evidenceRanges: z.array(CodebaseEvidenceSourceRangeSchema),
  updatedAtMs: z.number().int().nonnegative(),
});

const CodebaseFileKnowledgeRecordSchema = CodebaseKnowledgeRecordBaseSchema.extend({
  recordKind: z.literal("file"),
  filePath: z.string().min(1),
  languageId: z.string().min(1),
  importedModuleSpecifiers: z.array(z.string()),
  importDeclarations: z.array(CodebaseImportDeclarationSchema).optional(),
  exportedSymbolNames: z.array(z.string()),
  exportDeclarations: z.array(CodebaseExportDeclarationSchema).optional(),
  symbolNames: z.array(z.string()),
}).strict();

const CodebaseSymbolKnowledgeRecordSchema = CodebaseKnowledgeRecordBaseSchema.extend({
  recordKind: z.literal("symbol"),
  filePath: z.string().min(1),
  symbolName: z.string().min(1),
  symbolKind: z.enum(["function", "class", "interface", "type", "enum", "variable"]),
  startLineNumber: z.number().int().positive(),
  endLineNumber: z.number().int().positive(),
  isExported: z.boolean(),
  declarationPreview: CodebaseSymbolDeclarationPreviewSchema.optional(),
}).strict();

export const CodebaseKnowledgeRecordSchema = z.discriminatedUnion("recordKind", [
  CodebaseFileKnowledgeRecordSchema,
  CodebaseSymbolKnowledgeRecordSchema,
]);

export const CodebaseIndexedFileMetadataSchema = z
  .object({
    filePath: z.string().min(1),
    languageId: z.string().min(1),
    sourceFileSizeBytes: z.number().int().nonnegative(),
    sourceFileModifiedAtMs: z.number().nonnegative(),
    contentHash: z.string().min(1),
    indexedAtMs: z.number().int().nonnegative(),
    recordIds: z.array(z.string().min(1)),
    structureMapVersion: z.number().int().positive().optional(),
  })
  .strict();
