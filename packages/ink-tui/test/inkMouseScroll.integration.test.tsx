import { PassThrough, Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { expect, test } from "bun:test";
import { render, Text, useMouseScroll } from "ink";
import React, { useState } from "react";

const MOUSE_SCROLL_DOWN_SEQUENCE = "\u001B[<65;5;3M";

class MockTerminalInputStream extends PassThrough {
  public isTTY = true;

  public setRawMode(_isRawModeEnabled: boolean): void {}

  public ref(): this {
    return this;
  }

  public unref(): this {
    return this;
  }
}

class MockTerminalOutputStream extends Writable {
  public readonly columns: number;
  public readonly rows: number;
  public readonly isTTY = true;
  private pendingRenderedChunkTexts: string[] = [];

  public constructor(input: { columns: number; rows: number }) {
    super();
    this.columns = input.columns;
    this.rows = input.rows;
  }

  public override _write(
    chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.pendingRenderedChunkTexts.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    callback();
  }

  public drainRenderedOutput(): string {
    const renderedOutput = stripVTControlCharacters(this.pendingRenderedChunkTexts.join(""));
    this.pendingRenderedChunkTexts = [];
    return renderedOutput;
  }
}

function MouseScrollProbe() {
  const [lastMouseScrollText, setLastMouseScrollText] = useState("waiting");

  useMouseScroll((mouseScrollEvent) => {
    setLastMouseScrollText(`${mouseScrollEvent.direction}@${mouseScrollEvent.x},${mouseScrollEvent.y}`);
  });

  return <Text>{lastMouseScrollText}</Text>;
}

test("local ink useMouseScroll updates state from raw terminal wheel sequences", async () => {
  const mockTerminalInputStream = new MockTerminalInputStream();
  const mockTerminalOutputStream = new MockTerminalOutputStream({ columns: 80, rows: 24 });
  const renderedProbe = render(<MouseScrollProbe />, {
    stdin: mockTerminalInputStream as unknown as NodeJS.ReadStream,
    stdout: mockTerminalOutputStream as unknown as NodeJS.WriteStream,
    stderr: mockTerminalOutputStream as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    interactive: true,
  });

  try {
    await renderedProbe.waitUntilRenderFlush();
    mockTerminalOutputStream.drainRenderedOutput();

    mockTerminalInputStream.write(MOUSE_SCROLL_DOWN_SEQUENCE);
    await renderedProbe.waitUntilRenderFlush();

    expect(mockTerminalOutputStream.drainRenderedOutput()).toContain("down@4,2");
  } finally {
    renderedProbe.unmount();
    await renderedProbe.waitUntilExit();
  }
});
