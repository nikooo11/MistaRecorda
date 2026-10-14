import type { AnnotationRegion, AnnotationType, WebcamOverlaySettings } from "./types";
import "./layers.css";
export function LayersPanel({
	annotations,
	webcam,
	add,
	select,
	update,
	remove,
	move,
	camera,
	cameraVisibility,
	screen,
}: {
	annotations: AnnotationRegion[];
	webcam: WebcamOverlaySettings;
	add: (type: AnnotationType) => void;
	select: (id: string) => void;
	update: (id: string, hidden: boolean) => void;
	remove: (id: string) => void;
	move: (id: string, direction: number) => void;
	camera: () => void;
	cameraVisibility: () => void;
	screen: () => void;
}) {
	const ordered = [...annotations].sort((a, b) => b.zIndex - a.zIndex);
	return (
		<section className="editor-layers">
			<header>
				<h2>Layers</h2>
				<p>
					Add overlays, then select one to edit it. Drag text, images, and shapes in the
					preview.
				</p>
			</header>
			<div className="layer-add">
				<button onClick={() => add("text")} title="Add editable text at the playhead.">
					+ Text
				</button>
				<button
					onClick={() => add("image")}
					title="Add an image layer, then choose its image file."
				>
					+ Image
				</button>
				<button
					onClick={() => add("figure")}
					title="Add an arrow or shape to highlight part of the recording."
				>
					+ Shape
				</button>
				<button
					onClick={() => add("blur")}
					title="Add a blur layer to conceal part of the recording."
				>
					+ Blur
				</button>
			</div>
			<p className="layer-hint">Overlays · front to back</p>
			<div className="layer-list">
				{ordered.map((layer, index) => (
					<div className="editor-layer-row" key={layer.id}>
						<button
							className="layer-name"
							onClick={() => select(layer.id)}
							title="Edit this layer’s content, appearance, and timing."
						>
							<strong>
								{layer.type === "text"
									? layer.content.slice(0, 40) || "Text"
									: layer.type[0].toUpperCase() + layer.type.slice(1)}
							</strong>
							<small>
								{(layer.startMs / 1000).toFixed(1)}–
								{(layer.endMs / 1000).toFixed(1)}s
							</small>
						</button>
						<button
							aria-label={`${layer.hidden ? "Show" : "Hide"} ${layer.type} layer`}
							title="Show or hide this layer in preview and export."
							onClick={() => update(layer.id, !layer.hidden)}
						>
							{layer.hidden ? "Show" : "Hide"}
						</button>
						<button
							disabled={index === 0}
							aria-label={`Move ${layer.type} layer forward`}
							title="Move this overlay in front of the one above it."
							onClick={() => move(layer.id, 1)}
						>
							↑
						</button>
						<button
							disabled={index === ordered.length - 1}
							aria-label={`Move ${layer.type} layer backward`}
							title="Move this overlay behind the one below it."
							onClick={() => move(layer.id, -1)}
						>
							↓
						</button>
						<button
							aria-label={`Remove ${layer.type} layer`}
							title="Remove this layer. Undo restores it."
							onClick={() => remove(layer.id)}
						>
							×
						</button>
					</div>
				))}
				{!ordered.length && (
					<p className="layer-empty">
						No overlays yet. Add text, an image, or a shape above.
					</p>
				)}
			</div>
			<div className="editor-layer-row">
				<button
					className="layer-name"
					onClick={camera}
					title="Choose camera footage, position, size, and shape."
				>
					<strong>Face camera</strong>
					<small>
						{webcam.sourcePath
							? webcam.layoutCues?.length
								? "Recorded movement"
								: "Fixed placement"
							: "Add camera footage"}
					</small>
				</button>
				{webcam.sourcePath && (
					<button onClick={cameraVisibility}>{webcam.enabled ? "Hide" : "Show"}</button>
				)}
				<button onClick={camera}>{webcam.sourcePath ? "Edit" : "Add"}</button>
			</div>
			<div className="editor-layer-row">
				<button className="layer-name" onClick={screen}>
					<strong>Screen recording</strong>
					<small>Base video · background and frame</small>
				</button>
				<button onClick={screen}>Edit</button>
			</div>
			<p className="layer-hint">
				Use the timeline to set when each overlay appears. Drawing captured during the take
				is part of the base video.
			</p>
		</section>
	);
}
