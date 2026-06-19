import { beforeEach, describe, expect, it, vi } from "vitest";

interface TestWindow {
	readonly id: number;
	readonly owner: {
		readonly processId: number;
	};
	readonly bounds: {
		readonly x: number;
		readonly y: number;
		readonly width: number;
		readonly height: number;
	};
}

const coreGraphicsMock = vi.hoisted(() => ({
	getCurrentCursorPosition: vi.fn(() => ({ x: 1, y: 2 })),
	postKeyboardEvent: vi.fn(),
	postMouseEvent: vi.fn(),
	postScrollEvent: vi.fn(),
	postUnicodeText: vi.fn(),
	warpCursorPosition: vi.fn(),
}));

const accessibilityMock = vi.hoisted(() => ({
	typeIntoFocusedAXElement: vi.fn(() => false),
}));

const windowMock = vi.hoisted(() => ({
	openWindows: vi.fn<() => Promise<readonly TestWindow[]>>(() => Promise.resolve([])),
}));

const skyLightMock = vi.hoisted(() => ({
	beginFocusWithoutRaise: vi.fn(),
	restoreFrontProcessNoWindows: vi.fn(),
}));

vi.mock("get-windows", () => ({ openWindows: windowMock.openWindows }));
vi.mock("./macos-ffi/accessibility.js", () => ({
	typeIntoFocusedAXElement: accessibilityMock.typeIntoFocusedAXElement,
}));
vi.mock("./macos-ffi/lock-screen.js", () => ({ isScreenLocked: () => false }));
vi.mock("./macos-ffi/skylight.js", () => ({
	beginFocusWithoutRaise: skyLightMock.beginFocusWithoutRaise,
	restoreFrontProcessNoWindows: skyLightMock.restoreFrontProcessNoWindows,
}));
vi.mock("./macos-ffi/coregraphics.js", () => ({
	K_CG_EVENT_FLAG_MASK_ALTERNATE: 0x00080000,
	K_CG_EVENT_FLAG_MASK_COMMAND: 0x00100000,
	K_CG_EVENT_FLAG_MASK_CONTROL: 0x00040000,
	K_CG_EVENT_FLAG_MASK_SHIFT: 0x00020000,
	getCurrentCursorPosition: coreGraphicsMock.getCurrentCursorPosition,
	postKeyboardEvent: coreGraphicsMock.postKeyboardEvent,
	postMouseEvent: coreGraphicsMock.postMouseEvent,
	postScrollEvent: coreGraphicsMock.postScrollEvent,
	postUnicodeText: coreGraphicsMock.postUnicodeText,
	warpCursorPosition: coreGraphicsMock.warpCursorPosition,
}));

