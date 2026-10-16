import { studioCaptureWindowId } from "../studio/captureVisibility";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { getNativeArchTag, resolveUnpackedAppPath } from "../ipc/paths/binaries";
export class CompanionPreview {
	private process?: ChildProcessWithoutNullStreams;
	private bytes = Buffer.alloc(0);
	private heartbeat?: ReturnType<typeof setInterval>;
	private clients = new Set<string>();
	private displayId = 0;
	restart() {
		const ids = [...this.clients];
		const display = this.displayId;
		this.stop();
		for (const id of ids) this.start(id, display);
	}
	lastFrame = "";
	constructor(private deliver: (id: string, data: unknown) => void) {}
	start(id: string, displayId: number) {
		this.displayId = displayId;
		this.clients.add(id);
		if (this.lastFrame)
			this.deliver(id, { type: "frame", dataURL: this.lastFrame, clean: true });
		if (this.process) return;
		const child = spawn(
			resolveUnpackedAppPath(
				"electron",
				"native",
				"bin",
				getNativeArchTag(),
				"mistarecorda-companion-preview",
			),
			[String(displayId), String(process.pid), String(studioCaptureWindowId() ?? 0)],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		this.process = child;
		child.stdout.on("data", (data: Buffer) => {
			if (this.process !== child) return;
			this.bytes = Buffer.concat([this.bytes, data]);
			let frame: Buffer | undefined;
			while (this.bytes.length >= 4) {
				const size = this.bytes.readUInt32BE(0);
				if (size > 12 * 1024 * 1024) {
					this.stop();
					return;
				}
				if (this.bytes.length < size + 4) break;
				frame = this.bytes.subarray(4, 4 + size);
				this.bytes = this.bytes.subarray(4 + size);
			}
			if (frame) {
				this.lastFrame = `data:image/jpeg;base64,${frame.toString("base64")}`;
				this.sendFrame();
			}
		});
		const failed = () => {
			if (this.process !== child) return;
			for (const device of this.clients)
				this.deliver(device, {
					type: "error",
					message: "Clean screen preview stopped. Tap Start screen to reconnect.",
				});
			this.stop();
		};
		child.on("error", failed);
		child.on("exit", failed);
		child.stderr.resume();
		// Static desktops may not produce new frames; keep the receiver alive.
		this.heartbeat = setInterval(() => this.sendFrame(), 1000);
	}
	private sendFrame() {
		if (this.lastFrame)
			for (const id of this.clients)
				this.deliver(id, { type: "frame", dataURL: this.lastFrame, clean: true });
	}
	retain(ids: string[]) {
		for (const id of this.clients) if (!ids.includes(id)) this.clients.delete(id);
		if (!this.clients.size) this.stop();
	}
	stop() {
		const child = this.process;
		this.process = undefined;
		child?.stdin.end();
		child?.kill();
		clearInterval(this.heartbeat);
		this.bytes = Buffer.alloc(0);
		this.clients.clear();
		this.lastFrame = "";
	}
}
