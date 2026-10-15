import { useState } from "react";
import type { BoardAPI, BoardState } from "../../types/board";
import { whiteboardPages } from "./whiteboards";
import { toggleTabletPanel } from "./tabletPanels";
export function WhiteboardTabs({
	state,
	selected,
	onSelect,
	transport,
	flush,
}: {
	state: BoardState;
	selected: string | null;
	onSelect: (id: string | null) => void;
	transport: BoardAPI;
	flush: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const [name, setName] = useState("");
	const pages = whiteboardPages(state),
		active =
			state.enabled && state.mode === "board" && state.output !== "screen"
				? (state.activeWhiteboardId ?? pages[0].id)
				: null;
	async function run(work: () => Promise<void>) {
		setBusy(true);
		setError("");
		try {
			await flush();
			await work();
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	return (
		<>
			<button
				className="tablet-boards-launch"
				data-panel-target="Whiteboards"
				aria-label="Toggle Whiteboards"
				title="Saved whiteboard tabs"
				onClick={(e) => {
					if (!toggleTabletPanel(e.currentTarget.closest(".board-stage"), "Whiteboards"))
						setOpen(true);
				}}
			>
				▤<small>Boards</small>
			</button>
			{open && (
				<aside className="board-tray whiteboard-tabs" aria-label="Whiteboards">
					<p>
						Select a tab to prepare it. Tap its red circle to show it on the Mac. Green
						is the active board.
					</p>
					<div role="tablist" aria-label="Saved whiteboards">
						{pages.map((page) => (
							<div className="whiteboard-tab" key={page.id}>
								<button
									role="tab"
									aria-selected={selected === page.id}
									disabled={busy}
									onClick={() =>
										void run(async () => {
											onSelect(page.id);
											setName(page.name);
										})
									}
								>
									{page.name}
								</button>
								<button
									className={`whiteboard-live ${page.id === active ? "is-active" : ""}`}
									aria-label={
										page.id === active
											? `${page.name} is active on Mac`
											: `Activate ${page.name} on Mac`
									}
									title={
										page.id === active
											? "Active whiteboard"
											: "Show this board on the Mac"
									}
									disabled={busy}
									onClick={() =>
										void run(async () => {
											await transport.request("activateWhiteboard", {
												whiteboardId: page.id,
											});
											onSelect(page.id);
											setName(page.name);
										})
									}
								>
									<span aria-hidden="true">●</span>
								</button>
							</div>
						))}
					</div>
					<div className="whiteboard-tab-actions">
						<button
							disabled={busy}
							onClick={() =>
								void run(async () => {
									const r = await transport.request<{ id: string }>(
										"createWhiteboard",
									);
									onSelect(r.id);
									setName(`Whiteboard ${pages.length + 1}`);
								})
							}
						>
							＋ New board
						</button>
						<button
							disabled={busy}
							onClick={() => void run(async () => onSelect(null))}
						>
							Follow Mac
						</button>
					</div>
					{selected && (
						<form
							onSubmit={(e) => {
								e.preventDefault();
								void run(async () => {
									await transport.request("renameWhiteboard", {
										whiteboardId: selected,
										name,
									});
								});
							}}
						>
							<input
								aria-label="Whiteboard name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={80}
							/>
							<button disabled={busy || !name.trim()}>Rename</button>
						</form>
					)}
					<small>
						Saved automatically on your Mac. Export an environment to keep these tabs
						together.
					</small>
					{error && <p role="alert">{error}</p>}
				</aside>
			)}
		</>
	);
}
