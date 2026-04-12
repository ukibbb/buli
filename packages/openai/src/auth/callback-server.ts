import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AddressInfo } from "node:net";
import { OPENAI_OAUTH_PORT, OPENAI_REDIRECT_PATH, OAUTH_TIMEOUT_MS } from "./constants.ts";

const SUCCESS_HTML = `<!doctype html>
<html>
  <head>
    <title>buli Authorization Successful</title>
  </head>
  <body>
    <h1>Authorization Successful</h1>
    <p>You can close this window and return to buli.</p>
    <script>
      setTimeout(() => window.close(), 2000)
    </script>
  </body>
</html>`;

function errorHtml(error: string): string {
  return `<!doctype html>
<html>
  <head>
    <title>buli Authorization Failed</title>
  </head>
  <body>
    <h1>Authorization Failed</h1>
    <p>${error}</p>
  </body>
</html>`;
}

type PendingCallback = {
  state: string;
  resolve: (result: { code: string }) => void;
  reject: (error: Error) => void;
  timeout: Timer;
};

function hasCode(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export class OpenAiCallbackServer {
  readonly host: string;
  readonly port: number;
  server: Server | undefined;
  pending: PendingCallback | undefined;

  constructor(input: { host?: string; port?: number } = {}) {
    // OpenAI's browser login flow is more reliable with the localhost callback
    // shape used by Codex and OpenCode than with an equivalent 127.0.0.1 URL.
    this.host = input.host ?? "localhost";
    this.port = input.port ?? OPENAI_OAUTH_PORT;
  }

  async start(): Promise<{ port: number; redirectUri: string }> {
    if (this.server) {
      return {
        port: this.address().port,
        redirectUri: this.redirectUri(),
      };
    }

    const server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.port, this.host, () => {
        server.off("error", reject);
        resolve();
      });
    });

    this.server = server;

    return {
      port: this.address().port,
      redirectUri: this.redirectUri(),
    };
  }

  waitForCode(state: string, timeoutMs = OAUTH_TIMEOUT_MS): Promise<{ code: string }> {
    if (!this.server) {
      throw new Error("OAuth callback server must be started before waiting for a code");
    }

    if (this.pending) {
      throw new Error("OAuth callback server is already waiting for a code");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = undefined;
        reject(new Error("OAuth callback timeout - authorization took too long"));
      }, timeoutMs);

      this.pending = {
        state,
        timeout,
        resolve,
        reject,
      };
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;

    if (this.pending) {
      clearTimeout(this.pending.timeout);
      this.pending.reject(new Error("OAuth callback server stopped"));
      this.pending = undefined;
    }

    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private address(): AddressInfo {
    const address = this.server?.address();
    if (!address || typeof address === "string") {
      throw new Error("OAuth callback server address is unavailable");
    }

    return address;
  }

  private redirectUri(): string {
    return `http://${this.host}:${this.address().port}${OPENAI_REDIRECT_PATH}`;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${this.host}`);

    if (url.pathname === OPENAI_REDIRECT_PATH) {
      this.handleCallback(url, response);
      return;
    }

    if (url.pathname === "/cancel") {
      this.rejectPending(new Error("Login cancelled"));
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Login cancelled");
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }

  private handleCallback(url: URL, response: ServerResponse): void {
    const error = url.searchParams.get("error");
    if (error) {
      const message = url.searchParams.get("error_description") ?? error;
      this.rejectPending(new Error(message));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(errorHtml(message));
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      const message = "Missing authorization code";
      this.rejectPending(new Error(message));
      response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      response.end(errorHtml(message));
      return;
    }

    const state = url.searchParams.get("state");
    if (!this.pending || state !== this.pending.state) {
      const message = "Invalid state - potential CSRF attack";
      this.rejectPending(new Error(message));
      response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      response.end(errorHtml(message));
      return;
    }

    const pending = this.pending;
    clearTimeout(pending.timeout);
    this.pending = undefined;
    pending.resolve({ code });

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(SUCCESS_HTML);
  }

  private rejectPending(error: Error): void {
    if (!this.pending) {
      return;
    }

    const pending = this.pending;
    clearTimeout(pending.timeout);
    this.pending = undefined;
    pending.reject(error);
  }
}

export function isMissingFile(error: unknown): boolean {
  return hasCode(error) && error.code === "ENOENT";
}