describe("#given focused app targeted input", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		accessibilityMock.typeIntoFocusedAXElement.mockReturnValue(false);
		windowMock.openWindows.mockResolvedValue([]);
	});

	it("#when a focused app has multiple visible windows #then pointer routing uses the window containing the click", async () => {
		// given
		windowMock.openWindows.mockResolvedValue([
			{
				id: 10,
				owner: { processId: 1234 },
				bounds: { x: 0, y: 0, width: 200, height: 160 },
			},
			{
				id: 20,
				owner: { processId: 1234 },
				bounds: { x: 400, y: 300, width: 300, height: 220 },
			},
			{
				id: 30,
				owner: { processId: 9876 },
				bounds: { x: 400, y: 300, width: 300, height: 220 },
			},
		]);
		const { MacOSInputController } = await import("./macos-input.js");
		const controller = new MacOSInputController(1234);

		// when
		await controller.click({ x: 450, y: 340 });

		// then
		const targetWindow = { id: 20, bounds: { x: 400, y: 300, width: 300, height: 220 } };
		expect(skyLightMock.beginFocusWithoutRaise).not.toHaveBeenCalled();
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(1, {
			kind: "move",
			position: { x: 450, y: 340 },
			button: "left",
			clickState: undefined,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(2, {
			kind: "down",
			position: { x: 450, y: 340 },
			button: "left",
			clickState: 1,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(3, {
			kind: "up",
			position: { x: 450, y: 340 },
			button: "left",
			clickState: 1,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.warpCursorPosition).not.toHaveBeenCalled();
		expect(skyLightMock.restoreFrontProcessNoWindows).not.toHaveBeenCalled();
		controller.close();
	});

	it("#when no target window contains the click #then pointer routing falls back to the first visible target window", async () => {
		// given
		windowMock.openWindows.mockResolvedValue([
			{
				id: 99,
				owner: { processId: 1234 },
				bounds: { x: 10, y: 20, width: 300, height: 200 },
			},
		]);
		const { MacOSInputController } = await import("./macos-input.js");
		const controller = new MacOSInputController(1234);

		// when
		await controller.click({ x: 900, y: 900 });

		// then
		const targetWindow = { id: 99, bounds: { x: 10, y: 20, width: 300, height: 200 } };
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(1, {
			kind: "move",
			position: { x: 900, y: 900 },
			button: "left",
			clickState: undefined,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(2, {
			kind: "down",
			position: { x: 900, y: 900 },
			button: "left",
			clickState: 1,
			targetPid: 1234,
			targetWindow,
		});
		controller.close();
	});

	it("#when double-clicking a target pid #then it posts move plus four click events", async () => {
		// given
		windowMock.openWindows.mockResolvedValue([
			{
				id: 99,
				owner: { processId: 1234 },
				bounds: { x: 10, y: 20, width: 300, height: 200 },
			},
		]);
		const { MacOSInputController } = await import("./macos-input.js");
		const controller = new MacOSInputController(1234);

		// when
		await controller.doubleClick({ x: 50, y: 70 });

		// then
		const targetWindow = { id: 99, bounds: { x: 10, y: 20, width: 300, height: 200 } };
		expect(skyLightMock.beginFocusWithoutRaise).not.toHaveBeenCalled();
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenCalledTimes(5);
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(1, {
			kind: "move",
			position: { x: 50, y: 70 },
			button: "left",
			clickState: undefined,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(2, {
			kind: "down",
			position: { x: 50, y: 70 },
			button: "left",
			clickState: 1,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(3, {
			kind: "up",
			position: { x: 50, y: 70 },
			button: "left",
			clickState: 1,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(4, {
			kind: "down",
			position: { x: 50, y: 70 },
			button: "left",
			clickState: 2,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(5, {
			kind: "up",
			position: { x: 50, y: 70 },
			button: "left",
			clickState: 2,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.warpCursorPosition).not.toHaveBeenCalled();
		expect(skyLightMock.restoreFrontProcessNoWindows).not.toHaveBeenCalled();
		controller.close();
	});

	it("#when dragging in a target pid #then it posts move, down, drag, and up without focus restoration", async () => {
		// given
		windowMock.openWindows.mockResolvedValue([
			{
				id: 99,
				owner: { processId: 1234 },
				bounds: { x: 10, y: 20, width: 300, height: 200 },
			},
		]);
		const { MacOSInputController } = await import("./macos-input.js");
		const controller = new MacOSInputController(1234);

		// when
		await controller.drag({ from: { x: 50, y: 70 }, to: { x: 90, y: 110 }, duration: 0 });

		// then
		const targetWindow = { id: 99, bounds: { x: 10, y: 20, width: 300, height: 200 } };
		expect(skyLightMock.beginFocusWithoutRaise).not.toHaveBeenCalled();
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(1, {
			kind: "move",
			position: { x: 50, y: 70 },
			button: "left",
			clickState: undefined,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(2, {
			kind: "down",
			position: { x: 50, y: 70 },
			button: "left",
			clickState: 1,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(3, {
			kind: "drag",
			position: { x: 90, y: 110 },
			button: "left",
			clickState: 1,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.postMouseEvent).toHaveBeenNthCalledWith(4, {
			kind: "up",
			position: { x: 90, y: 110 },
			button: "left",
			clickState: 1,
			targetPid: 1234,
			targetWindow,
		});
		expect(coreGraphicsMock.warpCursorPosition).not.toHaveBeenCalled();
		expect(skyLightMock.restoreFrontProcessNoWindows).not.toHaveBeenCalled();
		controller.close();
	});
});
