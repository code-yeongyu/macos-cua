import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { SupervisorErrorCode } from "./supervisor.js";

export const DEFAULT_AUDIT_RELATIVE_PATH = ".local/state/macos-cua/computer-use-audit.jsonl";
export const AUDIT_ROTATION_MAX_BYTES = 5 * 1024 * 1024;
export const AUDIT_ROTATION_MAX_SIZE_LABEL = "5MB";
export const AUDIT_ROTATION_FILE_COUNT = 5;
export const MAX_AUDIT_AX_VALUE_LENGTH = 256;

export type AuditStatus = "allowed" | "blocked" | "started" | "succeeded" | "failed";
export type AuditErrorCode = SupervisorErrorCode | "ACTION_FAILED" | "UNKNOWN_ERROR";

export interface AuditTarget {
	readonly app?: string;
	readonly pid?: number;
}

export interface CoordinateTarget {
	readonly x: number;
	readonly y: number;
}

export interface ElementTarget {
	readonly pid: number;
	readonly elementIndex: number;
}

export interface RedactedText {
	readonly redacted: true;
	readonly length: number;
}

export interface RedactedBytes {
	readonly redacted: true;
	readonly byteLength: number;
}

export interface AuditEventInput {
	readonly timestamp: string;
	readonly actionId: string;
	readonly action: string;
	readonly target?: AuditTarget;
	readonly captureId?: string;
	readonly status: AuditStatus;
	readonly errorCode?: AuditErrorCode;
	readonly coordinateTarget?: CoordinateTarget;
	readonly elementTarget?: ElementTarget;
	readonly recoveryHint?: string;
	readonly typedText?: string;
	readonly browserUrl?: string;
	readonly screenshotBytes?: Buffer | Uint8Array | string;
	readonly axValue?: string;
}

export interface AuditEvent {
	readonly timestamp: string;
	readonly actionId: string;
	readonly action: string;
	readonly target?: AuditTarget;
	readonly captureId?: string;
	readonly status: AuditStatus;
	readonly errorCode?: AuditErrorCode;
	readonly coordinateTarget?: CoordinateTarget;
	readonly elementTarget?: ElementTarget;
	readonly recoveryHint?: string;
	readonly typedText?: RedactedText;
	readonly browserUrl?: string;
	readonly screenshotBytes?: RedactedBytes;
	readonly axValue?: string | RedactedText;
}

export interface AuditRotationConfig {
	readonly maxBytes?: number;
	readonly fileCount?: number;
}

export interface JsonlAuditSinkOptions {
	readonly destination?: string;
	readonly rotation?: AuditRotationConfig;
}

interface NormalizedRotationConfig {
	readonly maxBytes: number;
	readonly fileCount: number;
}

export class AuditConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AuditConfigurationError";
	}
}

export class JsonlAuditSink {
	private readonly destination: string;
	private readonly rotation: NormalizedRotationConfig;

	constructor(options: JsonlAuditSinkOptions = {}) {
		this.destination = options.destination ?? defaultAuditPath();
		this.rotation = normalizeRotation(options.rotation);
	}

	async append(event: AuditEvent): Promise<void> {
		const line = `${JSON.stringify(event)}\n`;
		await mkdir(dirname(this.destination), { recursive: true });
		await this.rotateIfNeeded(Buffer.byteLength(line, "utf8"));
		await appendFile(this.destination, line, "utf8");
	}

	private async rotateIfNeeded(incomingBytes: number): Promise<void> {
		const currentBytes = await fileSize(this.destination);
		if (currentBytes + incomingBytes <= this.rotation.maxBytes) {
			return;
		}
		await this.rotateFiles();
	}

