import { describe, expect, it } from "vitest";

import type { CodeModeError } from "./errors.js";
import { FakeComputer, clearSandboxMocks, importSandbox, resetSandboxModules } from "./sandbox-test-helpers.js";
import { ScreenshotStore } from "./screenshot-store.js";
import { buildCodeModePrompt, transpileModelCode } from "./transpile.js";

describe("transpileModelCode", () => {
	it("#given valid TypeScript model code #when transpiled #then executable JavaScript is returned", async () => {
		const result = await transpileModelCode(`
			const label: string = "Finder";
			const app = await mac.getAppState(label);
			return app.pid satisfies number;
		`);

		expect(result).toMatchObject({ js: expect.any(String) });
		if ("compileError" in result) {
			throw new Error(result.compileError);
		}
		expect(result.js).toContain('const label = "Finder";');
		expect(result.js).toContain("return app.pid;");
	});

	it("#given invalid TypeScript model code #when transpiled #then compileError is returned without throwing", async () => {
		const result = await transpileModelCode("return (");

		expect(result).toEqual({ compileError: expect.stringContaining("Unexpected") });
	});
});

describe("buildCodeModePrompt", () => {
	it("#given the code-mode prompt #when built #then it describes the sandboxed API without Node buffers", () => {
		const prompt = buildCodeModePrompt();

		expect(prompt).toContain("declare const mac");
		expect(prompt).toContain("declare function surface");
		expect(prompt).toContain("mac.");
		expect(prompt).toContain("surface(");
		expect(prompt).toContain("sandbox");
		expect(prompt).toContain("ScreenshotHandle");
		expect(prompt).toContain("Node.js globals are unavailable");
		expect(prompt).not.toContain("Buffer");
	});
});

describe("CodeModeSandbox compile errors", () => {
	it("#given invalid TypeScript #when sandbox run starts #then COMPILE_ERROR is thrown before isolate execution", async () => {
		resetSandboxModules();
		try {
			const { CodeModeSandbox } = await importSandbox();
			const sandbox = new CodeModeSandbox(new FakeComputer(), new ScreenshotStore());

			await expect(sandbox.run("return (")).rejects.toMatchObject({
				name: "CodeModeError",
				code: "COMPILE_ERROR",
			} satisfies Partial<CodeModeError>);
		} finally {
			clearSandboxMocks();
		}
	});
});
