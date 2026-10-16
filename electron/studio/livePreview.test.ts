import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
type PreviewChild = EventEmitter & {
	stdout: EventEmitter;
	stderr: { resume: ReturnType<typeof vi.fn> };
	stdin: EventEmitter & { end: ReturnType<typeof vi.fn> };
	kill: ReturnType<typeof vi.fn>;
};
const host = vi.hoisted(() => ({ children: [] as PreviewChild[] }));
vi.mock("../ipc/paths/binaries", () => ({
	getNativeArchTag: () => "darwin-arm64",
	resolveUnpackedAppPath: (...parts: string[]) => parts.join("/"),
}));
vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => {
		const child = Object.assign(new EventEmitter(), {
			stdout: new EventEmitter(),
			stderr: { resume: vi.fn() },
			stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
			kill: vi.fn(),
		});
		host.children.push(child);
		return child;
	}),
}));
import { PreviewFrames, StudioLivePreview } from "./livePreview";
const packet = (text: string) => {
	const data = Buffer.from(text),
		header = Buffer.alloc(4);
	header.writeUInt32BE(data.length);
	return Buffer.concat([header, data]);
};
afterEach(() => {
	host.children = [];
	vi.useRealTimers();
});
test("handles partial binary frames and only delivers the most recent complete frame", () => {
	const frames = new PreviewFrames(),
		bytes = packet("one");
	expect(frames.push(bytes.subarray(0, 5))).toBeUndefined();
	expect(frames.push(Buffer.concat([bytes.subarray(5), packet("two")]))).toBe(
		`data:image/jpeg;base64,${Buffer.from("two").toString("base64")}`,
	);
	const malicious = Buffer.alloc(4);
	malicious.writeUInt32BE(20 * 1024 * 1024);
	expect(() => frames.push(malicious)).toThrow("Invalid preview frame");
});
test("shares capture, discards old-source frames and releases idle consumers", () => {
	vi.useFakeTimers();
	const preview = new StudioLivePreview(),
		target = { displayId: 1, board: false };
	preview.read(target);
	preview.read(target);
	expect(host.children).toHaveLength(1);
	host.children[0].stdout.emit("data", packet("display"));
	expect(preview.read(target).dataURL).toContain(Buffer.from("display").toString("base64"));
	expect(preview.read({ windowId: 4, board: false }).dataURL).toBe("");
	expect(host.children[0].kill).toHaveBeenCalledOnce();
	host.children[0].stdout.emit("data", packet("stale"));
	expect(preview.read({ windowId: 4, board: false }).dataURL).toBe("");
	vi.advanceTimersByTime(3001);
	expect(host.children[1].kill).toHaveBeenCalledOnce();
	expect(preview.cameraNeeded).toBe(false);
});
test("camera frames expire and capture failures back off without keeping a stale preview", () => {
	vi.useFakeTimers();
	const preview = new StudioLivePreview(),
		target = { displayId: 1, board: false };
	preview.read(target);
	preview.setCameraFrame("camera");
	expect(preview.read(target).cameraFrame).toBe("camera");
	host.children[0].emit("exit", 1);
	expect(preview.read(target)).toMatchObject({
		dataURL: "",
		cameraFrame: "",
		error: expect.stringContaining("unavailable"),
	});
	expect(host.children).toHaveLength(1);
	vi.advanceTimersByTime(3100);
	preview.read(target);
	expect(host.children).toHaveLength(2);
	preview.stop();
});
