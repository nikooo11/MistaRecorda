/** Browser fallback sidecars use cloned input tracks, never the mixed recording stream. */
export class IsolatedAudioCapture {
	private recorders: Array<{
		kind: "mic" | "system";
		recorder: MediaRecorder;
		chunks: Blob[];
		offsetMs: number;
	}> = [];
	start(
		mic: MediaStreamTrack | undefined,
		system: MediaStreamTrack | undefined,
		videoStartedAt: number,
	) {
		for (const [kind, track] of [
			["mic", mic],
			["system", system],
		] as const) {
			if (!track) continue;
			const chunks: Blob[] = [];
			const recorder = new MediaRecorder(new MediaStream([track.clone()]));
			recorder.ondataavailable = (event) => {
				if (event.data.size) chunks.push(event.data);
			};
			recorder.start(1000);
			this.recorders.push({
				kind,
				recorder,
				chunks,
				offsetMs: Math.max(0, performance.now() - videoStartedAt),
			});
		}
	}
	pause() {
		for (const { recorder } of this.recorders)
			if (recorder.state === "recording") recorder.pause();
	}
	resume() {
		for (const { recorder } of this.recorders)
			if (recorder.state === "paused") recorder.resume();
	}
	async stop() {
		const captures = this.recorders.splice(0);
		return Promise.all(
			captures.map(
				({ kind, recorder, chunks, offsetMs }) =>
					new Promise<{ kind: "mic" | "system"; data: Blob; offsetMs: number }>(
						(resolve, reject) => {
							const cleanup = () =>
								recorder.stream.getTracks().forEach((t) => t.stop());
							const done = () => {
								cleanup();
								resolve({
									kind,
									data: new Blob(chunks, { type: recorder.mimeType }),
									offsetMs,
								});
							};
							recorder.onstop = done;
							recorder.onerror = () => {
								cleanup();
								reject(new Error("Isolated audio recording failed"));
							};
							if (recorder.state === "inactive") done();
							else recorder.stop();
						},
					),
			),
		);
	}
}
