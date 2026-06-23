import type { ComputerInterface } from "@macos-cua/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { createMcpServer } from "./server.js";

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

async function withClient<T>(computer: ComputerInterface, action: (client: Client) => Promise<T>): Promise<T> {
	const server = createMcpServer(computer);
	const client = new Client({ name: "macos-cua-targeting-test", version: "0.1.0" });
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

describe("MCP target resolution #given unknown app #when click resolves pid #then it fails closed", () => {
	it("#given no matching running app #when click is called #then no global target fallback is used", async () => {
		const computer = createComputer();

		const result = await withClient(computer, (client) =>
			client.callTool({ name: "click", arguments: { app: "Missing", x: 10, y: 20 } }),
		);

		expect(result.isError).toBe(true);
		expect(result.content).toEqual([{ type: "text", text: 'No running app matched "Missing"' }]);
		expect(computer.setTarget).not.toHaveBeenCalled();
		expect(computer.pressAtPosition).not.toHaveBeenCalled();
		expect(computer.click).not.toHaveBeenCalled();
	});
});

function createComputer(): ComputerInterface {
	return {
		capabilities: {
			supportsScreenshot: true,
			supportsInput: true,
			supportsAccessibility: true,
			supportsClipboard: true,
		},
		screenshot: vi.fn<ComputerInterface["screenshot"]>(),
		setTarget: vi.fn<ComputerInterface["setTarget"]>(),
		move: vi.fn<ComputerInterface["move"]>(),
		click: vi.fn<ComputerInterface["click"]>(),
		rightClick: vi.fn<ComputerInterface["rightClick"]>(),
		middleClick: vi.fn<ComputerInterface["middleClick"]>(),
		doubleClick: vi.fn<ComputerInterface["doubleClick"]>(),
		type: vi.fn<ComputerInterface["type"]>(),
		key: vi.fn<ComputerInterface["key"]>(),
		scroll: vi.fn<ComputerInterface["scroll"]>(),
		drag: vi.fn<ComputerInterface["drag"]>(),
		getCursorPosition: vi.fn<ComputerInterface["getCursorPosition"]>(),
		getScreenSize: vi.fn<ComputerInterface["getScreenSize"]>(),
		getAppState: vi.fn<ComputerInterface["getAppState"]>(),
		getScreenshotViewport: vi.fn<ComputerInterface["getScreenshotViewport"]>(),
		listApps: vi.fn<ComputerInterface["listApps"]>().mockResolvedValue([]),
		setValue: vi.fn<ComputerInterface["setValue"]>(),
		selectText: vi.fn<ComputerInterface["selectText"]>(),
		performAction: vi.fn<ComputerInterface["performAction"]>(),
		pressAtPosition: vi.fn<ComputerInterface["pressAtPosition"]>(),
		typeIntoFocused: vi.fn<ComputerInterface["typeIntoFocused"]>(),
		close: vi.fn<ComputerInterface["close"]>(),
	};
}
