import { describe, expect, it } from "vitest";
import {
	createBatchClient,
	installBatchMcpTestHooks,
	mockedComputer,
	textContent,
	textContents,
} from "./test-support/batch-mcp-client.js";
import { captureFrameFixture } from "./test-support/capture-frame.js";

installBatchMcpTestHooks();

describe("MCP batch tool #given get_app_state then click #when run through the client #then coordinates re-anchor", () => {
	it("#given in-batch app state #when click follows #then it maps through the latest capture frame", async () => {
		const client = await createBatchClient();

		const result = await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "click", app: "Finder", x: 250, y: 200 },
				],
			},
		});

		expect(mockedComputer.getScreenshotViewport).not.toHaveBeenCalled();
		expect(mockedComputer.click).toHaveBeenCalledWith({ x: 800, y: 550 });
		expect(result.content).toEqual(
			expect.arrayContaining([
				{ type: "image", data: Buffer.from("png-bytes").toString("base64"), mimeType: "image/png" },
			]),
		);
		expect(textContents(result).some((text) => text.includes('"screenshotMetadata"'))).toBe(true);
		expect(textContents(result).some((text) => text.includes('"screenshotBase64"'))).toBe(false);
	});

	it("#given a coordinate click count #when AX press succeeds #then it repeats each requested press", async () => {
		mockedComputer.pressAtPosition.mockResolvedValue(true);
		const client = await createBatchClient();

		await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "click", app: "Finder", x: 250, y: 200, click_count: 3 },
				],
			},
		});

		expect(mockedComputer.pressAtPosition).toHaveBeenCalledTimes(3);
		expect(mockedComputer.pressAtPosition).toHaveBeenNthCalledWith(1, 1234, { x: 800, y: 550 });
		expect(mockedComputer.pressAtPosition).toHaveBeenNthCalledWith(2, 1234, { x: 800, y: 550 });
		expect(mockedComputer.pressAtPosition).toHaveBeenNthCalledWith(3, 1234, { x: 800, y: 550 });
		expect(mockedComputer.click).not.toHaveBeenCalled();
	});

	it("#given an out-of-bounds coordinate #when batch runs #then it stops before later actions", async () => {
		const client = await createBatchClient();

		const result = await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "click", app: "Finder", x: 501, y: 200 },
					{ action: "type_text", app: "Finder", text: "should not type" },
				],
			},
		});

		expect(mockedComputer.click).not.toHaveBeenCalled();
		expect(mockedComputer.type).not.toHaveBeenCalled();
		expect(JSON.parse(textContent(result))).toMatchObject({
			ok: false,
			type: "batch",
			actionCount: 3,
			failedStep: 1,
			steps: [
				{ index: 0, action: "get_app_state", status: "success" },
				{ index: 1, action: "click", status: "error" },
			],
		});
	});

	it("#given stale capture metadata #when click falls back to latest viewport #then it surfaces stale-coordinate recovery", async () => {
		const client = await createBatchClient();

		const result = await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{
						action: "click",
						app: "Finder",
						x: 50,
						y: 50,
						capture_id: "old-capture",
						display_epoch: "test-display-1",
					},
					{ action: "type_text", app: "Finder", text: "should not type" },
				],
			},
		});

		expect(mockedComputer.click).not.toHaveBeenCalled();
		expect(mockedComputer.type).not.toHaveBeenCalled();
		expect(JSON.parse(textContent(result))).toMatchObject({
			ok: false,
			type: "batch",
			actionCount: 2,
			failedStep: 0,
			steps: [{ index: 0, action: "click", status: "error", code: "STALE_CAPTURE" }],
		});
	});

	it("#given another app state is cached in-batch #when clicking a different app #then it resolves that app viewport", async () => {
		mockedComputer.getScreenshotViewport.mockResolvedValue(
			captureFrameFixture({ x: 0, y: 0, width: 100, height: 100 }, { width: 100, height: 100 }),
		);
		const client = await createBatchClient();

		await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "click", app: "Terminal", x: 10, y: 20 },
				],
			},
		});

		expect(mockedComputer.getScreenshotViewport).toHaveBeenCalledWith(5678);
		expect(mockedComputer.click).toHaveBeenCalledWith({ x: 10, y: 20 });
	});

	it("#given another app state is cached in-batch #when dragging a different app #then it resolves that app viewport", async () => {
		mockedComputer.getScreenshotViewport.mockResolvedValue(
			captureFrameFixture({ x: 0, y: 0, width: 100, height: 100 }, { width: 100, height: 100 }),
		);
		const client = await createBatchClient();

		await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "drag", app: "Terminal", from_x: 10, from_y: 20, to_x: 50, to_y: 60 },
				],
			},
		});

		expect(mockedComputer.getScreenshotViewport).toHaveBeenCalledWith(5678);
		expect(mockedComputer.drag).toHaveBeenCalledWith({ from: { x: 10, y: 20 }, to: { x: 50, y: 60 } });
	});

	it("#given stale metadata with an in-batch frame #when clicking #then it rejects the stale coordinate", async () => {
		const client = await createBatchClient();

		const result = await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{
						action: "click",
						app: "Finder",
						x: 250,
						y: 200,
						capture_id: "old-capture",
						display_epoch: "test-display-1",
					},
					{ action: "type_text", app: "Finder", text: "should not type" },
				],
			},
		});

		expect(mockedComputer.click).not.toHaveBeenCalled();
		expect(mockedComputer.type).not.toHaveBeenCalled();
		expect(JSON.parse(textContent(result))).toMatchObject({
			ok: false,
			type: "batch",
			actionCount: 3,
			failedStep: 1,
			steps: [
				{ index: 0, action: "get_app_state", status: "success" },
				{ index: 1, action: "click", status: "error", code: "STALE_CAPTURE" },
			],
		});
	});

	it("#given an in-batch app state #when zooming a region #then batch returns the zoom crop", async () => {
		const client = await createBatchClient();

		const result = await client.callTool({
			name: "batch",
			arguments: {
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "zoom", app: "Finder", region: { x: 10, y: 20, width: 30, height: 40 } },
				],
			},
		});

		expect(mockedComputer.screenshot).toHaveBeenCalledWith({ region: { x: 320, y: 190, width: 60, height: 80 } });
		expect(result.content).toEqual(
			expect.arrayContaining([
				{ type: "image", data: Buffer.from("png-bytes").toString("base64"), mimeType: "image/png" },
			]),
		);
		expect(textContents(result).some((text) => text.includes("zoom numbers are element_index values"))).toBe(true);
	});
});