	private async rotateFiles(): Promise<void> {
		if (this.rotation.fileCount <= 1) {
			await removeIfExists(this.destination);
			return;
		}

		const lastBackupIndex = this.rotation.fileCount - 1;
		await removeIfExists(rotatedPath(this.destination, lastBackupIndex));
		for (let index = lastBackupIndex - 1; index >= 1; index -= 1) {
			await moveIfExists(rotatedPath(this.destination, index), rotatedPath(this.destination, index + 1));
		}
		await moveIfExists(this.destination, rotatedPath(this.destination, 1));
	}
}

export function defaultAuditPath(homeDirectory: string = homedir()): string {
	return join(homeDirectory, DEFAULT_AUDIT_RELATIVE_PATH);
}

export function createAuditEvent(input: AuditEventInput): AuditEvent {
	return {
		timestamp: input.timestamp,
		actionId: input.actionId,
		action: input.action,
		status: input.status,
		...(input.target !== undefined ? { target: input.target } : {}),
		...(input.captureId !== undefined ? { captureId: input.captureId } : {}),
		...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
		...(input.coordinateTarget !== undefined ? { coordinateTarget: input.coordinateTarget } : {}),
		...(input.elementTarget !== undefined ? { elementTarget: input.elementTarget } : {}),
		...(input.recoveryHint !== undefined ? { recoveryHint: input.recoveryHint } : {}),
		...(input.typedText !== undefined ? { typedText: redactText(input.typedText) } : {}),
		...(input.browserUrl !== undefined ? { browserUrl: redactBrowserQuery(input.browserUrl) } : {}),
		...(input.screenshotBytes !== undefined ? { screenshotBytes: redactBytes(input.screenshotBytes) } : {}),
		...(input.axValue !== undefined ? { axValue: redactAxValue(input.axValue) } : {}),
	};
}

function normalizeRotation(rotation: AuditRotationConfig | undefined): NormalizedRotationConfig {
	const maxBytes = rotation?.maxBytes ?? AUDIT_ROTATION_MAX_BYTES;
	const fileCount = rotation?.fileCount ?? AUDIT_ROTATION_FILE_COUNT;
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
		throw new AuditConfigurationError("Audit rotation maxBytes must be a positive safe integer.");
	}
	if (!Number.isSafeInteger(fileCount) || fileCount < 1) {
		throw new AuditConfigurationError("Audit rotation fileCount must be a positive safe integer.");
	}
	return { maxBytes, fileCount };
}

function redactText(text: string): RedactedText {
	return { redacted: true, length: text.length };
}

function redactBytes(bytes: Buffer | Uint8Array | string): RedactedBytes {
	return {
		redacted: true,
		byteLength: typeof bytes === "string" ? Buffer.byteLength(bytes, "utf8") : bytes.byteLength,
	};
}

function redactAxValue(value: string): string | RedactedText {
	return value.length > MAX_AUDIT_AX_VALUE_LENGTH ? redactText(value) : value;
}

function redactBrowserQuery(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.search = "";
		return parsed.toString();
	} catch (error) {
		if (error instanceof Error) {
			return redactQueryByDelimiter(url);
		}
		throw error;
	}
}

function redactQueryByDelimiter(value: string): string {
	const queryStart = value.indexOf("?");
	if (queryStart === -1) {
		return value;
	}
	const hashStart = value.indexOf("#", queryStart);
	return hashStart === -1 ? value.slice(0, queryStart) : `${value.slice(0, queryStart)}${value.slice(hashStart)}`;
}

async function fileSize(path: string): Promise<number> {
	try {
		return (await stat(path)).size;
	} catch (error) {
		if (isFileNotFound(error)) {
			return 0;
		}
		throw error;
	}
}

async function removeIfExists(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (error) {
		if (isFileNotFound(error)) {
			return;
		}
		throw error;
	}
}

async function moveIfExists(fromPath: string, toPath: string): Promise<void> {
	try {
		await rename(fromPath, toPath);
	} catch (error) {
		if (isFileNotFound(error)) {
			return;
		}
		throw error;
	}
}

function rotatedPath(path: string, index: number): string {
	return `${path}.${index}`;
}

function isFileNotFound(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
