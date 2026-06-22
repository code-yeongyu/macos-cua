import type { AppState } from "@macos-cua/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createCanvas } from "@napi-rs/canvas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "./server.js";

const mockedComputer = vi.hoisted(() => ({
	capabilities: {
		supportsScreenshot: true,
		supportsInput: true,
		supportsAccessibility: true,
		supportsClipboard: true,
	},
	getAppState: vi.fn(),
	listApps: vi.fn(),
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
	mockedComputer.listApps.mockResolvedValue([
		{ name: "Finder", bundleId: "com.apple.finder", pid: 1234, isRunning: true },
	]);
	mockedComputer.getAppState.mockResolvedValue(stateWithCursorOutsideWindow());
});

afterEach(async () => {
	if (closeHarness !== null) {
		await closeHarness();
		closeHarness = null;
	}
	vi.clearAllMocks();
});

describe("MCP get_app_state #given cursor outside window #when rendering screenshot #then image is not annotated", () => {
	it("returns the original image bytes and MIME type", async () => {
		const state = stateWithCursorOutsideWindow();
		const { client, close } = await createHarness();
		closeHarness = close;

		const result = await client.callTool({ name: "get_app_state", arguments: { app: "Finder" } });

		const image = imageContent(result.content);
		expect(image.mimeType).toBe("image/jpeg");
		expect(image.data).toBe(state.screenshotBase64);
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

function stateWithCursorOutsideWindow(): AppState {
	const windowBounds = { x: 10, y: 20, width: 160, height: 120 };
	const cursor = { x: 300, y: 40 };
	return {
		app: "Finder",
		bundleId: "com.apple.finder",
		pid: 1234,
		frontmost: false,
		axAvailable: true,
		elements: [],
		screenshotBase64: fixtureJpeg().toString("base64"),
		screenshotWidth: 160,
		screenshotHeight: 120,
		screenshotMimeType: "image/jpeg",
		display: { width: 160, height: 120, scaleFactor: 1 },
		windowBounds,
		observation: {
			app: { name: "Finder", bundleId: "com.apple.finder", pid: 1234, frontmost: false },
			ax: { available: true, elementCount: 0 },
			capture: {
				captureId: "capture-1",
				capturedAt: "2026-06-18T00:00:00.000Z",
				displayEpoch: "160x120@1",
				model: { width: 160, height: 120 },
				screenshot: { width: 160, height: 120, mimeType: "image/jpeg" },
				target: { name: "Finder", bundleId: "com.apple.finder", pid: 1234 },
			},
			cursor,
			display: {
				epoch: "160x120@1",
				logical: { x: 0, y: 0, width: 160, height: 120 },
				native: { width: 160, height: 120 },
				scaleFactor: 1,
			},
			freshness: { captureId: "capture-1", displayEpoch: "160x120@1", stale: false },
			window: { bounds: windowBounds },
		},
	};
}

function fixtureJpeg(): Buffer {
	const canvas = createCanvas(160, 120);
	const context = canvas.getContext("2d");
	context.fillStyle = "#f8fafc";
	context.fillRect(0, 0, 160, 120);
	return canvas.toBuffer("image/jpeg");
}

function imageContent(content: readonly { readonly type: string }[]): {
	readonly type: "image";
	readonly data: string;
	readonly mimeType: string;
} {
	const image = content.find((entry) => entry.type === "image");
	if (image === undefined || image.type !== "image" || !("data" in image) || !("mimeType" in image)) {
		throw new Error("missing image content");
	}
	if (typeof image.data !== "string" || typeof image.mimeType !== "string") {
		throw new Error("invalid image content");
	}
	return { type: image.type, data: image.data, mimeType: image.mimeType };
}
