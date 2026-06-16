import type { CodeModeRunResult, ComputerInterface } from "@macos-cua/core";
import type { CodeModeRunner } from "./run-code.js";

export function createCodeModeRunner(computer: ComputerInterface): CodeModeRunner {
	let runner: Promise<CodeModeRunner> | undefined;
	return {
		async run(code: string): Promise<CodeModeRunResult> {
			runner ??= buildRunner(computer);
			return await (await runner).run(code);
		},
	};
}

async function buildRunner(computer: ComputerInterface): Promise<CodeModeRunner> {
	const { CodeModeSandbox, ScreenshotStore, assembleRunResult } = await import("@macos-cua/core");
	const store = new ScreenshotStore();
	const sandbox = new CodeModeSandbox(computer, store);
	return {
		async run(code: string): Promise<CodeModeRunResult> {
			return assembleRunResult(await sandbox.run(code), store);
		},
	};
}
