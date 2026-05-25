import { addDefaultParsers, getTreeSitterClient } from "@opentui/core";
import { buliOpenTuiTreeSitterParserConfigs } from "./buliOpenTuiTreeSitterParsers.ts";

addDefaultParsers(buliOpenTuiTreeSitterParserConfigs);

export const openTuiSharedTreeSitterClient = getTreeSitterClient();
