import { CodeModeError } from "./errors.js";
import type { SerializedHostError } from "./sandbox-types.js";

export function serializeHostError(error: unknown): SerializedHostError {
	if (error instanceof CodeModeError) {
		return { name: error.name, message: error.message, code: error.code };
	}
	if (error instanceof Error) {
		const codeValue = errorCode(error);
		if (codeValue !== undefined) {
			return { name: error.name, message: error.message, code: codeValue };
		}
		return { name: error.name, message: error.message };
	}
	return { name: "Error", message: String(error) };
}

export function withTimeout<T>(operation: Promise<T>, timeoutMs: number, dispose: () => void): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			dispose();
			reject(new CodeModeError("RUN_TIMEOUT", `Code mode run exceeded ${timeoutMs}ms`));
		}, timeoutMs);
	});
	return Promise.race([operation, timeout]).finally(() => {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	});
}

export function formatLog(args: readonly unknown[]): string {
	return args.map(formatLogValue).join(" ");
}

export function readHandleId(value: unknown): string {
	if (isRecord(value) && typeof value["id"] === "string") {
		return value["id"];
	}
	throw new CodeModeError("COMPILE_ERROR", "surface expects a screenshot handle");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function formatLogValue(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value) ?? String(value);
	} catch (error) {
		if (error instanceof TypeError) {
			return String(value);
		}
		throw error;
	}
}

function errorCode(error: Error): string | undefined {
	if (!isRecord(error)) {
		return undefined;
	}
	const codeValue = error["code"];
	return typeof codeValue === "string" ? codeValue : undefined;
}
