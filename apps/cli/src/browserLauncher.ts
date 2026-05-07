import open from "open";

export type BrowserUrlLauncher = (url: string) => Promise<void>;

export async function openBrowserUrl(url: string): Promise<void> {
  await open(url);
}
