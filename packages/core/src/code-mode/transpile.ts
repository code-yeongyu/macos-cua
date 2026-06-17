import { CODE_MODE_API_DTS } from "./api-surface.js";

export type TranspileModelCodeResult =
	| { readonly js: string; readonly compileError?: never }
	| { readonly compileError: string; readonly js?: never };

const CODE_MODE_SOURCE_FILE = "code-mode-run.ts";

export async function transpileModelCode(ts: string): Promise<TranspileModelCodeResult> {
	const esbuild = await import("esbuild");
	try {
		const result = await esbuild.transform(wrapModelCodeForTranspile(ts), {
			format: "cjs",
			legalComments: "none",
			loader: "ts",
			logLevel: "silent",
			sourcefile: CODE_MODE_SOURCE_FILE,
			target: "es2022",
		});
		return { js: result.code };
	} catch (error) {
		if (isEsbuildTransformFailure(error)) {
			return { compileError: formatCompileError(error) };
		}
		throw error;
	}
}

export function buildCodeModePrompt(): string {
	return [
		"You are writing TypeScript code that runs in a macOS computer-use sandbox.",
		"Use the global `mac` API for macOS actions and call `surface(handle)` to show screenshot handles.",
		"Call methods as `mac.screenshot(...)`, `mac.getAppState(...)`, and other `mac.*` API operations.",
		"Return the final result from the code. Await async calls directly.",
		"Pointer x/y coordinates are pixels in the latest app screenshot; the host maps them onto the app window.",
		"Sandbox rules: no imports, filesystem access, network access, subprocesses, or timers for waiting.",
		"Node.js globals are unavailable.",
		"ScreenshotHandle values are opaque handles: pass them to `surface(handle)`; do not decode image bytes.",
		"Available API declarations:",
		"```ts",
		CODE_MODE_API_DTS.trim(),
		"```",
	].join("\n");
}

function wrapModelCodeForTranspile(ts: string): string {
	return `const __codeModeUserMain = async (): Promise<unknown> => {
${ts}
};
return __codeModeUserMain();
`;
}

type EsbuildTransformFailure = Error & {
	readonly errors: readonly EsbuildMessage[];
};

type EsbuildMessage = {
	readonly text: string;
};

function formatCompileError(error: EsbuildTransformFailure): string {
	const firstError = error.errors[0];
	if (firstError !== undefined) {
		return firstError.text;
	}
	return error.message;
}

function isEsbuildTransformFailure(error: unknown): error is EsbuildTransformFailure {
	if (!(error instanceof Error) || !isRecord(error)) {
		return false;
	}
	const errors = error["errors"];
	return Array.isArray(errors) && errors.every(isEsbuildMessage);
}

function isEsbuildMessage(value: unknown): value is EsbuildMessage {
	return isRecord(value) && typeof value["text"] === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
