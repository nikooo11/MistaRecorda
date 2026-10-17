import fs from "node:fs/promises";
import type { UploadMarker } from "../../src/types/publishing";
export class PresentationMarkers {
	private markers: UploadMarker[] = [];
	start(scene: string) {
		this.markers = [];
		if (scene) this.add("scene", scene, 0);
	}
	add(kind: UploadMarker["kind"], label: string, timeMs: number) {
		if (!Number.isFinite(timeMs) || timeMs < 0 || !label.trim() || this.markers.length >= 5000)
			return;
		this.markers.push({ kind, label: label.trim().slice(0, 200), timeMs });
	}
	snapshot() {
		return this.markers.map((m) => ({ ...m }));
	}
	async save(video: string) {
		await fs.writeFile(video + ".presentation-markers.json", JSON.stringify(this.markers));
	}
}
export const presentationMarkers = new PresentationMarkers();
