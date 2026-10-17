import type { BoardStatus } from "../../src/types/board";
import { intentAllowed, type RecordIntent } from "../../src/components/board/recordControlModel";
/** One gate for all remotes. Explicit intentions cannot accidentally reverse a stale toggle. */
export class RecordControlGate {
	private pending?: { intent: RecordIntent; until: number };
	update(status: BoardStatus) {
		if (this.pending && !intentAllowed(status, this.pending.intent)) this.pending = undefined;
	}
	dispatch(
		intent: RecordIntent,
		status: BoardStatus,
		send: (command: "record" | "pause") => void,
		now = Date.now(),
	) {
		this.update(status);
		if (!intentAllowed(status, intent))
			throw Error("Recording state changed. Check the updated controls.");
		if (this.pending && now < this.pending.until)
			throw Error("Please wait for the Mac to finish the previous recording action.");
		send(intent === "start" || intent === "stop" ? "record" : "pause");
		this.pending = { intent, until: now + 15000 };
	}
}
