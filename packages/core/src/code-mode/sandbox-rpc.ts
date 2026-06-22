import type { AppInfo } from "../accessibility/types.js";
import { resolveScreenPoint } from "../computer/coordinate.js";
import type { ComputerInterface } from "../computer/interface.js";
import { executePointerClick } from "../computer/pointer-action.js";
import { executeScrollAction } from "../computer/scroll-action.js";
import { executeTypeTextAction } from "../computer/type-text-action.js";
import type { AppOpenOptions, AppStateOptions, KeyOptions, Point, ScreenshotOptions } from "../types/index.js";
import { formatActionTrace } from "./action-trace.js";
import type { CodeModeActionMethod, CodeModeActionResult, CodeModeAppState, CodeModeAppTarget } from "./api-surface.js";
import { getAppStateWithWindowRetry } from "./app-state-retry.js";
import { capturePostActionObservation, toCodeModeAppState } from "./capture-metadata.js";
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

export class SandboxRpcHost {
	private appCache: readonly AppInfo[] | undefined;

	constructor(
		private readonly computer: ComputerInterface,
		private readonly store: ScreenshotStore,
		private readonly actions: string[] = [],
	) {}

	handler(): HostFunction {
		return async (methodInput: unknown, argsInput: unknown): Promise<HostRpcEnvelope> => {
			try {
				const call = parseHostCall(methodInput, argsInput);
				const value = await this.dispatch(call);
				this.actions.push(formatActionTrace(call));
				return { ok: true, value };
			} catch (error) {
				return { ok: false, error: serializeHostError(error) };
			}
		};
	}

