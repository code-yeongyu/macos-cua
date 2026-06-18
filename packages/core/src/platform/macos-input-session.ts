import { setTimeout as sleep } from "node:timers/promises";
import type { KeyOptions, ScrollOptions } from "../types/index.js";
import { postKeyboardEvent, postScrollEvent, postUnicodeText } from "./macos-ffi/coregraphics.js";
import type { SkyLightTargetWindow } from "./macos-ffi/skylight.js";
import { modifierFlags, virtualKeyCodeFor } from "./macos-keycodes.js";
import { runFocusLeasedInput } from "./macos-targeted-gesture.js";

interface TargetedInputOptions {
	readonly targetPid: number | undefined;
	readonly targetWindow: SkyLightTargetWindow | undefined;
}

interface TextInputOptions extends TargetedInputOptions {
	readonly text: string;
}

interface KeyInputOptions extends TargetedInputOptions {
	readonly key: string;
	readonly options: KeyOptions | undefined;
}

interface ScrollInputOptions extends TargetedInputOptions {
	readonly options: ScrollOptions;
}

export async function postFocusedText(options: TextInputOptions): Promise<void> {
	await withTargetFocus(options, async () => {
		for (const segment of Array.from(options.text)) {
			postUnicodeText(segment, options.targetPid, options.targetWindow);
		}
	});
}

export async function postFocusedKey(options: KeyInputOptions): Promise<void> {
	const keyCode = virtualKeyCodeFor(options.key);
	const flags = modifierFlags(options.options?.modifiers ?? []);
	await withTargetFocus(options, async () => {
		postKeyboardEvent({
			keyCode,
			keyDown: true,
			flags,
			text: undefined,
			targetPid: options.targetPid,
			targetWindow: options.targetWindow,
		});
		if (options.options?.holdMilliseconds !== undefined) {
			await sleep(options.options.holdMilliseconds);
		}
		postKeyboardEvent({
			keyCode,
			keyDown: false,
			flags,
			text: undefined,
			targetPid: options.targetPid,
			targetWindow: options.targetWindow,
		});
	});
}

export async function postFocusedScroll(options: ScrollInputOptions): Promise<void> {
	const amount = Math.trunc(options.options.amount);
	await withTargetFocus(options, async () => {
		switch (options.options.direction) {
			case "up":
				postScrollEvent({
					deltaX: 0,
					deltaY: amount,
					targetPid: options.targetPid,
					targetWindow: options.targetWindow,
				});
				return;
			case "down":
				postScrollEvent({
					deltaX: 0,
					deltaY: -amount,
					targetPid: options.targetPid,
					targetWindow: options.targetWindow,
				});
				return;
			case "left":
				postScrollEvent({
					deltaX: -amount,
					deltaY: 0,
					targetPid: options.targetPid,
					targetWindow: options.targetWindow,
				});
				return;
			case "right":
				postScrollEvent({
					deltaX: amount,
					deltaY: 0,
					targetPid: options.targetPid,
					targetWindow: options.targetWindow,
				});
				return;
		}
	});
}

async function withTargetFocus(options: TargetedInputOptions, action: () => Promise<void>): Promise<void> {
	if (options.targetPid === undefined || options.targetWindow === undefined) {
		await action();
		return;
	}
	await runFocusLeasedInput(options.targetWindow, action);
}
