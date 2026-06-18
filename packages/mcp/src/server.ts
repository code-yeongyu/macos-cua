#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { type ComputerInterface, MacOSHostComputer } from "@macos-cua/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCodeModeRunner } from "./code-mode-runner.js";
import { registerDiscreteTools } from "./discrete-tools.js";
import { registerRunTool } from "./run-code.js";
import { registerScreenshotTool } from "./screenshot.js";
import { SERVER_INFO } from "./server-info.js";
import { TOOL_NAMES as BASE_TOOL_NAMES } from "./tool-names.js";

export const TOOL_NAMES = [...BASE_TOOL_NAMES, "zoom"] as const;

export interface McpServerOptions {
	readonly codeMode?: boolean;
}

export function createMcpServer(computer?: ComputerInterface, options: McpServerOptions = {}): McpServer {
	const activeComputer = computer ?? createComputer(options.codeMode === true);
	const server = new McpServer(SERVER_INFO);
	registerScreenshotTool(server, activeComputer);

	if (options.codeMode === true) {
		const runner = createCodeModeRunner(activeComputer);
		registerRunTool(server, async () => runner);
		return server;
	}

	registerDiscreteTools(server, activeComputer);
	return server;
}

export async function main(): Promise<void> {
	const codeMode = process.argv.includes("--code-mode") || process.env["MACOS_CUA_CODE_MODE"] === "1";
	if (codeMode) {
		const { ensureNodeSnapshotFlag } = await import("@macos-cua/core");
		ensureNodeSnapshotFlag();
	}
	const server = createMcpServer(createComputer(codeMode), { codeMode });
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

function createComputer(codeMode: boolean): ComputerInterface {
	if (!codeMode) {
		return new MacOSHostComputer();
	}
	return new MacOSHostComputer({
		overlay: {
			set(): void {},
			highlight(): void {},
			hide(): void {},
			close(): void {},
		},
	});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`Fatal error: ${formatFatalError(error)}\n`);
		process.exit(1);
	});
}

export function formatFatalError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
