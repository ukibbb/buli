import type { ChatScreenTheme } from "@buli/assistant-design-tokens";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import type { ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import type { ConversationTurnStatus } from "@buli/contracts";
import type { CliRenderer } from "@opentui/core";
import { createReactSlotRegistry, createSlot, useRenderer } from "@opentui/react";
import { createContext, createElement, useContext, useEffect, useMemo, type ReactNode } from "react";

export type ChatScreenTopBarRightSlotProps = {
  workingDirectoryPath: string;
};

export type ChatScreenPromptRightSlotProps = {
  selectedModelId: string;
  isPromptInputDisabled: boolean;
};

export type ChatScreenLiveStatusExtraSlotProps = {
  conversationTurnStatus: ConversationTurnStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  queuedPromptCount: number;
};

export type ChatScreenAppOverlaySlotProps = Record<never, never>;

export type ChatScreenSlotMap = {
  top_bar_right: ChatScreenTopBarRightSlotProps;
  prompt_right: ChatScreenPromptRightSlotProps;
  live_status_extra: ChatScreenLiveStatusExtraSlotProps;
  app_overlay: ChatScreenAppOverlaySlotProps;
};

export type ChatScreenSlotContext = {
  theme: ChatScreenTheme;
};

export type ChatScreenSlotPlugin = {
  id: string;
  order?: number;
  setup?: (context: ChatScreenSlotContext, renderer: CliRenderer) => void;
  dispose?: () => void;
  slots: {
    [SlotName in keyof ChatScreenSlotMap]?: (
      context: ChatScreenSlotContext,
      props: ChatScreenSlotMap[SlotName],
    ) => ReactNode;
  };
};

export type ChatScreenSlotMode = "append" | "replace" | "single_winner";

export type ChatScreenSlotProps<SlotName extends keyof ChatScreenSlotMap> = {
  name: SlotName;
  mode?: ChatScreenSlotMode;
  children?: ReactNode;
} & ChatScreenSlotMap[SlotName];

const chatScreenSlotContextValue = {
  theme: chatScreenTheme,
} satisfies ChatScreenSlotContext;

type ChatScreenSlotRegistry = ReturnType<typeof createReactSlotRegistry<ChatScreenSlotMap, ChatScreenSlotContext>>;
type BoundChatScreenSlot = ReturnType<typeof createSlot<ChatScreenSlotMap, ChatScreenSlotContext>>;

type ChatScreenSlotRuntime = {
  registry: ChatScreenSlotRegistry;
  Slot: BoundChatScreenSlot;
};

const chatScreenSlotRuntimeContext = createContext<ChatScreenSlotRuntime | undefined>(undefined);
const emptyChatScreenSlotPlugins = [] as const satisfies readonly ChatScreenSlotPlugin[];

export function ChatScreenSlotsProvider(props: {
  plugins?: readonly ChatScreenSlotPlugin[] | undefined;
  children: ReactNode;
}): ReactNode {
  const renderer = useRenderer();
  const registry = useMemo(() =>
    createReactSlotRegistry<ChatScreenSlotMap, ChatScreenSlotContext>(
      renderer,
      chatScreenSlotContextValue,
      {
        onPluginError(event) {
          console.error("[buli.tui.slot] plugin error", {
            phase: event.phase,
            plugin: event.pluginId,
            slot: event.slot,
            source: event.source,
            message: event.error.message,
          });
        },
      },
    ), [renderer]);
  const Slot = useMemo(() => createSlot<ChatScreenSlotMap, ChatScreenSlotContext>(registry), [registry]);
  const plugins = props.plugins ?? emptyChatScreenSlotPlugins;

  useEffect(() => {
    const unregisterSlotPlugins = plugins.map((chatScreenSlotPlugin) => registry.register(chatScreenSlotPlugin));
    return () => {
      unregisterSlotPlugins.toReversed().forEach((unregisterSlotPlugin) => unregisterSlotPlugin());
    };
  }, [plugins, registry]);

  return (
    <chatScreenSlotRuntimeContext.Provider value={{ registry, Slot }}>
      {props.children}
    </chatScreenSlotRuntimeContext.Provider>
  );
}

export function ChatScreenSlot<SlotName extends keyof ChatScreenSlotMap>(
  props: ChatScreenSlotProps<SlotName>,
): ReactNode {
  const slotRuntime = useContext(chatScreenSlotRuntimeContext);
  if (!slotRuntime) {
    return props.children ?? null;
  }

  const Slot = slotRuntime.Slot;
  return createElement(Slot, props as Parameters<BoundChatScreenSlot>[0]);
}
