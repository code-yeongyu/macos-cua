import type { ComputerInterface } from "../computer/interface.js";
import type { AppStateOptions, KeyOptions, Point, ScreenshotOptions } from "../types/index.js";
import type { CodeModeAppState, CodeModeAppTarget } from "./api-surface.js";
import { splitAppState } from "./app-state-split.js";
import { CodeModeError } from "./errors.js";
import { serializeHostError } from "./sandbox-errors.js";
import { findAppMatch, parseHostCall, parseKeyChord } from "./sandbox-parsers.js";
import type {
	CodeModeClickTarget,
	CodeModePointerTarget,
	CodeModeScrollTarget,
	HostFunction,
	HostRpcEnvelope,
	ParsedHostCall,
	ParsedKeyInput,
	ParsedPressOptions,
} from "./sandbox-types.js";
import type { ScreenshotHandle, ScreenshotStore } from "./screenshot-store.js";

const SCROLL_ACTIONS: Record<CodeModeScrollTarget["direction"], string> = {
	up: "AXScrollUpByPage",
	down: "AXScrollDownByPage",
	left: "AXScrollLeftByPage",
	right: "AXScrollRightByPage",
};

export class SandboxRpcHost {
	constructor(
		private readonly computer: ComputerInterface,
		private readonly store: ScreenshotStore,
	) {}

	handler(): HostFunction {
		return async (methodInput: unknown, argsInput: unknown): Promise<HostRpcEnvelope> => {
			try {
				return { ok: true, value: await this.dispatch(parseHostCall(methodInput, argsInput)) };
			} catch (error) {
				return { ok: false, error: serializeHostError(error) };
			}
		};
	}

	private async dispatch(call: ParsedHostCall): Promise<unknown> {
		switch (call.method) {
			case "screenshot":
				return await this.captureScreenshot(call.options);
			case "getAppState":
				return await this.getAppState(call.app, call.options);
			case "listApps":
				return await this.computer.listApps();
			case "click":
				await this.click(call.app, call.target, 1);
				return undefined;
			case "doubleClick":
				await this.click(call.app, call.target, 2);
				return undefined;
			case "rightClick":
				await this.click(call.app, { ...call.target, button: "right" }, 1);
				return undefined;
			case "move":
				await this.withTarget(call.app, async () => this.computer.move(call.point));
				return undefined;
			case "drag":
				await this.withTarget(call.app, async () => this.computer.drag(call.options));
				return undefined;
			case "scroll":
				await this.scroll(call.app, call.target);
				return undefined;
			case "type":
				await this.withTarget(call.app, async () => this.computer.type(call.text));
				return undefined;
			case "pressKeys":
				await this.pressKeys(call.app, call.keys, call.options);
				return undefined;
			case "setValue":
				await this.computer.setValue(await this.resolvePid(call.app), call.elementIndex, call.value);
				return undefined;
			case "selectText":
				await this.computer.selectText(await this.resolvePid(call.app), call.elementIndex, call.options);
				return undefined;
			case "performAction":
				await this.computer.performAction(await this.resolvePid(call.app), call.elementIndex, call.action);
				return undefined;
			case "getCursorPosition":
				return await this.computer.getCursorPosition();
		}
	}

	private async captureScreenshot(options?: ScreenshotOptions): Promise<ScreenshotHandle> {
		return this.store.put(await this.computer.screenshot(options));
	}

	private async getAppState(app?: CodeModeAppTarget, options?: AppStateOptions): Promise<CodeModeAppState> {
		const targetPid = app === undefined ? undefined : await this.resolvePid(app);
		const split = splitAppState(await this.computer.getAppState(targetPid, options));
		return { ...split.structured, screenshot: this.store.put(split.screenshotBytes) };
	}

