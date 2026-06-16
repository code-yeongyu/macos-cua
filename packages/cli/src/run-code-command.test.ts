import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sandboxRunMock = vi.hoisted(() => vi.fn());
const closeMock = vi.hoisted(() => vi.fn());
const ensureNodeSnapshotFlagMock = vi.hoisted(() => vi.fn());

vi.mock("@macos-cua/core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@macos-cua/core")>();
	return {
		...actual,
		ensureNodeSnapshotFlag: ensureNodeSnapshotFlagMock,
		MacOSHostComputer: vi.fn(() => ({ close: closeMock })),
		ScreenshotStore: vi.fn(() => ({
			get(id: string) {
				return { data: Buffer.from(`image:${id}`), mimeType: "image/png", width: 2, height: 1 };
			},
		})),
		CodeModeSandbox: vi.fn(() => ({ run: sandboxRunMock })),
	};
});

import { executeRunCode } from "./run-code-command.js";

beforeEach(() => {
	vi.clearAllMocks();
	closeMock.mockResolvedValue(undefined);
	ensureNodeSnapshotFlagMock.mockReturnValue(true);
});

describe("run-code command #given a code-mode script #when executed #then it writes surfaced images to files", () => {
	it("#given surfaced screenshots #when executeRunCode runs #then stdout contains text and paths without base64", async () => {
		const dir = await mkdtemp(join(tmpdir(), "macos-cua-run-code-"));
		const script = join(dir, "script.ts");
		const outDir = join(dir, "out");
		await writeFile(script, "console.log('hello')");
		sandboxRunMock.mockResolvedValue({ logs: ["hello"], result: { ok: true }, surfaced: ["shot_1"] });
		const stdout: string[] = [];

		await executeRunCode(script, { outDir }, { writeStdout: (text) => stdout.push(text) });

		expect(ensureNodeSnapshotFlagMock).toHaveBeenCalledOnce();
		expect(sandboxRunMock).toHaveBeenCalledWith("console.log('hello')");
		expect(closeMock).toHaveBeenCalledOnce();
		expect(await readFile(join(outDir, "surface-0.png"), "utf8")).toBe("image:shot_1");
		const output = stdout.join("");
		expect(output).toContain("hello");
		expect(output).toContain('{"ok":true}');
		expect(output).toContain(join(outDir, "surface-0.png"));
		expect(output).not.toContain(Buffer.from("image:shot_1").toString("base64"));
	});
});
