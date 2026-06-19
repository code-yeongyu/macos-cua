import { beforeEach, describe, expect, it, vi } from "vitest";

type ExecFileCallback = (error: Error | null, stdout: string | Buffer, stderr: string) => void;
type ExecFileMock = (
	file: string,
	args: readonly string[],
	options: { readonly encoding?: BufferEncoding; readonly timeout?: number },
	callback: ExecFileCallback,
) => void;

const childProcessMock = vi.hoisted(() => ({ execFile: vi.fn<ExecFileMock>() }));
vi.mock("node:child_process", () => ({ execFile: childProcessMock.execFile }));

const windowMock = vi.hoisted(() => ({
	openWindows: vi.fn(() =>
		Promise.resolve([{ id: 99, owner: { processId: 1234 }, bounds: { x: 300, y: 150, width: 2560, height: 1600 } }]),
	),
}));
vi.mock("get-windows", () => ({ openWindows: windowMock.openWindows }));

const accessibilityMock = vi.hoisted(() => ({
	extractAccessibilityTree: vi.fn(() => ({ axAvailable: true, elements: [] })),
	performActionByIndex: vi.fn(),
	pressElementAtScreenPoint: vi.fn(),
	setValueByIndex: vi.fn(),
	typeIntoFocusedAXElement: vi.fn(),
}));
vi.mock("./macos-ffi/accessibility.js", () => accessibilityMock);

const screenshotMock = vi.hoisted(() => ({
	captureDisplayRectPng: vi.fn(),
	captureMainDisplayPng: vi.fn(),
	getMainDisplayLogicalSize: vi.fn(() => ({ width: 1920, height: 1080 })),
	getMainDisplayNativePixelSize: vi.fn(() => ({ width: 3840, height: 2160 })),
}));
vi.mock("./macos-ffi/screenshot.js", () => screenshotMock);

import { MacOSHostComputer } from "./macos.js";

const WINDOW_BOUNDS = { x: 300, y: 150, width: 2560, height: 1600 };

function fakePng(width: number, height: number): Buffer {
	const data = globalThis.Buffer.alloc(24);
	data.write("PNG\r\n\n", 0, "latin1");
	data.writeUInt32BE(width, 16);
	data.writeUInt32BE(height, 20);
	return data;
}

beforeEach(() => {
	childProcessMock.execFile.mockReset();
	windowMock.openWindows.mockClear();
	accessibilityMock.extractAccessibilityTree.mockClear();
	screenshotMock.captureDisplayRectPng.mockReturnValue({ data: fakePng(1280, 800), width: 1280, height: 800 });
	screenshotMock.captureMainDisplayPng.mockReturnValue({ data: fakePng(1920, 1080), width: 1920, height: 1080 });
	childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
		callback(null, JSON.stringify([{ name: "Finder", bundleId: "com.apple.finder", pid: 1234, isActive: true }]), "");
	});
	childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
		callback(null, fakePng(1280, 800), "");
	});
	childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
		callback(null, fakePng(1280, 800), "");
	});
});

describe("#given app state capture #when get_app_state runs #then it highlights the target window", () => {
	it("fires the capture-start highlight on every windowed call", async () => {
		const overlay = { set: vi.fn(), highlight: vi.fn(), hide: vi.fn(), close: vi.fn() };
		const computer = new MacOSHostComputer({ overlay });

		await computer.getAppState(1234, { settleMs: 0 });
		await computer.getAppState(1234, { settleMs: 0 });

		expect(overlay.highlight).toHaveBeenCalledTimes(2);
		expect(overlay.highlight).toHaveBeenNthCalledWith(1, WINDOW_BOUNDS);
		expect(overlay.highlight).toHaveBeenNthCalledWith(2, WINDOW_BOUNDS);
	});
});
