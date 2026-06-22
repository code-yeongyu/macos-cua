import type { AppInfo } from "../accessibility/types.js";
import type {
	AppOpenOptions,
	AppStateOptions,
	DragOptions,
	KeyOptions,
	Point,
	ScreenshotOptions,
	ScrollOptions,
	SelectTextOptions,
} from "../types/index.js";
import type { CodeModeAppState, CodeModeAppTarget } from "./api-surface.js";
import type { ScreenshotHandle } from "./screenshot-store.js";

export const DEFAULT_MEMORY_MB = 128;
export const DEFAULT_TIMEOUT_MS = 120_000;

export type CodeModeMethodName =
	| "screenshot"
	| "openApp"
	| "getAppState"
	| "listApps"
	| "click"
	| "doubleClick"
	| "rightClick"
	| "move"
	| "drag"
	| "scroll"
	| "type"
	| "pressKeys"
	| "setValue"
	| "selectText"
	| "performAction"
	| "getCursorPosition";

export type SandboxRunResult = {
	readonly logs: readonly string[];
	readonly result: unknown;
	readonly surfaced: readonly string[];
	readonly actions: readonly string[];
};

export type SandboxOptions = {
	readonly memoryMb?: number;
	readonly timeoutMs?: number;
};

export type SerializedHostError = {
	readonly name: string;
	readonly message: string;
	readonly code?: string;
	readonly recoveryHint?: string;
};

export type HostRpcEnvelope =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly error: SerializedHostError };

export type HostFunction = (...args: readonly unknown[]) => unknown;

export type ReferenceLike = {
	applySyncPromise(receiver?: unknown, args?: readonly unknown[], options?: unknown): unknown;
};

export type ContextLike = {
	readonly global: {
		set(name: string, value: unknown, options?: unknown): Promise<void>;
	};
};

export type ScriptLike = {
	run(
		context: ContextLike,
		options: { readonly timeout: number; readonly promise: true; readonly copy: true; readonly release: true },
	): Promise<unknown>;
};

export type IsolateLike = {
	createContext(): Promise<ContextLike>;
	compileScript(code: string, options?: { readonly filename: string }): Promise<ScriptLike>;
	dispose(): void;
};

export type IsolatedVmModule = {
	readonly Isolate: new (options: { readonly memoryLimit: number }) => IsolateLike;
	readonly Reference: new (value: HostFunction) => ReferenceLike;
};

export type CodeModePointerTarget = {
	readonly x?: number;
	readonly y?: number;
	readonly elementIndex?: number;
	readonly captureId?: string;
	readonly displayEpoch?: string;
};

export type CodeModeClickTarget = CodeModePointerTarget & {
	readonly button?: "left" | "right" | "middle";
};

export type CodeModeScrollTarget = {
	readonly direction: ScrollOptions["direction"];
	readonly amount?: number;
	readonly elementIndex?: number;
};

export type ParsedKeyInput = {
	readonly key: string;
	readonly holdMilliseconds?: number;
};

export type ParsedPressOptions = {
	readonly intervalMs?: number;
};

export type ParsedKeyChord = {
	readonly key: string;
	readonly modifiers: NonNullable<KeyOptions["modifiers"]>;
};

export type ParsedHostCall =
	| { readonly method: "screenshot"; readonly options?: ScreenshotOptions }
	| { readonly method: "openApp"; readonly appName: string; readonly options?: AppOpenOptions }
	| { readonly method: "getAppState"; readonly app?: CodeModeAppTarget; readonly options?: AppStateOptions }
	| { readonly method: "listApps" }
	| { readonly method: "click"; readonly app: CodeModeAppTarget; readonly target: CodeModeClickTarget }
	| { readonly method: "doubleClick"; readonly app: CodeModeAppTarget; readonly target: CodeModePointerTarget }
	| { readonly method: "rightClick"; readonly app: CodeModeAppTarget; readonly target: CodeModePointerTarget }
	| { readonly method: "move"; readonly app: CodeModeAppTarget; readonly point: Point }
	| { readonly method: "drag"; readonly app: CodeModeAppTarget; readonly options: DragOptions }
	| { readonly method: "scroll"; readonly app: CodeModeAppTarget; readonly target: CodeModeScrollTarget }
	| { readonly method: "type"; readonly app: CodeModeAppTarget; readonly text: string }
	| {
			readonly method: "pressKeys";
			readonly app: CodeModeAppTarget;
			readonly keys: readonly ParsedKeyInput[];
			readonly options: ParsedPressOptions;
	  }
	| {
			readonly method: "setValue";
			readonly app: CodeModeAppTarget;
			readonly elementIndex: number;
			readonly value: string;
	  }
	| {
			readonly method: "selectText";
			readonly app: CodeModeAppTarget;
			readonly elementIndex: number;
			readonly options: SelectTextOptions;
	  }
	| {
			readonly method: "performAction";
			readonly app: CodeModeAppTarget;
			readonly elementIndex: number;
			readonly action: string;
	  }
	| { readonly method: "getCursorPosition" };

export type HostDispatchResult = ScreenshotHandle | CodeModeAppState | AppInfo | readonly AppInfo[] | Point | undefined;
