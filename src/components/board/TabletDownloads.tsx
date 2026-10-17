import { useEffect, useState } from "react";
import type { BoardAPI } from "../../types/board";
export function TabletDownloads({ transport }: { transport: BoardAPI }) {
	const [files, setFiles] = useState<{ id: string; name: string; url: string }[]>([]);
	useEffect(() => {
		let alive = true;
		const read = () =>
			transport
				.request<typeof files>("downloads")
				.then((v) => {
					if (alive) setFiles(v);
				})
				.catch(() => {
					// A reconnect triggers another read; keep existing links during brief outages.
				});
		void read();
		const off = transport.on("downloadsChanged", () => void read());
		const connected = transport.on("connected", () => void read());
		return () => {
			alive = false;
			off();
			connected();
		};
	}, [transport]);
	if (!files.length) return null;
	return (
		<details className="tablet-downloads">
			<summary>Downloads ({files.length})</summary>
			<div>
				<p>
					Tap to save your finished video to Files. Open it there and use Share → Save
					Video to add it to Photos. Then post with the YouTube, TikTok or Instagram app.
				</p>
				{files.map((f) => (
					<a key={f.id} href={f.url} download={f.name} referrerPolicy="no-referrer">
						↓ {f.name}
					</a>
				))}
				<small>Available for one hour while this Mac is running.</small>
			</div>
		</details>
	);
}
