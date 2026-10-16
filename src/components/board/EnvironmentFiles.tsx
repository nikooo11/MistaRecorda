import { useEffect, useState } from "react";
import type { BoardAPI } from "../../types/board";

export function EnvironmentFiles({
	transport,
	onError,
}: {
	transport: BoardAPI;
	onError: (text: string) => void;
}) {
	const [name, setName] = useState("My presentation");
	const [saved, setSaved] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [pending, setPending] = useState<{ name: string; bundle?: unknown }>();
	const refresh = () => transport.request<string[]>("listPresentations").then(setSaved);
	useEffect(() => {
		void transport
			.request<string[]>("listPresentations")
			.then(setSaved)
			.catch((e) => onError(String(e)));
	}, [transport, onError]);
	async function run(fn: () => Promise<void>) {
		setBusy(true);
		onError("");
		try {
			await fn();
		} catch (e) {
			onError(String(e));
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="presenter-settings" aria-label="Saved environments">
			<p className="presenter-help">
				Save both canvases, public and shadow objects, talking points, images, memes and
				sounds, all talking-point sets and private PDFs. Private PDFs are included in this
				backup, never in video. Download one file to transfer or back up your setup. Account
				keys are never included.
			</p>
			<label>
				Environment name
				<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
			</label>
			<div className="presenter-create">
				<button
					disabled={busy || !name.trim()}
					onClick={() =>
						void run(async () => {
							await transport.request("savePresentation", { name });
							await refresh();
							onError("Environment saved on the computer.");
						})
					}
				>
					Save environment
				</button>
				<button
					disabled={busy}
					onClick={() =>
						void run(async () => {
							const bundle = await transport.request("exportPresentation", { name });
							const url = URL.createObjectURL(
								new Blob([JSON.stringify(bundle)], { type: "application/json" }),
							);
							const link = document.createElement("a");
							link.href = url;
							link.download = `${name.replace(/[^\p{L}\p{N} _-]/gu, "_")}.mistapresentation.json`;
							link.click();
							setTimeout(() => URL.revokeObjectURL(url), 60000);
						})
					}
				>
					Download file
				</button>
				<label className="presenter-upload">
					Import file
					<input
						type="file"
						accept=".json,.mistapresentation"
						disabled={busy}
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (!file) return;
							void run(async () => {
								if (file.size > 44 * 1024 * 1024)
									throw Error("Choose a presentation under 44 MB.");
								setPending({
									name: file.name,
									bundle: JSON.parse(await file.text()),
								});
							});
						}}
					/>
				</label>
			</div>
			{saved.map((item) => (
				<button disabled={busy} key={item} onClick={() => setPending({ name: item })}>
					Load · {item}
				</button>
			))}
			{pending && (
				<div role="alertdialog" aria-label="Load environment">
					<p>
						Load {pending.name}? This replaces both canvases and talking points. Your
						current setup is saved as “Before last import.” Stop recording first.
					</p>
					<button
						disabled={busy}
						onClick={() =>
							void run(async () => {
								await transport.request(
									pending.bundle ? "importPresentation" : "loadPresentation",
									{ ...pending, confirmed: true },
								);
								setPending(undefined);
								await refresh();
								onError("Environment loaded.");
							})
						}
					>
						Load environment
					</button>
					<button disabled={busy} onClick={() => setPending(undefined)}>
						Cancel
					</button>
				</div>
			)}
		</section>
	);
}