	private async dispatch(call: ParsedHostCall): Promise<unknown> {
		switch (call.method) {
			case "screenshot":
				return await this.captureScreenshot(call.options);
			case "openApp":
				return await this.openApp(call.appName, call.options);
			case "getAppState":
				return await this.getAppState(call.app, call.options);
			case "listApps":
				return await this.listApps();
			case "click":
				return await this.click(call.app, call.target, 1);
			case "doubleClick":
				return await this.click(call.app, call.target, 2);
			case "rightClick":
				return await this.click(call.app, { ...call.target, button: "right" }, 1);
			case "move":
				return await this.move(call.app, call.point);
			case "drag":
				return await this.drag(call.app, call.options);
			case "scroll":
				return await this.scroll(call.app, call.target);
			case "type":
				return await this.type(call.app, call.text);
			case "pressKeys":
				return await this.pressKeys(call.app, call.keys, call.options);
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

	private async openApp(appName: string, options?: AppOpenOptions): Promise<AppInfo> {
		const app = await this.computer.openApp(appName, options);
		this.rememberApp(app);
		return app;
	}

	private async getAppState(app?: CodeModeAppTarget, options?: AppStateOptions): Promise<CodeModeAppState> {
		const targetPid = app === undefined ? undefined : await this.resolvePid(app);
		return toCodeModeAppState(await getAppStateWithWindowRetry(this.computer, targetPid, options), this.store);
	}

	private async click(
		app: CodeModeAppTarget,
		target: CodeModeClickTarget,
		count: number,
	): Promise<CodeModeActionResult> {
		const pid = await this.resolvePid(app);
		const result = await executePointerClick(this.computer, {
			actionId: `code-mode-click:${pid}`,
			targetPid: pid,
			target,
			pressCount: count,
			observeAfter: false,
		});
		return await this.actionResult(result.actionId, result.method);
	}

	private async move(app: CodeModeAppTarget, point: Point): Promise<CodeModeActionResult> {
		const pid = await this.resolvePid(app);
		const screenPoint = await this.resolvePoint(pid, point);
		await this.withPid(pid, async () => this.computer.move(screenPoint));
		return await this.actionResult(`code-mode-move:${pid}`, "move");
	}

	private async drag(
		app: CodeModeAppTarget,
		options: { readonly from: Point; readonly to: Point },
	): Promise<CodeModeActionResult> {
		const pid = await this.resolvePid(app);
		const dragOptions = {
			from: await this.resolvePoint(pid, options.from),
			to: await this.resolvePoint(pid, options.to),
		};
		await this.withPid(pid, async () => this.computer.drag(dragOptions));
		return await this.actionResult(`code-mode-drag:${pid}`, "drag");
	}

	private async scroll(app: CodeModeAppTarget, target: CodeModeScrollTarget): Promise<CodeModeActionResult> {
		const pid = await this.resolvePid(app);
		await executeScrollAction(this.computer, {
			targetPid: pid,
			direction: target.direction,
			pages: target.amount ?? 1,
			...(target.elementIndex === undefined ? {} : { elementIndex: target.elementIndex }),
		});
		return await this.actionResult(`code-mode-scroll:${pid}`, "scroll");
	}

	private async type(app: CodeModeAppTarget, text: string): Promise<CodeModeActionResult> {
		const pid = await this.resolvePid(app);
		await executeTypeTextAction(this.computer, { targetPid: pid, text });
		return await this.actionResult(`code-mode-type:${pid}`, "type");
	}

	private async pressKeys(
		app: CodeModeAppTarget,
		keys: readonly ParsedKeyInput[],
		options: ParsedPressOptions,
	): Promise<CodeModeActionResult> {
		const pid = await this.resolvePid(app);
		await this.withPid(pid, async () => {
			for (const input of keys) {
				const parsed = parseKeyChord(input.key);
				await this.computer.key(parsed.key, this.keyOptions(parsed.modifiers, input.holdMilliseconds));
				if (options.intervalMs !== undefined) {
					await delay(options.intervalMs);
				}
			}
		});
		return await this.actionResult(`code-mode-press-keys:${pid}`, "pressKeys");
	}

	private async resolvePoint(pid: number, target: CodeModePointerTarget): Promise<Point> {
		if (target.x !== undefined && target.y !== undefined) {
			const point =
				target.captureId === undefined || target.displayEpoch === undefined
					? { x: target.x, y: target.y }
					: { x: target.x, y: target.y, captureId: target.captureId, displayEpoch: target.displayEpoch };
			return await resolveScreenPoint(this.computer, pid, point);
		}
		if (target.elementIndex === undefined) {
			throw new CodeModeError("COMPILE_ERROR", "pointer target must include x/y or elementIndex");
		}
		const state = await this.computer.getAppState(pid);
		const element = state.elements.find((candidate) => candidate.id === target.elementIndex);
		if (element === undefined) {
			throw new CodeModeError("COMPILE_ERROR", `Element index ${target.elementIndex} not found`);
		}
		return await resolveScreenPoint(this.computer, pid, {
			x: element.frame.x + element.frame.width / 2,
			y: element.frame.y + element.frame.height / 2,
		});
	}

	private async actionResult(actionId: string, method: CodeModeActionMethod): Promise<CodeModeActionResult> {
		return {
			actionId,
			method,
			postAction: await capturePostActionObservation(this.computer, this.store),
		};
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
		const match =
			findAppMatch(await this.listApps(), normalized) ?? findAppMatch(await this.refreshApps(), normalized);
		if (match === undefined) {
			throw new CodeModeError("COMPILE_ERROR", `No running app matched "${app}"`);
		}
		return match.pid;
	}

	private async listApps(): Promise<readonly AppInfo[]> {
		this.appCache ??= await this.computer.listApps();
		return this.appCache;
	}

	private async refreshApps(): Promise<readonly AppInfo[]> {
		this.appCache = await this.computer.listApps();
		return this.appCache;
	}

	private rememberApp(app: AppInfo): void {
		const apps = this.appCache ?? [];
		this.appCache = [...apps.filter((candidate) => candidate.pid !== app.pid), app];
	}

	private keyOptions(modifiers: NonNullable<KeyOptions["modifiers"]>, holdMilliseconds?: number): KeyOptions {
		return holdMilliseconds === undefined ? { modifiers } : { modifiers, holdMilliseconds };
	}
}

async function delay(ms: number): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
