import { describe, expect, it } from "vitest";
import { formatActionTrace } from "./action-trace.js";

describe("#given sensitive code-mode arguments #when formatting action trace #then private payloads are redacted", () => {
	it("#given typed text #when tracing mac.type #then the text is not included", () => {
		const trace = formatActionTrace({ method: "type", app: "Safari", text: "secret password" });

		expect(trace).toBe('mac.type("Safari", <text>)');
		expect(trace).not.toContain("secret password");
	});

	it("#given setValue text #when tracing mac.setValue #then the value is not included", () => {
		const trace = formatActionTrace({
			method: "setValue",
			app: "Safari",
			elementIndex: 7,
			value: "private@example.com",
		});

		expect(trace).toBe('mac.setValue("Safari", #7)');
		expect(trace).not.toContain("private@example.com");
	});

	it("#given openApp URL options #when tracing mac.openApp #then the URL is not included", () => {
		const trace = formatActionTrace({
			method: "openApp",
			appName: "Safari",
			options: { url: "https://search.brave.com/search?q=private+query" },
		});

		expect(trace).toBe('mac.openApp("Safari")');
		expect(trace).not.toContain("private+query");
	});
});
