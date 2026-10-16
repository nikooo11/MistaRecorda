import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { getNativeArchTag, resolveUnpackedAppPath } from "../ipc/paths/binaries";

export interface PreviewTarget {
	displayId?: number;
	windowId?: number;
	drawingId?: number;
	studioId?: number;
	board: boolean;
	aspect?: number;
}

/** Use the same explicit app exclusion for stills, even without an iPad connected. */
export async function captureDisplayStill(displayId: number, studioId?: number) {
	const capture = new StudioLivePreview();
	try {
		for (let i = 0; i < 60; i++) {
			const result = capture.read({ displayId, studioId, board: false });
			if (result.dataURL) return result.dataURL;
			if (result.error) throw Error(result.error);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		throw Error("The screen still was not ready. Try Capture Mac screen again.");
	} finally {
		capture.stop();
	}
}

/** Bounded framing parser; incomplete chunks and multiple frames never grow a backlog. */
export class PreviewFrames {
	private bytes = Buffer.alloc(0);
	push(data: Buffer): string | undefined {
		this.bytes = Buffer.concat([this.bytes, data]);
		let latest: Buffer | undefined;
		while (this.bytes.length >= 4) {
			const size = this.bytes.readUInt32BE(0);
			if (!size || size > 12 * 1024 * 1024) throw Error("Invalid preview frame.");
			if (this.bytes.length < size + 4) break;
			latest = this.bytes.subarray(4, size + 4);
			this.bytes = this.bytes.subarray(size + 4);
		}
		return latest ? `data:image/jpeg;base64,${latest.toString("base64")}` : undefined;
	}
}

/** One shared, silent capture for visible studio panels. Polling is also a short lease:
 * closing/minimizing every consumer stops the helper even after a renderer crash. */
export class StudioLivePreview {
	shake(strength: number, durationMs: number) {
		if (this.child?.stdin.writable) this.child.stdin.write(`shake ${strength} ${durationMs}\n`);
	}
	private child?: ChildProcessWithoutNullStreams;
	private key = "";
	private lastUsed = 0;
	private timer?: ReturnType<typeof setInterval>;
	private retryAt = 0;
	private frame = "";
	private error = "";
	private cameraFrame = "";
	private cameraAt = 0;
	get cameraNeeded() {
		return Boolean(this.lastUsed && Date.now() - this.lastUsed < 2500);
	}
	setCameraFrame(frame: string) {
		if (this.cameraNeeded) {
			this.cameraFrame = frame;
			this.cameraAt = Date.now();
		}
	}
	clearCamera() {
		this.cameraFrame = "";
		this.cameraAt = 0;
	}
	read(target: PreviewTarget) {
		this.lastUsed = Date.now();
		const key = JSON.stringify({ ...target, ownerPID: process.pid });
		if (key !== this.key) {
			this.stop();
			this.key = key;
			this.lastUsed = Date.now();
			this.retryAt = 0;
		}
		if (!this.child && Date.now() >= this.retryAt) this.start(key);
		return {
			dataURL: this.frame,
			error: this.error,
			cameraFrame: Date.now() - this.cameraAt < 2500 ? this.cameraFrame : "",
		};
	}
	private start(config: string) {
		this.error = "";
		const parser = new PreviewFrames();
		const child = spawn(
			resolveUnpackedAppPath(
				"electron",
				"native",
				"bin",
				getNativeArchTag(),
				"mistarecorda-studio-preview",
			),
			[config],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		this.child = child;
		const failed = () => {
			if (this.child !== child) return;
			this.stop();
			this.error =
				"Live preview unavailable. Check Screen Recording permission and keep the selected window open.";
			this.retryAt = Date.now() + 3000;
		};
		child.stdout.on("data", (data: Buffer) => {
			if (this.child !== child) return;
			try {
				const frame = parser.push(data);
				if (frame) this.frame = frame;
			} catch {
				failed();
			}
		});
		child.on("error", failed);
		child.on("exit", failed);
		child.stderr.resume();
		child.stdin.on("error", () => {});
		this.timer = setInterval(() => {
			if (Date.now() - this.lastUsed > 2500) this.stop();
		}, 1000);
	}
	stop() {
		const child = this.child;
		this.child = undefined;
		child?.stdin.end();
		child?.kill();
		clearInterval(this.timer);
		this.frame = "";
		this.lastUsed = 0;
		this.clearCamera();
	}
}
