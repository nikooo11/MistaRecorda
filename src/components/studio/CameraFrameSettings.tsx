import type { CameraLayout } from "../../lib/cameraLayout";
export const SOFT_CAMERA_FRAME = { borderWidth: 0.7, borderColor: "#e8edf2", shadow: 0.25 };
const frames = [
	{ name: "Clean", borderWidth: 0, borderColor: "#ffffff", shadow: 0 },
	{ name: "Soft frame", ...SOFT_CAMERA_FRAME },
	{ name: "Accent", borderWidth: 1.5, borderColor: "#91d5cb", shadow: 0.3 },
];
export function CameraFrameSettings({
	layout,
	change,
}: {
	layout: CameraLayout;
	change: (patch: Partial<CameraLayout>) => void;
}) {
	return (
		<div className="camera-frame-settings">
			<strong>Camera frame</strong>
			<div className="camera-frame-presets">
				{frames.map((f) => (
					<button
						key={f.name}
						type="button"
						aria-pressed={
							(layout.borderWidth ?? 0) === f.borderWidth &&
							(layout.borderColor ?? "#ffffff") === f.borderColor
						}
						onClick={() =>
							change({
								borderWidth: f.borderWidth,
								borderColor: f.borderColor,
								shadow: f.shadow,
							})
						}
					>
						<i
							style={{
								border: `${Math.max(1, f.borderWidth * 2)}px solid ${f.borderWidth ? f.borderColor : "transparent"}`,
								boxShadow: f.shadow ? "0 3px 8px #0006" : "none",
							}}
						/>
						{f.name}
					</button>
				))}
			</div>
			<label>
				Border color{" "}
				<input
					aria-label="Camera border color"
					type="color"
					value={layout.borderColor ?? "#ffffff"}
					onChange={(e) =>
						change({
							borderColor: e.target.value,
							borderWidth: layout.borderWidth || 0.7,
						})
					}
				/>
			</label>
			<label>
				<input
					type="checkbox"
					checked={(layout.shadow ?? 0) > 0}
					onChange={(e) => change({ shadow: e.target.checked ? 0.25 : 0 })}
				/>{" "}
				Soft shadow
			</label>
			<small>
				A thin frame separates your facecam from busy screens. Choose Clean for no border or
				shadow.
			</small>
		</div>
	);
}
