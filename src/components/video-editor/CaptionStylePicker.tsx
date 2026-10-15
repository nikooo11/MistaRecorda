import type { AutoCaptionSettings } from "./types";
import { CAPTION_PRESETS, captionPresetSettings } from "./captionPresets";
import "./captionPresets.css";
export function CaptionStylePicker({
	settings,
	onChange,
}: {
	settings: AutoCaptionSettings;
	onChange: (change: Partial<AutoCaptionSettings>) => void;
}) {
	return (
		<div className="caption-style-picker">
			<div className="caption-style-heading">
				<strong>Caption style</strong>
				<span>Short-form order</span>
			</div>
			<div className="caption-style-grid">
				{CAPTION_PRESETS.map((preset) => (
					<button
						type="button"
						key={preset.id}
						aria-pressed={(settings.preset ?? "classic") === preset.id}
						onClick={() => onChange(captionPresetSettings(preset.id))}
					>
						<span className={`caption-style-example example-${preset.id}`}>
							{preset.id === "highlight" ? (
								<>
									Make <mark>your</mark> point
								</>
							) : (
								preset.example
							)}
						</span>
						<strong>
							{preset.rank}. {preset.name}
						</strong>
						<small>{preset.description}</small>
					</button>
				))}
			</div>
			<p>
				Recommended for short clips; results depend on the content and audience. Classic
				suits slower explanations.
			</p>
			{(settings.preset === "highlight" || settings.preset === "short") && (
				<label className="caption-style-heading">
					Words at a time
					<select
						aria-label="Words at a time"
						value={settings.wordsPerPage ?? 3}
						onChange={(e) => onChange({ wordsPerPage: Number(e.target.value) })}
					>
						{[1, 2, 3].map((n) => (
							<option key={n} value={n}>
								{n}
							</option>
						))}
					</select>
				</label>
			)}
			{settings.preset === "highlight" && (
				<label className="caption-style-heading">
					Word highlight
					<input
						type="color"
						aria-label="Word highlight color"
						value={settings.highlightColor ?? "#68E0CF"}
						onChange={(e) => onChange({ highlightColor: e.target.value })}
					/>
				</label>
			)}
		</div>
	);
}
