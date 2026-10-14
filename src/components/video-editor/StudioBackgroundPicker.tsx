import { useEffect, useState } from "react";
import { getAssetPath } from "@/lib/assetPath";
import { STUDIO_BACKGROUNDS } from "@/lib/wallpapers";

export function StudioBackgroundPicker({
	value,
	onSelect,
}: {
	value: string;
	onSelect: (source: string, frame: boolean) => void;
}) {
	const [posters, setPosters] = useState<Record<string, string>>({});
	useEffect(() => {
		let disposed = false;
		void Promise.all(
			STUDIO_BACKGROUNDS.map(
				async (b) => [b.image, await getAssetPath(b.image.slice(1))] as const,
			),
		).then((entries) => {
			if (!disposed) setPosters(Object.fromEntries(entries));
		});
		return () => {
			disposed = true;
		};
	}, []);
	const selected = STUDIO_BACKGROUNDS.find((b) => b.image === value || b.motion === value);
	return (
		<section
			aria-label="Studio backgrounds"
			className="space-y-2 rounded border border-foreground/10 p-2"
		>
			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold">Studio backgrounds</span>
				<label
					className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
					data-help="Enable subtle looping motion behind your recording. Motion is added in the editor and export, with no capture overhead."
				>
					<input
						aria-label="Animate studio background"
						type="checkbox"
						checked={Boolean(selected?.motion && value === selected.motion)}
						disabled={!selected?.motion}
						onChange={(e) => {
							if (selected)
								onSelect(
									e.target.checked && selected.motion
										? selected.motion
										: selected.image,
									false,
								);
						}}
					/>
					Motion
				</label>
			</div>
			<div className="grid grid-cols-2 gap-1.5">
				{STUDIO_BACKGROUNDS.map((b) => (
					<button
						type="button"
						key={b.name}
						aria-label={`${b.name} studio background`}
						aria-pressed={selected === b}
						onClick={() => onSelect(b.image, true)}
						data-help={`Frame your recording with the original ${b.name} backdrop. Adds a clean margin, rounded corners, and shadow; all remain editable.`}
						className={`overflow-hidden rounded border text-left transition-colors ${selected === b ? "border-blue-500 ring-1 ring-blue-500" : "border-foreground/15 hover:border-foreground/40"}`}
					>
						<img
							src={posters[b.image] ?? b.image}
							alt=""
							className="aspect-video w-full object-cover"
							loading="lazy"
						/>
						<span className="flex items-center justify-between px-2 py-1 text-[11px]">
							<span>{b.name}</span>
							<span className="text-muted-foreground">
								{selected === b ? "Selected" : b.motion ? "+ Motion" : "Still"}
							</span>
						</span>
					</button>
				))}
			</div>
			<p className="text-[10px] text-muted-foreground">
				Applied after recording. Change the frame below.
			</p>
		</section>
	);
}
