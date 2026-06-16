import { describe, expect, it } from "vitest";
import { toAgentToolErrorResult, toAgentToolResult } from "./run-result.js";

describe("code-mode run result #given surfaced images #when mapped #then Pi content shape is preserved", () => {
	it("#given image results #when mapped #then images precede text and no base64 appears in text", () => {
		const result = toAgentToolResult({
			images: [
				{ data: Buffer.from("first"), mimeType: "image/png" },
				{ data: Buffer.from("second"), mimeType: "image/jpeg" },
			],
			text: "done",
		});

		expect(result.content).toEqual([
			{ type: "image", data: Buffer.from("first").toString("base64"), mimeType: "image/png" },
			{ type: "image", data: Buffer.from("second").toString("base64"), mimeType: "image/jpeg" },
			{ type: "text", text: "done" },
		]);
		const text = result.content.find((entry) => entry.type === "text");
		expect(text).toEqual({ type: "text", text: "done" });
		expect(text?.text).not.toContain(Buffer.from("first").toString("base64"));
	});
});

describe("code-mode run result #given CodeModeError #when mapped #then coded text is returned", () => {
	it("#given a coded error #when mapped #then exactly one text block is returned", () => {
		const error = new Error("bad code");
		error.name = "CodeModeError";
		Object.defineProperty(error, "code", { value: "COMPILE_ERROR" });

		expect(toAgentToolErrorResult(error).content).toEqual([{ type: "text", text: "COMPILE_ERROR: bad code" }]);
	});
});