	private async click(app: CodeModeAppTarget, target: CodeModeClickTarget, count: number): Promise<void> {
		const pid = await this.resolvePid(app);
		if (target.elementIndex !== undefined && (target.button ?? "left") === "left") {
			await this.pressElement(pid, target.elementIndex, count);
			return;
		}
		const point = await this.resolvePoint(pid, target);
		await this.withPid(pid, async () => {
			for (let index = 0; index < count; index += 1) {
				await this.clickButton(target.button ?? "left", point);
			}
		});
	}

	private async scroll(app: CodeModeAppTarget, target: CodeModeScrollTarget): Promise<void> {
		const pid = await this.resolvePid(app);
		const amount = Math.max(1, Math.trunc(target.amount ?? 1));
		if (target.elementIndex !== undefined) {
			for (let index = 0; index < amount; index += 1) {
				await this.computer.performAction(pid, target.elementIndex, SCROLL_ACTIONS[target.direction]);
			}
			return;
		}
		await this.withPid(pid, async () => this.computer.scroll({ direction: target.direction, amount }));
	}

	private async pressKeys(
		app: CodeModeAppTarget,
		keys: readonly ParsedKeyInput[],
		options: ParsedPressOptions,
	): Promise<void> {
		await this.withTarget(app, async () => {
			for (const input of keys) {
				const parsed = parseKeyChord(input.key);
				await this.computer.key(parsed.key, this.keyOptions(parsed.modifiers, input.holdMilliseconds));
				if (options.intervalMs !== undefined) {
					await delay(options.intervalMs);
				}
			}
		});
	}

	private async resolvePoint(pid: number, target: CodeModePointerTarget): Promise<Point> {
		if (target.x !== undefined && target.y !== undefined) {
			return { x: target.x, y: target.y };
		}
		if (target.elementIndex === undefined) {
			throw new CodeModeError("COMPILE_ERROR", "pointer target must include x/y or elementIndex");
		}
		const state = await this.computer.getAppState(pid);
		const element = state.elements.find((candidate) => candidate.id === target.elementIndex);
		if (element === undefined) {
			throw new CodeModeError("COMPILE_ERROR", `Element index ${target.elementIndex} not found`);
		}
		return {
			x: element.frame.x + element.frame.width / 2,
			y: element.frame.y + element.frame.height / 2,
		};
	}

	private async withTarget<T>(app: CodeModeAppTarget, action: () => Promise<T>): Promise<T> {
		return await this.withPid(await this.resolvePid(app), action);
	}

	private async withPid<T>(pid: number, action: () => Promise<T>): Promise<T> {
		this.computer.setTarget(pid);
		try {
			return await action();
		} finally {
			this.computer.setTarget(undefined);
		}
	}

	private async resolvePid(app: CodeModeAppTarget): Promise<number> {
		if (typeof app === "number") {
			return app;
		}
		const normalized = app.trim().toLowerCase();
		if (normalized.length === 0) {
			throw new CodeModeError("COMPILE_ERROR", "app must be a non-empty app name, bundle id, or pid");
		}
		const numericPid = Number(normalized);
		if (Number.isSafeInteger(numericPid) && numericPid > 0) {
			return numericPid;
		}
		const match = findAppMatch(await this.computer.listApps(), normalized);
		if (match === undefined) {
			throw new CodeModeError("COMPILE_ERROR", `No running app matched "${app}"`);
		}
		return match.pid;
	}

	private async pressElement(pid: number, elementIndex: number, count: number): Promise<void> {
		for (let index = 0; index < count; index += 1) {
			await this.computer.performAction(pid, elementIndex, "AXPress");
		}
	}

	private async clickButton(button: NonNullable<CodeModeClickTarget["button"]>, point: Point): Promise<void> {
		switch (button) {
			case "left":
				await this.computer.click(point);
				return;
			case "right":
				await this.computer.rightClick(point);
				return;
			case "middle":
				await this.computer.middleClick(point);
				return;
		}
	}

	private keyOptions(modifiers: NonNullable<KeyOptions["modifiers"]>, holdMilliseconds?: number): KeyOptions {
		return holdMilliseconds === undefined ? { modifiers } : { modifiers, holdMilliseconds };
	}
}

async function delay(ms: number): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
