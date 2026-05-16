export function escapeModelFacingXmlAttributeValue(rawAttributeValue: string): string {
  return escapeModelFacingXmlText(rawAttributeValue)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function escapeModelFacingXmlText(rawText: string): string {
  return rawText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
