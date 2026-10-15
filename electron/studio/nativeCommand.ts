import { nativeCaptureProcess } from "../ipc/state";

/** Commands are acknowledged by the recorder before changing presenter state. */
export function recorderCommand(command: string, acknowledgement: string, failure: string) {
	const child = nativeCaptureProcess;
	if (!child?.stdin.writable) return Promise.reject(Error("Native recorder is unavailable."));
	return new Promise<void>((resolve, reject) => {
		let buffer = "";
		const clean = () => {
			clearTimeout(timer);
			child.stdout.off("data", read);
			child.off("exit", exited);
		};
		const read = (chunk: Buffer) => {
			buffer = (buffer + chunk.toString()).slice(-16384);
			if (buffer.includes(`${acknowledgement}\n`)) {
				clean();
				resolve();
			} else if (buffer.includes(`${failure}\n`)) {
				clean();
				reject(Error("The recorder could not apply this action."));
			}
		};
		const exited = () => {
			clean();
			reject(Error("Recording ended before the action completed."));
		};
		const timer = setTimeout(() => {
			clean();
			reject(Error("The recorder did not confirm this action."));
		}, 5000);
		child.stdout.on("data", read);
		child.once("exit", exited);
		child.stdin.write(`${command}\n`);
	});
}
