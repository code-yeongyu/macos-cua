import type { ComputerInterface, ScreenshotOptions } from "@macos-cua/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import type { CodeModeRunner } from "./run-code.js";
import { registerRunTool } from "./run-code.js";
import { registerScreenshotTool } from "./screenshot.js";
import { createMcpServer } from "./server.js";

const fakeComputer: ComputerInterface = {
	capabilities: {
		supportsScreenshot: true,
		supportsInput: true,
		supportsAccessibility: true,
		supportsClipboard: true,
	},
	async screenshot() {
		return { data: Buffer.from("png-bytes"), mimeType: "image/png" as const, width: 20, height: 10 };
	},
	setTarget() {},
	async move() {},
	async click() {},
	async rightClick() {},
	async middleClick() {},
	async doubleClick() {},
	async type() {},
	async key() {},
	async scroll() {},
	async drag() {},
	async getCursorPosition() {
		return { x: 0, y: 0 };
	},
	async getScreenSize() {
		return { width: 20, height: 10 };
	},
	async getAppState() {
		throw new Error("getAppState should not be called in this test");
	},
	async getScreenshotViewport() {
		return undefined;
	},
	async listApps() {
		return [];
	},
	async setValue() {},
	async selectText() {},
	async performAction() {},
	async pressAtPosition() {
		return false;
	},
	async typeIntoFocused() {
		return false;
	},
	async close() {},
};

class InMemoryTransport implements Transport {
	peer: InMemoryTransport | null = null;
	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: <T extends JSONRPCMessage>(message: T) => void;

	async start(): Promise<void> {}

	async send(message: JSONRPCMessage): Promise<void> {
		const peer = this.peer;
		if (peer === null) {
			throw new Error("Transport peer is not connected");
		}
		queueMicrotask(() => peer.onmessage?.(message));
	}

	async close(): Promise<void> {
		this.onclose?.();
	}
}

async function withClient<T>(server: McpServer, action: (client: Client) => Promise<T>): Promise<T> {
	const client = new Client({ name: "macos-cua-code-mode-test", version: "0.1.0" });
	const clientTransport = new InMemoryTransport();
	const serverTransport = new InMemoryTransport();
	clientTransport.peer = serverTransport;
	serverTransport.peer = clientTransport;
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	try {
		return await action(client);
	} finally {
		await Promise.all([client.close(), server.close()]);
	}
}

describe("MCP code mode #given createMcpServer options #when listing tools #then only run and screenshot are exposed", () => {
	it("#given codeMode true #when listTools runs #then discrete tools are replaced", async () => {
		const result = await withClient(createMcpServer(fakeComputer, { codeMode: true }), (client) =>
			client.listTools(),
		);

		expect(result.tools.map((tool) => tool.name).sort()).toEqual(["run", "screenshot"]);
	});
});

describe("MCP screenshot tool #given screenshot arguments #when called #then it returns image content", () => {
	it("#given a region #when screenshot runs #then the region is forwarded to the computer", async () => {
		const calls: (ScreenshotOptions | undefined)[] = [];
		const server = new McpServer({ name: "test", version: "0.1.0" });
		registerScreenshotTool(server, {
			...fakeComputer,
			async screenshot(options) {
				calls.push(options);
				return { data: Buffer.from("crop"), mimeType: "image/png" as const, width: 4, height: 3 };
			},
		});

		const result = await withClient(server, (client) =>
			client.callTool({
				name: "screenshot",
				arguments: { region: { x: 1, y: 2, width: 3, height: 4 } },
			}),
		);

		expect(calls).toEqual([{ region: { x: 1, y: 2, width: 3, height: 4 } }]);
		expect(result.content).toEqual([
			{ type: "image", data: Buffer.from("crop").toString("base64"), mimeType: "image/png" },
		]);
	});
});

describe("MCP run tool #given code mode result #when called #then image blocks precede text", () => {
	it("#given surfaced images #when run maps content #then order is preserved", async () => {
		const runner: CodeModeRunner = {
			async run() {
				return {
					images: [
						{ data: Buffer.from("first"), mimeType: "image/png" },
						{ data: Buffer.from("second"), mimeType: "image/jpeg" },
					],
					text: "done",
				};
			},
		};
		const server = new McpServer({ name: "test", version: "0.1.0" });
		registerRunTool(server, async () => runner);

		const result = await withClient(server, (client) =>
			client.callTool({ name: "run", arguments: { code: "return 1" } }),
		);

		expect(result.content).toEqual([
			{ type: "image", data: Buffer.from("first").toString("base64"), mimeType: "image/png" },
			{ type: "image", data: Buffer.from("second").toString("base64"), mimeType: "image/jpeg" },
			{ type: "text", text: "done" },
		]);
	});

	it("#given a CodeModeError-like failure #when run maps content #then the code is surfaced", async () => {
		const error = new Error("bad code");
		error.name = "CodeModeError";
		Object.defineProperty(error, "code", { value: "COMPILE_ERROR" });
		Object.defineProperty(error, "recoveryHint", { value: "Fix the code and retry." });
		const server = new McpServer({ name: "test", version: "0.1.0" });
		registerRunTool(server, async () => ({
			async run() {
				throw error;
			},
		}));

		const result = await withClient(server, (client) => client.callTool({ name: "run", arguments: { code: "!" } }));

		expect(result.content).toHaveLength(1);
		const content = result.content[0];
		expect(content?.type).toBe("text");
		expect(JSON.parse(content?.type === "text" ? content.text : "")).toEqual({
			ok: false,
			code: "COMPILE_ERROR",
			message: "bad code",
			recoveryHint: "Fix the code and retry.",
		});
	});
});
