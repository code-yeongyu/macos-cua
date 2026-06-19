import { beforeEach, describe, expect, it, vi } from "vitest";

const coreGraphicsMock = vi.hoisted(() => ({
	postKeyboardEvent: vi.fn(),
	postScrollEvent: vi.fn(),
	postUnicodeText: vi.fn(),
}));

const accessibilityMock = vi.hoisted(() => ({
	typeIntoFocusedAXElement: vi.fn(() => false),
}));

const skyLightMock = vi.hoisted(() => ({
	beginFocusWithoutRaise: vi.fn(),
	restoreFrontProcessNoWindows: vi.fn(),
}));

vi.mock("./macos-ffi/accessibility.js", () => ({
	typeIntoFocusedAXElement: accessibilityMock.typeIntoFocusedAXElement,
}));
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

describe("#given targeted session input #when typing, pressing keys, or scrolling #then it avoids front-process focus", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		accessibilityMock.typeIntoFocusedAXElement.mockReturnValue(false);
	});

	it("posts text input to the target without focus restoration", async () => {
		const { postFocusedText } = await import("./macos-input-session.js");
		const targetWindow = { id: 77, bounds: { x: 100, y: 200, width: 300, height: 240 } };

		await postFocusedText({ text: "Hi", targetPid: 9876, targetWindow });

		expect(skyLightMock.beginFocusWithoutRaise).not.toHaveBeenCalled();
		expect(coreGraphicsMock.postUnicodeText).toHaveBeenNthCalledWith(1, "H", 9876, targetWindow);
		expect(coreGraphicsMock.postUnicodeText).toHaveBeenNthCalledWith(2, "i", 9876, targetWindow);
		expect(skyLightMock.restoreFrontProcessNoWindows).not.toHaveBeenCalled();
	});

	it("#given Korean text and a target pid #when the focused AX element accepts text #then keyboard injection is skipped", async () => {
		const { postFocusedText } = await import("./macos-input-session.js");
		const targetWindow = { id: 77, bounds: { x: 100, y: 200, width: 300, height: 240 } };
		accessibilityMock.typeIntoFocusedAXElement.mockReturnValue(true);

		await postFocusedText({ text: "안녕하세요", targetPid: 9876, targetWindow });

		expect(accessibilityMock.typeIntoFocusedAXElement).toHaveBeenCalledWith(9876, "안녕하세요");
		expect(coreGraphicsMock.postUnicodeText).not.toHaveBeenCalled();
		expect(skyLightMock.beginFocusWithoutRaise).not.toHaveBeenCalled();
	});

	it("posts targeted key down and up without focus restoration", async () => {
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

		expect(skyLightMock.beginFocusWithoutRaise).not.toHaveBeenCalled();
		expect(skyLightMock.restoreFrontProcessNoWindows).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		vi.useRealTimers();
	});

	it("posts targeted wheel scrolling without focus restoration", async () => {
		const { postFocusedScroll } = await import("./macos-input-session.js");
		const targetWindow = { id: 77, bounds: { x: 100, y: 200, width: 300, height: 240 } };

		await postFocusedScroll({ options: { direction: "down", amount: 30 }, targetPid: 9876, targetWindow });

		expect(skyLightMock.beginFocusWithoutRaise).not.toHaveBeenCalled();
		expect(coreGraphicsMock.postScrollEvent).toHaveBeenCalledWith({
			deltaX: 0,
			deltaY: -30,
			targetPid: 9876,
			targetWindow,
		});
		expect(skyLightMock.restoreFrontProcessNoWindows).not.toHaveBeenCalled();
	});
});
