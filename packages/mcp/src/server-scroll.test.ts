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

async function createClient(): Promise<{ readonly client: Client; readonly close: () => Promise<void> }> {
	const server = createMcpServer();
	const client = new Client({ name: "macos-cua-scroll-test", version: "0.1.0" });
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

let closeClient: (() => Promise<void>) | null = null;

beforeEach(() => {
	mockedComputer.key.mockResolvedValue(undefined);
	mockedComputer.scroll.mockResolvedValue(undefined);
	mockedComputer.performAction.mockResolvedValue(undefined);
	mockedComputer.listApps.mockResolvedValue([
		{ name: "Finder", bundleId: "com.apple.finder", pid: 1234, isRunning: true },
	]);
});

afterEach(async () => {
	if (closeClient !== null) {
		await closeClient();
		closeClient = null;
	}
	vi.clearAllMocks();
});

describe("MCP scroll tool #given #when #then", () => {
	it("maps vertical scroll without element_index to page navigation keys", async () => {
		const { client, close } = await createClient();
		closeClient = close;

		const result = await client.callTool({
			name: "scroll",
			arguments: { app: "Finder", direction: "down", pages: 2 },
		});

		expect(mockedComputer.key).toHaveBeenNthCalledWith(1, "page_down", undefined);
		expect(mockedComputer.key).toHaveBeenNthCalledWith(2, "page_down", undefined);
		expect(mockedComputer.scroll).not.toHaveBeenCalled();
		expect(JSON.stringify(result.content)).toContain("page_down/page_up");
	});

	it("maps scroll with element_index to AX page scrolling without wheel fallback", async () => {
		const { client, close } = await createClient();
		closeClient = close;

		await client.callTool({
			name: "scroll",
			arguments: { app: "Finder", direction: "down", element_index: "9", pages: 2 },
		});

		expect(mockedComputer.performAction).toHaveBeenNthCalledWith(1, 1234, 9, "AXScrollDownByPage");
		expect(mockedComputer.performAction).toHaveBeenNthCalledWith(2, 1234, 9, "AXScrollDownByPage");
		expect(mockedComputer.scroll).not.toHaveBeenCalled();
		expect(mockedComputer.key).not.toHaveBeenCalled();
	});
});
