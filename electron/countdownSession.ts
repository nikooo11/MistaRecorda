export type CountdownResult = { success: boolean; cancelled?: boolean; error?: string };
/** A cancellable start gate; cancellation must resolve the pending Start call. */
export class CountdownSession {
	remaining: number | null = null;
	private timer?: ReturnType<typeof setInterval>;
	private settle?: (result: CountdownResult) => void;
	constructor(private tick: (seconds: number | null) => void) {}
	start(seconds: number): Promise<CountdownResult> {
		if (this.settle)
			return Promise.resolve({ success: false, error: "Countdown already in progress" });
		if (!Number.isInteger(seconds) || seconds < 0 || seconds > 30)
			return Promise.resolve({ success: false, error: "Invalid countdown" });
		if (!seconds) return Promise.resolve({ success: true });
		return new Promise((resolve) => {
			this.settle = resolve;
			this.remaining = seconds;
			this.timer = setInterval(() => {
				this.remaining = (this.remaining ?? 1) - 1;
				if (this.remaining <= 0) this.finish({ success: true });
				else this.tick(this.remaining);
			}, 1000);
			this.tick(seconds);
		});
	}
	cancel() {
		this.finish({ success: false, cancelled: true });
	}
	private finish(result: CountdownResult) {
		clearInterval(this.timer);
		this.timer = undefined;
		const settle = this.settle;
		this.settle = undefined;
		this.remaining = null;
		this.tick(null);
		settle?.(result);
	}
}
