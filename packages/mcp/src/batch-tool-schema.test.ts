import { describe, expect, it } from "vitest";
import { mcpBatchSchema } from "./batch-tool-schema.js";

const listAppsAction = { action: "list_apps" } as const;

describe("MCP batch schema #given action limits #when parsing #then it matches discrete batch bounds", () => {
	it("#given twenty actions #when parsing #then it accepts the batch", () => {
		const result = mcpBatchSchema.safeParse({ actions: Array.from({ length: 20 }, () => listAppsAction) });

		expect(result.success).toBe(true);
	});

	it("#given twenty-one actions #when parsing #then it rejects the batch", () => {
		const result = mcpBatchSchema.safeParse({ actions: Array.from({ length: 21 }, () => listAppsAction) });

		expect(result.success).toBe(false);
	});

	it("#given a zoom action #when parsing #then it is available in MCP batch", () => {
		const result = mcpBatchSchema.safeParse({
			actions: [{ action: "zoom", app: "Finder", region: { x: 10, y: 20, width: 30, height: 40 } }],
		});

		expect(result.success).toBe(true);
	});
});
