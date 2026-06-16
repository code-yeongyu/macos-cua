import type { ComputerInterface, ScreenshotOptions } from "@macos-cua/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { ToolResult } from "./tool-result.js";

const rectSchema = z.object({
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
});

const screenshotSchema = z.object({
	region: rectSchema.optional(),
	format: z.enum(["png", "jpeg"]).optional(),
	quality: z.number().int().min(1).max(100).optional(),
});

export function registerScreenshotTool(server: McpServer, computer: ComputerInterface): void {
	server.registerTool(
		"screenshot",
		{
			description: "Capture a screenshot and return it as an image content block.",
			inputSchema: screenshotSchema,
		},
		async ({ region, format, quality }): Promise<ToolResult> => {
			const options: ScreenshotOptions = {
				...(region === undefined ? {} : { region }),
				...(format === undefined ? {} : { format }),
				...(quality === undefined ? {} : { quality }),
			};
			const result = await computer.screenshot(options);
			return {
				content: [{ type: "image", data: result.data.toString("base64"), mimeType: result.mimeType }],
			};
		},
	);
}
