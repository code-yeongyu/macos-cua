import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	AUDIT_ROTATION_FILE_COUNT,
	AUDIT_ROTATION_MAX_BYTES,
	AUDIT_ROTATION_MAX_SIZE_LABEL,
	DEFAULT_AUDIT_RELATIVE_PATH,
	JsonlAuditSink,
	createAuditEvent,
	defaultAuditPath,
} from "./audit.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "macos-cua-audit-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("#given untrusted audit details #when creating an audit event #then sensitive values are redacted", () => {
	it("redacts typed text, browser query strings, screenshot bytes, and large AX values", () => {
		// given
		const screenshotBytes = Buffer.from("not safe image bytes");
		const largeAxValue = "private AX value ".repeat(40);

		// when
		const event = createAuditEvent({
			timestamp: "2026-06-18T00:00:00.000Z",
			actionId: "act-redact",
			action: "type",
			target: { app: "Safari", pid: 5151 },
			captureId: "capture-1",
			status: "failed",
			errorCode: "ACTION_FAILED",
			elementTarget: { pid: 5151, elementIndex: 8 },
			typedText: "secret password text",
			browserUrl: "https://example.test/search?q=secret-token&safe=0#result",
			screenshotBytes,
			axValue: largeAxValue,
			recoveryHint: "Retry after selecting a safe field.",
		});

		// then
		const serialized = JSON.stringify(event);
		expect(serialized).not.toContain("secret password text");
		expect(serialized).not.toContain("secret-token");
		expect(serialized).not.toContain("not safe image bytes");
		expect(serialized).not.toContain(largeAxValue);
		expect(event.typedText).toEqual({ redacted: true, length: 20 });
		expect(event.browserUrl).toBe("https://example.test/search#result");
		expect(event.screenshotBytes).toEqual({ redacted: true, byteLength: screenshotBytes.byteLength });
		expect(event.axValue).toEqual({ redacted: true, length: largeAxValue.length });
		expect(event.elementTarget).toEqual({ pid: 5151, elementIndex: 8 });
	});
});

describe("#given the default audit destination #when reading audit defaults #then path and rotation match the contract", () => {
	it("uses the macos-cua state path and 5MB x 5 rotation defaults", () => {
		expect(DEFAULT_AUDIT_RELATIVE_PATH).toBe(".local/state/macos-cua/computer-use-audit.jsonl");
		expect(defaultAuditPath("/Users/tester")).toBe("/Users/tester/.local/state/macos-cua/computer-use-audit.jsonl");
		expect(AUDIT_ROTATION_MAX_BYTES).toBe(5 * 1024 * 1024);
		expect(AUDIT_ROTATION_MAX_SIZE_LABEL).toBe("5MB");
		expect(AUDIT_ROTATION_FILE_COUNT).toBe(5);
	});
});

describe("#given an audit sink with a small rotation limit #when appending past the limit #then it rotates bounded files", () => {
	it("writes JSONL and keeps rotated files within the configured count", async () => {
		// given
		const directory = await createTemporaryDirectory();
		const destination = join(directory, "computer-use-audit.jsonl");
		await writeFile(destination, `${"x".repeat(60)}\n`, "utf8");
		const sink = new JsonlAuditSink({
			destination,
			rotation: { maxBytes: 64, fileCount: 3 },
		});
		const event = createAuditEvent({
			timestamp: "2026-06-18T00:00:00.000Z",
			actionId: "act-write",
			action: "click",
			target: { app: "Finder", pid: 101 },
			status: "allowed",
		});

		// when
		await sink.append(event);

		// then
		const active = await readFile(destination, "utf8");
		const rotated = await readFile(`${destination}.1`, "utf8");
		await expect(stat(`${destination}.3`)).rejects.toMatchObject({ code: "ENOENT" });
		expect(active).toContain('"actionId":"act-write"');
		expect(rotated).toContain("xxxxxxxx");
	});
});
