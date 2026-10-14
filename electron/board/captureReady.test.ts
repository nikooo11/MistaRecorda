import { describe, expect, test, vi } from "vitest";
import { ensureDrawingSurfaceReady } from "./captureReady";
describe("drawing capture startup", () => {
	const setup = () => ({
		enabled: () => true,
		prepare: vi.fn().mockResolvedValue(undefined),
		show: vi.fn(),
		waitForCanvas: vi.fn().mockResolvedValue(undefined),
		recover: vi.fn().mockResolvedValue(undefined),
	});
	test("plain capture does not wait for an unused drawing window", async () => {
		const ops = setup();
		ops.enabled = () => false;
		await ensureDrawingSurfaceReady(ops);
		expect(ops.prepare).not.toHaveBeenCalled();
	});
	test("shows the clean surface before waiting for its first rendered canvas", async () => {
		const order: string[] = [];
		const ops = setup();
		ops.prepare.mockImplementation(async () => {
			order.push("prepare");
		});
		ops.show.mockImplementation(() => {
			order.push("show");
		});
		ops.waitForCanvas.mockImplementation(async () => {
			order.push("paint");
		});
		await ensureDrawingSurfaceReady(ops);
		expect(order).toEqual(["prepare", "show", "paint"]);
		expect(ops.recover).not.toHaveBeenCalled();
	});
	test("recovers a stale renderer once, then waits before capture", async () => {
		const ops = setup();
		ops.waitForCanvas.mockRejectedValueOnce(Error("stale renderer"));
		await ensureDrawingSurfaceReady(ops);
		expect(ops.recover).toHaveBeenCalledTimes(1);
		expect(ops.waitForCanvas).toHaveBeenCalledTimes(2);
		expect(ops.show).toHaveBeenCalledTimes(2);
	});
	test("does not silently omit drawings if recovery fails", async () => {
		const ops = setup();
		ops.waitForCanvas.mockRejectedValue(Error("not ready"));
		await expect(ensureDrawingSurfaceReady(ops)).rejects.toThrow("not ready");
		expect(ops.recover).toHaveBeenCalledTimes(1);
	});
});

import { captureWindowId } from "./captureReady";
test("uses the native window ID independently of a mutable page title", () => {
	expect(captureWindowId("window:1324:0")).toBe(1324);
});
test.each([
	"screen:1:0",
	"window:0:0",
	"window:NaN:0",
	"window:4294967296:0",
])("rejects invalid surface identifier %s", (id) => {
	expect(() => captureWindowId(id)).toThrow();
});
