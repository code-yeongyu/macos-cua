import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "./server.js";

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

let closeHarness: (() => Promise<void>) | null = null;

beforeEach(() => {
	mockedComputer.screenshot.mockResolvedValue({
		data: Buffer.from("zoom-png"),
		mimeType: "image/png",
		width: 800,
		height: 400,
	});
	mockedComputer.getAppState.mockResolvedValue({
		app: "Finder",
		bundleId: "com.apple.finder",
		pid: 1234,
		frontmost: true,
		axAvailable: true,
		elements: [
			{
				id: 8,
				role: "AXStaticText",
				label: "Readable paragraph",
				value: null,
				frame: { x: 100, y: 50, width: 50, height: 25 },
				actions: [],
				children: [],
			},
			{
				id: 9,
				role: "AXButton",
				label: "Open",
				value: null,
				frame: { x: 100, y: 100, width: 50, height: 25 },
				actions: ["AXPress"],
				children: [],
			},
		],
		screenshotBase64: Buffer.from("png-bytes").toString("base64"),
		screenshotWidth: 500,
		screenshotHeight: 400,
	});
	mockedComputer.listApps.mockResolvedValue([
		{ name: "Finder", bundleId: "com.apple.finder", pid: 1234, isRunning: true },
	]);
	mockedComputer.getScreenshotViewport.mockResolvedValue({
		windowBounds: { x: 300, y: 150, width: 1000, height: 800 },
		screenshotWidth: 500,
		screenshotHeight: 400,
	});
});

afterEach(async () => {
	if (closeHarness !== null) {
		await closeHarness();
		closeHarness = null;
	}
	vi.clearAllMocks();
});

describe("MCP zoom tool #given static text in crop #when returning marks #then text-only nodes are omitted", () => {
	it("returns marks for the actionable element only", async () => {
		const { client, close } = await createHarness();
		closeHarness = close;

		const result = await client.callTool({
			name: "zoom",
			arguments: { app: "Finder", region: { x: 50, y: 25, width: 200, height: 150 } },
		});

		expect(JSON.parse(zoomText(result.content))).toMatchObject({
			marks: [{ id: 9 }],
		});
	});
});

async function createHarness(): Promise<{ readonly client: Client; readonly close: () => Promise<void> }> {
	const server = createMcpServer();
	const client = new Client({ name: "macos-cua-test", version: "0.1.0" });
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

function zoomText(content: readonly { readonly type: string }[]): string {
	const text = content.find((entry) => entry.type === "text");
	if (text?.type !== "text" || !("text" in text) || typeof text.text !== "string") {
		throw new Error("zoom result must include JSON details text");
	}
	return text.text;
}
