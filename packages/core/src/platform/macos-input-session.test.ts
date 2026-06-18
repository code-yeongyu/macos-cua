import { beforeEach, describe, expect, it, vi } from "vitest";

const coreGraphicsMock = vi.hoisted(() => ({
	postKeyboardEvent: vi.fn(),
	postScrollEvent: vi.fn(),
	postUnicodeText: vi.fn(),
}));

const skyLightMock = vi.hoisted(() => {
	const focusToken = { previousPsn: Buffer.alloc(8) };
	return {
		beginFocusWithoutRaise: vi.fn<() => { readonly previousPsn: Buffer } | null>(() => focusToken),
		focusToken,
		restoreFrontProcessNoWindows: vi.fn(() => true),
	};
});

vi.mock("./macos-ffi/coregraphics.js", () => ({
	K_CG_EVENT_FLAG_MASK_ALTERNATE: 0x00080000,
	K_CG_EVENT_FLAG_MASK_COMMAND: 0x00100000,
	K_CG_EVENT_FLAG_MASK_CONTROL: 0x00040000,
	K_CG_EVENT_FLAG_MASK_SHIFT: 0x00020000,
	postKeyboardEvent: coreGraphicsMock.postKeyboardEvent,
	postScrollEvent: coreGraphicsMock.postScrollEvent,
	postUnicodeText: coreGraphicsMock.postUnicodeText,
}));
vi.mock("./macos-ffi/skylight.js", () => ({
	beginFocusWithoutRaise: skyLightMock.beginFocusWithoutRaise,
	restoreFrontProcessNoWindows: skyLightMock.restoreFrontProcessNoWindows,
}));

function callOrderAt(orders: readonly number[], index: number, label: string): number {
	const order = orders[index];
	if (order === undefined) {
		throw new Error(`missing ${label} call order at index ${index}`);
	}
	return order;
}

describe("#given targeted session input #when typing, pressing keys, or scrolling #then it leases focus", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		skyLightMock.beginFocusWithoutRaise.mockReturnValue(skyLightMock.focusToken);
	});

	it("wraps text input in target focus restoration", async () => {
		const { postFocusedText } = await import("./macos-input-session.js");
		const targetWindow = { id: 77, bounds: { x: 100, y: 200, width: 300, height: 240 } };

		await postFocusedText({ text: "Hi", targetPid: 9876, targetWindow });

		expect(skyLightMock.beginFocusWithoutRaise).toHaveBeenCalledWith(targetWindow);
		expect(coreGraphicsMock.postUnicodeText).toHaveBeenNthCalledWith(1, "H", 9876, targetWindow);
		expect(coreGraphicsMock.postUnicodeText).toHaveBeenNthCalledWith(2, "i", 9876, targetWindow);
		expect(skyLightMock.restoreFrontProcessNoWindows).toHaveBeenCalledWith(skyLightMock.focusToken);
	});

	it("keeps target focus leased until key release completes", async () => {
		vi.useFakeTimers();
		const { postFocusedKey } = await import("./macos-input-session.js");
		const targetWindow = { id: 88, bounds: { x: 20, y: 40, width: 300, height: 240 } };

		const pressing = postFocusedKey({
			key: "l",
			options: { modifiers: ["command"], holdMilliseconds: 250 },
			targetPid: 9876,
			targetWindow,
		});
		await vi.runAllTimersAsync();
		await pressing;

		expect(coreGraphicsMock.postKeyboardEvent).toHaveBeenNthCalledWith(1, {
			keyCode: 37,
			keyDown: true,
			flags: 0x00100000,
			text: undefined,
			targetPid: 9876,
			targetWindow,
		});
		expect(coreGraphicsMock.postKeyboardEvent).toHaveBeenNthCalledWith(2, {
			keyCode: 37,
			keyDown: false,
			flags: 0x00100000,
			text: undefined,
			targetPid: 9876,
			targetWindow,
		});

		const beginOrder = callOrderAt(skyLightMock.beginFocusWithoutRaise.mock.invocationCallOrder, 0, "begin focus");
		const keyDownOrder = callOrderAt(coreGraphicsMock.postKeyboardEvent.mock.invocationCallOrder, 0, "key down");
		const keyUpOrder = callOrderAt(coreGraphicsMock.postKeyboardEvent.mock.invocationCallOrder, 1, "key up");
		const restoreOrder = callOrderAt(
			skyLightMock.restoreFrontProcessNoWindows.mock.invocationCallOrder,
			0,
			"restore focus",
		);
		expect(beginOrder).toBeLessThan(keyDownOrder);
		expect(keyDownOrder).toBeLessThan(keyUpOrder);
		expect(keyUpOrder).toBeLessThan(restoreOrder);
		expect(vi.getTimerCount()).toBe(0);
		vi.useRealTimers();
	});

	it("wraps targeted wheel scrolling in target focus restoration", async () => {
		const { postFocusedScroll } = await import("./macos-input-session.js");
		const targetWindow = { id: 77, bounds: { x: 100, y: 200, width: 300, height: 240 } };

		await postFocusedScroll({ options: { direction: "down", amount: 30 }, targetPid: 9876, targetWindow });

		expect(skyLightMock.beginFocusWithoutRaise).toHaveBeenCalledWith(targetWindow);
		expect(coreGraphicsMock.postScrollEvent).toHaveBeenCalledWith({
			deltaX: 0,
			deltaY: -30,
			targetPid: 9876,
			targetWindow,
		});
		expect(skyLightMock.restoreFrontProcessNoWindows).toHaveBeenCalledWith(skyLightMock.focusToken);
	});

	it("posts targeted input without restoration when a focus lease is unavailable", async () => {
		const { postFocusedText } = await import("./macos-input-session.js");
		const targetWindow = { id: 55, bounds: { x: 150, y: 70, width: 580, height: 480 } };
		skyLightMock.beginFocusWithoutRaise.mockReturnValue(null);

		await postFocusedText({ text: "Q", targetPid: 17264, targetWindow });

		expect(coreGraphicsMock.postUnicodeText).toHaveBeenCalledWith("Q", 17264, targetWindow);
		expect(skyLightMock.restoreFrontProcessNoWindows).not.toHaveBeenCalled();
	});
});
