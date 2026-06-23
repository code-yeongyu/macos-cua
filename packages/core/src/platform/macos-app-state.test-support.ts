import { beforeEach, vi } from "vitest";

import type { AuditEvent } from "../computer/audit.js";
import { ComputerUseSupervisor, createSoftwareKillSwitch } from "../computer/supervisor.js";

type ExecFileCallback = (error: Error | null, stdout: string | Buffer, stderr: string) => void;
type ExecFileMock = (
	file: string,
	args: readonly string[],
	options: { readonly encoding?: BufferEncoding; readonly timeout?: number },
	callback: ExecFileCallback,
) => void;

type TestWindow = {
	readonly id: number;
	readonly owner: { readonly processId: number };
	readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
};

const childProcessMock = vi.hoisted(() => ({ execFile: vi.fn<ExecFileMock>() }));
vi.mock("node:child_process", () => ({ execFile: childProcessMock.execFile }));

const windowMock = vi.hoisted(() => ({
	openWindows: vi.fn<() => Promise<readonly TestWindow[]>>(() => Promise.resolve([])),
}));
vi.mock("get-windows", () => ({ openWindows: windowMock.openWindows }));

const accessibilityMock = vi.hoisted(() => ({
	extractAccessibilityTree: vi.fn(),
	performActionByIndex: vi.fn(),
	pressElementAtScreenPoint: vi.fn(),
	setValueByIndex: vi.fn(),
	typeIntoFocusedAXElement: vi.fn(),
}));

const screenshotMock = vi.hoisted(() => ({
	captureDisplayRectPng: vi.fn(),
	captureMainDisplayPng: vi.fn(),
	getMainDisplayLogicalSize: vi.fn(),
	getMainDisplayNativePixelSize: vi.fn(),
}));
vi.mock("./macos-ffi/screenshot.js", () => screenshotMock);
vi.mock("./macos-ffi/accessibility.js", () => accessibilityMock);
vi.mock("./macos-ffi/cursor-overlay.js", () => ({
	createCursorOverlay: () => ({ set() {}, highlight() {}, hide() {}, close() {} }),
}));

export const TARGET_PID = 1234;
export const WINDOW_BOUNDS = { x: 300, y: 150, width: 2560, height: 1600 };
export { accessibilityMock, childProcessMock, screenshotMock, windowMock };

export interface RecordedAuditSink {
	readonly events: AuditEvent[];
	append(event: AuditEvent): Promise<void>;
}

export function createRecordedAuditSink(): RecordedAuditSink {
	const events: AuditEvent[] = [];
	return {
		events,
		append: async (event) => {
			events.push(event);
		},
	};
}

export function createSupervisor(clock: () => number): ComputerUseSupervisor {
	const supervisor = new ComputerUseSupervisor({
		clock,
		requiredListeners: ["software-kill-switch"],
	});
	supervisor.recordHeartbeat(1_000);
	createSoftwareKillSwitch(supervisor).markReady();
	return supervisor;
}

export function fakePng(width: number, height: number): Buffer {
	const data = globalThis.Buffer.alloc(24);
	data.write("\x89PNG\r\n\x1a\n", 0, "latin1");
	data.writeUInt32BE(width, 16);
	data.writeUInt32BE(height, 20);
	return data;
}

beforeEach(() => {
	childProcessMock.execFile.mockReset();
	windowMock.openWindows.mockReset();
	accessibilityMock.extractAccessibilityTree.mockReset();
	accessibilityMock.performActionByIndex.mockReset();
	accessibilityMock.pressElementAtScreenPoint.mockReset();
	accessibilityMock.setValueByIndex.mockReset();
	accessibilityMock.typeIntoFocusedAXElement.mockReset();
	screenshotMock.captureDisplayRectPng.mockReset();
	screenshotMock.captureMainDisplayPng.mockReset();
	screenshotMock.getMainDisplayLogicalSize.mockReset();
	screenshotMock.getMainDisplayNativePixelSize.mockReset();
	screenshotMock.getMainDisplayLogicalSize.mockReturnValue({ width: 1920, height: 1080 });
	screenshotMock.getMainDisplayNativePixelSize.mockReturnValue({ width: 3840, height: 2160 });
	screenshotMock.captureDisplayRectPng.mockReturnValue({ data: fakePng(2576, 1616), width: 2576, height: 1616 });
	screenshotMock.captureMainDisplayPng.mockReturnValue({ data: fakePng(1920, 1080), width: 1920, height: 1080 });

	windowMock.openWindows.mockResolvedValue([{ id: 99, owner: { processId: TARGET_PID }, bounds: WINDOW_BOUNDS }]);
	accessibilityMock.extractAccessibilityTree.mockReturnValue({
		axAvailable: true,
		elements: [
			{
				id: 5,
				role: "AXButton",
				label: "Open",
				value: null,
				frame: { x: 800, y: 550, width: 200, height: 160 },
				actions: ["AXPress"],
				children: [],
			},
		],
	});
	childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
		callback(
			null,
			JSON.stringify([{ name: "Finder", bundleId: "com.apple.finder", pid: TARGET_PID, isActive: true }]),
			"",
		);
	});
	childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
		callback(null, fakePng(2576, 1616), "");
	});
});
