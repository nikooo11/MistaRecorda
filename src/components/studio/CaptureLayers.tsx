import { HelpTarget, SettingHelp } from "../settings-guide/SettingHelp";
import { useEffect, useState } from "react";
import type { StudioInfo } from "../../types/studio";
import type { CameraLayout } from "../../lib/cameraLayout";

export function CaptureLayers({
	info,
	run,
}: {
	info: StudioInfo;
	run: (method: string, input?: unknown) => Promise<void>;
}) {
	const [layout, setLayout] = useState(info.settings.cameraLayout);
	useEffect(() => setLayout(info.settings.cameraLayout), [info.settings.cameraLayout]);
	const change = (patch: Partial<CameraLayout>) => {
		const next = { ...layout, ...patch };
		setLayout(next);
		void run("cameraLayout", next);
	};
	return (
		<HelpTarget id="camera">
			<div className="capture-section-heading">
				<div>
					<h2>
						Layers <SettingHelp id="camera" />
					</h2>
					<p>Arrange what appears in your recording.</p>
				</div>
			</div>
			<div className="capture-layer-row">
				<strong>Screen / window</strong>
				<span>{info.selectedName}</span>
				<small>Choose your source in the recorder.</small>
			</div>
			<div className="capture-layer-row">
				<strong>Face camera</strong>
				<button
					onClick={() => void run("cameraToggle")}
					title="Add or hide your face camera. Your screen recording continues."
				>
					{info.camera?.enabled ? "Hide camera" : "Add camera"}
				</button>
			</div>
			<div className="camera-layout-controls">
				<div className="camera-position-grid" aria-label="Camera position">
					{[0, 0.5, 1].flatMap((y, row) =>
						[0, 0.5, 1].map((x, col) => {
							const name = `${["Top", "Middle", "Bottom"][row]} ${["left", "center", "right"][col]}`;
							return (
								<button
									key={name}
									aria-label={name}
									aria-pressed={
										Math.abs(layout.x - x) < 0.04 &&
										Math.abs(layout.y - y) < 0.04
									}
									title={`Place the camera at ${name.toLowerCase()} of your recording.`}
									onClick={() => change({ x, y })}
								>
									●
								</button>
							);
						}),
					)}
				</div>
				<div className="camera-layout-fields">
					<label>
						Size <output>{layout.size}%</output>
						<input
							aria-label="Camera size"
							type="range"
							min="10"
							max="60"
							value={layout.size}
							onChange={(e) => setLayout({ ...layout, size: Number(e.target.value) })}
							onPointerUp={() => change({})}
							onKeyUp={() => change({})}
						/>
					</label>
					<label>
						Shape{" "}
						<select
							aria-label="Camera shape"
							value={layout.roundness > 50 ? "round" : "square"}
							onChange={(e) =>
								change({ roundness: e.target.value === "round" ? 90 : 8 })
							}
						>
							<option value="round">Round</option>
							<option value="square">Rounded square</option>
						</select>
					</label>
					<label>
						<input
							type="checkbox"
							checked={layout.mirror}
							onChange={(e) => change({ mirror: e.target.checked })}
						/>{" "}
						Mirror camera
					</label>
					<label>
						<input
							type="checkbox"
							checked={layout.locked}
							onChange={(e) => change({ locked: e.target.checked })}
						/>{" "}
						Lock position
					</label>
				</div>
			</div>
			<p className="capture-note">
				Drag the floating camera to place it anywhere, including during a take. Its movement
				is saved with your recording. Hover over the camera for its settings button.
			</p>
			{info.camera?.error && (
				<p role="alert" className="capture-error">
					{info.camera.error}
				</p>
			)}
			<div className="capture-layer-row">
				<strong>Drawings / images</strong>
				<button
					title="Open Drawing studio to add ink, shapes, text, or images over the screen. Enable drawing before recording."
					onClick={() => void window.electronAPI.board.request("open", { tab: "draw" })}
				>
					Add drawing layer
				</button>
			</div>
			<p className="shortcut-check-note">
				After recording, use the editor’s Layers panel for text, images, shapes, and camera
				placement.
			</p>
		</HelpTarget>
	);
}
