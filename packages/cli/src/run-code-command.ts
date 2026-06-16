import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	CodeModeError,
	CodeModeSandbox,
	MacOSHostComputer,
	ScreenshotStore,
	assembleRunResult,
	ensureNodeSnapshotFlag,
} from "@macos-cua/core";
import type { CodeModeRunResult } from "@macos-cua/core";
import type { Command } from "commander";

type RunCodeCommandOptions = {
	readonly outDir?: string;
};

type RunCodeIo = {
	readonly writeStdout: (text: string) => void;
};

const NOOP_OVERLAY = {
	set(): void {},
	highlight(): void {},
	hide(): void {},
	close(): void {},
};

export function registerRunCodeCommand(program: Command): void {
	program
		.command("run-code")
		.description("Run TypeScript code-mode script against the local macOS computer")
		.argument("<file>", "TypeScript file to execute")
		.option("--out-dir <path>", "directory for surfaced image files")
		.action(async (file: string, options: RunCodeCommandOptions) => {
			await executeRunCode(file, options, { writeStdout: (text) => process.stdout.write(text) });
		});
}

export async function executeRunCode(file: string, options: RunCodeCommandOptions, io: RunCodeIo): Promise<void> {
	try {
		const result = await runCode(await readFile(file, "utf8"));
		await writeRunCodeOutput(file, options, result, io);
	} catch (error) {
		if (error instanceof CodeModeError) {
			throw new Error(`${error.code}: ${error.message}`, { cause: error });
		}
		throw error;
	}
}

async function runCode(source: string): Promise<CodeModeRunResult> {
	ensureNodeSnapshotFlag();
	const computer = new MacOSHostComputer({ overlay: NOOP_OVERLAY });
	try {
		const store = new ScreenshotStore();
		const sandbox = new CodeModeSandbox(computer, store);
		return assembleRunResult(await sandbox.run(source), store);
	} finally {
		await computer.close();
	}
}

async function writeRunCodeOutput(
	file: string,
	options: RunCodeCommandOptions,
	result: CodeModeRunResult,
	io: RunCodeIo,
): Promise<void> {
	const outDir = options.outDir ?? dirname(file);
	await mkdir(outDir, { recursive: true });
	if (result.text.length > 0) {
		io.writeStdout(`${result.text}\n`);
	}
	for (const [index, image] of result.images.entries()) {
		const path = join(outDir, `surface-${index}.${extensionForMimeType(image.mimeType)}`);
		await writeFile(path, image.data);
		io.writeStdout(`${path}\n`);
	}
}

function extensionForMimeType(mimeType: CodeModeRunResult["images"][number]["mimeType"]): "png" | "jpeg" {
	return mimeType === "image/png" ? "png" : "jpeg";
}
