import { describe, expect, it } from "vitest";
import { mcpBatchSchema } from "./batch-tool-schema.js";

const getAppStateAction = { action: "get_app_state", app: "Finder" } as const;

describe("MCP batch schema #given action limits #when parsing #then it matches discrete batch bounds", () => {
	it("#given twenty actions #when parsing #then it accepts the batch", () => {
		const result = mcpBatchSchema.safeParse({ actions: Array.from({ length: 20 }, () => getAppStateAction) });

		expect(result.success).toBe(true);
	});

	it("#given twenty-one actions #when parsing #then it rejects the batch", () => {
		const result = mcpBatchSchema.safeParse({ actions: Array.from({ length: 21 }, () => getAppStateAction) });

		expect(result.success).toBe(false);
	});

	it("#given list_apps inside a batch #when parsing #then it is rejected", () => {
		const result = mcpBatchSchema.safeParse({ actions: [{ action: "list_apps" }] });

		expect(result.success).toBe(false);
	});

	it("#given a zoom action #when parsing #then it is available in MCP batch", () => {
		const result = mcpBatchSchema.safeParse({
			actions: [{ action: "zoom", app: "Finder", region: { x: 10, y: 20, width: 30, height: 40 } }],
		});

		expect(result.success).toBe(true);
	});
});
