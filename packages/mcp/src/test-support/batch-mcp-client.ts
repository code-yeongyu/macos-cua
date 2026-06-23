import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, vi } from "vitest";
import { createMcpServer } from "../server.js";
import { captureFrameFixture } from "./capture-frame.js";

const mockedComputerValue = vi.hoisted(() => ({
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

export const mockedComputer = mockedComputerValue;

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

let closeClient: (() => Promise<void>) | null = null;

export function installBatchMcpTestHooks(): void {
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
			{ name: "Terminal", bundleId: "com.apple.Terminal", pid: 5678, isRunning: true },
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
}

export async function createBatchClient(): Promise<Client> {
	const server = createMcpServer();
	const client = new Client({ name: "macos-cua-batch-tool-test", version: "0.1.0" });
	const clientTransport = new InMemoryTransport();
	const serverTransport = new InMemoryTransport();
	clientTransport.peer = serverTransport;
	serverTransport.peer = clientTransport;
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	closeClient = async () => {
		await Promise.all([client.close(), server.close()]);
	};
	return client;
}

export function textContent(result: { readonly content?: unknown }): string {
	const content = result.content;
	if (!Array.isArray(content)) {
		throw new Error("batch result content must be an array");
	}
	for (let index = content.length - 1; index >= 0; index -= 1) {
		const item: unknown = content[index];
		if (isTextContent(item)) {
			return item.text;
		}
	}
	throw new Error("batch result must include text content");
}

export function textContents(result: { readonly content?: unknown }): readonly string[] {
	const content = result.content;
	if (!Array.isArray(content)) {
		throw new Error("batch result content must be an array");
	}
	return content.flatMap((item: unknown): readonly string[] => (isTextContent(item) ? [item.text] : []));
}

function isTextContent(content: unknown): content is { readonly type: "text"; readonly text: string } {
	return (
		typeof content === "object" &&
		content !== null &&
		"type" in content &&
		content.type === "text" &&
		"text" in content &&
		typeof content.text === "string"
	);
}
