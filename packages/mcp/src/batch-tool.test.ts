import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "./server.js";
import { captureFrameFixture } from "./test-support/capture-frame.js";

const mockedComputer = vi.hoisted(() => ({
	capabilities: {
		supportsScreenshot: true,
		supportsInput: true,
		supportsAccessibility: true,
		supportsClipboard: true,
	},
	setTarget: vi.fn(),
	screenshot: vi.fn(),
	move: vi.fn(),
	click: vi.fn(),
	rightClick: vi.fn(),
	middleClick: vi.fn(),
	doubleClick: vi.fn(),
	type: vi.fn(),
	key: vi.fn(),
	scroll: vi.fn(),
	drag: vi.fn(),
	getCursorPosition: vi.fn(),
	getScreenSize: vi.fn(),
	getAppState: vi.fn(),
	getScreenshotViewport: vi.fn(),
	listApps: vi.fn(),
	setValue: vi.fn(),
	selectText: vi.fn(),
	performAction: vi.fn(),
	pressAtPosition: vi.fn(),
	typeIntoFocused: vi.fn(),
	close: vi.fn(),
}));

vi.mock("@macos-cua/core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@macos-cua/core")>();
	return {
		...actual,
		MacOSHostComputer: vi.fn(() => mockedComputer),
	};
});

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
		queueMicrotask(() => {
			peer.onmessage?.(message);
		});
	}

	async close(): Promise<void> {
		this.onclose?.();
	}
}

async function createClient(): Promise<{ readonly client: Client; readonly close: () => Promise<void> }> {
	const server = createMcpServer();
	const client = new Client({ name: "macos-cua-batch-tool-test", version: "0.1.0" });
	const clientTransport = new InMemoryTransport();
	const serverTransport = new InMemoryTransport();
	clientTransport.peer = serverTransport;
	serverTransport.peer = clientTransport;
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	return {
		client,
		close: async () => {
			await Promise.all([client.close(), server.close()]);
		},
	};
}

function textContent(result: { readonly content?: unknown }): string {
	if (!Array.isArray(result.content)) {
		throw new Error("batch result content must be an array");
	}
	const text = result.content.findLast((content): content is { readonly type: "text"; readonly text: string } => {
		return (
			typeof content === "object" &&
			content !== null &&
			"type" in content &&
			content.type === "text" &&
			"text" in content &&
			typeof content.text === "string"
		);
	});
	if (text === undefined) {
		throw new Error("batch result must include text content");
	}
	return text.text;
}

let closeClient: (() => Promise<void>) | null = null;

beforeEach(() => {
	mockedComputer.screenshot.mockResolvedValue({
		data: Buffer.from("png-bytes"),
		mimeType: "image/png",
		width: 500,
		height: 400,
	});
	mockedComputer.click.mockResolvedValue(undefined);
	mockedComputer.drag.mockResolvedValue(undefined);
	mockedComputer.getAppState.mockResolvedValue({
		app: "Finder",
		bundleId: "com.apple.finder",
		pid: 1234,
		frontmost: true,
		axAvailable: true,
		elements: [],
		screenshotBase64: Buffer.from("png-bytes").toString("base64"),
		screenshotWidth: 500,
		screenshotHeight: 400,
		captureFrame: captureFrameFixture({ x: 300, y: 150, width: 1000, height: 800 }, { width: 500, height: 400 }),
	});
	mockedComputer.getScreenshotViewport.mockResolvedValue(
		captureFrameFixture({ x: 0, y: 0, width: 100, height: 100 }, { width: 100, height: 100 }),
	);
	mockedComputer.listApps.mockResolvedValue([
		{ name: "Finder", bundleId: "com.apple.finder", pid: 1234, isRunning: true },
	]);
	mockedComputer.pressAtPosition.mockResolvedValue(false);
	mockedComputer.typeIntoFocused.mockResolvedValue(false);
});

afterEach(async () => {
	if (closeClient !== null) {
		await closeClient();
		closeClient = null;
	}
	vi.clearAllMocks();
});

describe("MCP batch tool #given get_app_state then click #when run through the client #then coordinates re-anchor", () => {
	it("#given in-batch app state #when click follows #then it maps through the latest capture frame", async () => {
		const { client, close } = await createClient();
		closeClient = close;

		const result = await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "click", app: "Finder", x: 250, y: 200 },
				],
			},
		});

		expect(mockedComputer.getScreenshotViewport).not.toHaveBeenCalled();
		expect(mockedComputer.click).toHaveBeenCalledWith({ x: 800, y: 550 });
		expect(result.content).toEqual(
			expect.arrayContaining([
				{ type: "image", data: Buffer.from("png-bytes").toString("base64"), mimeType: "image/png" },
			]),
		);
	});

	it("#given an out-of-bounds coordinate #when batch runs #then it stops before later actions", async () => {
		const { client, close } = await createClient();
		closeClient = close;

		const result = await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "click", app: "Finder", x: 501, y: 200 },
					{ action: "type_text", app: "Finder", text: "should not type" },
				],
			},
		});

		expect(mockedComputer.click).not.toHaveBeenCalled();
		expect(mockedComputer.type).not.toHaveBeenCalled();
		expect(JSON.parse(textContent(result))).toMatchObject({
			ok: false,
			type: "batch",
			actionCount: 3,
			failedStep: 1,
			steps: [
				{ index: 0, action: "get_app_state", status: "success" },
				{ index: 1, action: "click", status: "error" },
			],
		});
	});
});
