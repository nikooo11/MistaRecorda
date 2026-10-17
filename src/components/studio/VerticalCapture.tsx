import { useEffect, useRef, useState } from "react";
import { verticalRect, type VerticalInfo, type CaptureRect } from "../../types/vertical";
import "./verticalCapture.css";
const request = (input?: unknown) =>
	window.electronAPI.studio.request<VerticalInfo>(
		input ? "vertical:update" : "vertical:info",
		input,
	);
export function VerticalCaptureSettings({ disabled = false }: { disabled?: boolean }) {
	const [info, setInfo] = useState<VerticalInfo>();
	const [error, setError] = useState("");
	useEffect(() => {
		let alive = true;
		const read = () =>
			request()
				.then((v) => {
					if (alive) setInfo(v);
				})
				.catch(() => {});
		void read();
		const timer = setInterval(() => void read(), 1000);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	}, []);
	const update = async (input: unknown) => {
		try {
			setInfo(await request(input));
			setError("");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not set capture frame.");
		}
	};
	return (
		<div className="vertical-settings">
			<label>
				<input
					type="checkbox"
					disabled={disabled || !info?.available}
					checked={info?.enabled ?? false}
					onChange={(e) => void update({ enabled: e.target.checked })}
				/>
				Vertical 9:16
			</label>
			{info?.enabled && (
				<>
					<small>Records only the frame at 1080 × 1920. Drag its top edge to move.</small>
					<label>
						<input
							type="checkbox"
							disabled={disabled}
							checked={info.locked}
							onChange={(e) => void update({ locked: e.target.checked })}
						/>
						Lock frame size
					</label>
					<label>
						<input
							type="checkbox"
							disabled={disabled}
							checked={info.safeAreas}
							onChange={(e) => void update({ safeAreas: e.target.checked })}
						/>
						Show platform safe-area guides
					</label>
				</>
			)}
			<p role="status">{error}</p>
		</div>
	);
}
export function VerticalGuide() {
	const [info, setInfo] = useState<VerticalInfo>();
	const [draft, setDraft] = useState<CaptureRect>();
	const drag = useRef<{ x: number; y: number; frame: CaptureRect; resize: boolean }>();
	useEffect(() => {
		let alive = true;
		const read = () =>
			request()
				.then((v) => {
					if (alive) setInfo(v);
				})
				.catch(() => {});
		void read();
		const timer = setInterval(() => void read(), 250);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	}, []);
	if (!info?.enabled) return null;
	const frame = draft ?? info.frame;
	return (
		<div
			className="vertical-guide-frame"
			style={{
				left: frame.x - info.display.x,
				top: frame.y - info.display.y,
				width: frame.width,
				height: frame.height,
			}}
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				e.currentTarget.setPointerCapture(e.pointerId);
				drag.current = {
					x: e.screenX,
					y: e.screenY,
					frame: info.frame,
					resize: !info.locked && (e.target as HTMLElement).dataset.resize === "true",
				};
				void window.electronAPI.studio.request("vertical:drag", true);
			}}
			onPointerMove={(e) => {
				const d = drag.current;
				if (!d) return;
				setDraft(
					verticalRect(info.display, {
						...d.frame,
						...(d.resize
							? { height: d.frame.height + e.screenY - d.y }
							: { x: d.frame.x + e.screenX - d.x, y: d.frame.y + e.screenY - d.y }),
					}),
				);
			}}
			onPointerUp={() => {
				const next = draft;
				drag.current = undefined;
				void window.electronAPI.studio.request("vertical:drag", false);
				if (next)
					void request({ frame: next })
						.then((v) => setInfo(v))
						.finally(() => setDraft(undefined));
			}}
			onPointerCancel={() => {
				drag.current = undefined;
				setDraft(undefined);
				void window.electronAPI.studio.request("vertical:drag", false);
			}}
		>
			<span className="vertical-guide-label">
				9:16 · {info.locked ? "Drag to move" : "Drag to move · corner to resize"}
			</span>
			{info.safeAreas && (
				<>
					<i className="vertical-safe top" />
					<i className="vertical-safe bottom" />
				</>
			)}
			{!info.locked && (
				<b data-resize="true" className="vertical-resize">
					↘
				</b>
			)}
		</div>
	);
}
