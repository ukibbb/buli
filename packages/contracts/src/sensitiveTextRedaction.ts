export type SensitiveTextRedactionOptions = {
  maxLength?: number | undefined;
  redactionText?: string | undefined;
};

export const DEFAULT_SENSITIVE_TEXT_REDACTION = "[REDACTED]";
export const DEFAULT_REDACTED_SENSITIVE_TEXT_MAX_LENGTH = 500;

const privateKeyBlockPattern = /-----BEGIN (?:[A-Z0-9 ]* )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]* )?PRIVATE KEY-----/g;
const pgpPrivateKeyBlockPattern = /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g;
const authorizationHeaderPattern = /\b((?:proxy-)?authorization\s*:\s*)(?:bearer|basic)\s+[^\s,;]+/gi;
const bearerTokenPattern = /\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/g;
const basicTokenPattern = /\b(Basic\s+)[A-Za-z0-9._~+\/-]+=*/g;
const cookieHeaderPattern = /\b((?:set-cookie|cookie)\s*:\s*)[^\r\n]+/gi;
const databaseUrlCredentialsPattern = /\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/)[^:@\s/]+:[^@\s/]+@/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const providerTokenPattern = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g;

const sensitiveFieldNamePattern = [
  "access[_-]?token",
  "refresh[_-]?token",
  "api[_-]?key",
  "auth[_-]?token",
  "authorization",
  "client[_-]?secret",
  "private[_-]?key",
  "session[_-]?token",
  "secret(?:[_-]?key)?",
  "password",
  "passwd",
  "pwd",
  "token",
].join("|");

const quotedSensitiveFieldValuePattern = new RegExp(
  `((?:["']?\\b(?:${sensitiveFieldNamePattern})\\b["']?\\s*[:=]\\s*)["'])([^"']+)(["'])`,
  "gi",
);
const unquotedSensitiveFieldValuePattern = new RegExp(
  `(["']?\\b(?:${sensitiveFieldNamePattern})\\b["']?\\s*[:=]\\s*)([^\\s"'&,;}{]+)`,
  "gi",
);

export function redactSensitiveText(inputText: string, options: SensitiveTextRedactionOptions = {}): string {
  const redactionText = options.redactionText ?? DEFAULT_SENSITIVE_TEXT_REDACTION;
  const maxLength = normalizeMaxRedactedSensitiveTextLength(options.maxLength);
  const redactedText = inputText
    .replace(privateKeyBlockPattern, redactionText)
    .replace(pgpPrivateKeyBlockPattern, redactionText)
    .replace(authorizationHeaderPattern, `$1${redactionText}`)
    .replace(cookieHeaderPattern, `$1${redactionText}`)
    .replace(databaseUrlCredentialsPattern, `$1${redactionText}@`)
    .replace(jwtPattern, redactionText)
    .replace(providerTokenPattern, redactionText)
    .replace(bearerTokenPattern, `$1${redactionText}`)
    .replace(basicTokenPattern, `$1${redactionText}`)
    .replace(quotedSensitiveFieldValuePattern, `$1${redactionText}$3`)
    .replace(unquotedSensitiveFieldValuePattern, `$1${redactionText}`);

  if (redactedText.length <= maxLength) {
    return redactedText;
  }

  const omittedCharacterCount = redactedText.length - maxLength;
  return `${redactedText.slice(0, maxLength)}... (${omittedCharacterCount} chars omitted)`;
}

function normalizeMaxRedactedSensitiveTextLength(maxLength: number | undefined): number {
  if (maxLength === undefined || !Number.isFinite(maxLength)) {
    return DEFAULT_REDACTED_SENSITIVE_TEXT_MAX_LENGTH;
  }

  return Math.max(0, Math.floor(maxLength));
}
