import { describe, expect, it } from "vitest";

import { openMacOSApp } from "./app-open.js";

describe("#given a blocked browser URL #when opening an app #then the request is rejected before launch", () => {
	it("#given Safari and a blocked URL #when openMacOSApp runs #then BLOCKED_URL is thrown", async () => {
		await expect(openMacOSApp("Safari", { url: "https://banking.example.com/login" }, ["*banking*"])).rejects.toThrow(
			expect.objectContaining({ name: "ComputerUseError", code: "BLOCKED_URL" }),
		);
	});
});
