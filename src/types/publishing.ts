import { z } from "zod";
export const YOUTUBE_WAITING = "YouTube upload — waiting for YouTube approval";
export const uploadMetadataSchema = z.object({
	title: z.string().trim().min(1).max(100),
	description: z.string().max(5000),
	tags: z
		.array(z.string().trim().min(1).max(100))
		.max(40)
		.refine((t) => t.join(",").length <= 450, "Keep tags under 450 characters."),
	privacy: z.enum(["private", "unlisted", "public"]).default("private"),
	categoryId: z
		.string()
		.regex(/^\d{1,3}$/)
		.default("27"),
	madeForKids: z.boolean(),
	chapters: z.string().max(3000).default(""),
	language: z
		.string()
		.regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
		.default("en"),
});
export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;
export const defaultUploadMetadata: UploadMetadata = {
	title: "My presentation",
	description: "",
	tags: [],
	privacy: "private",
	categoryId: "27",
	madeForKids: false,
	chapters: "",
	language: "en",
};
export interface UploadProgress {
	phase: "idle" | "connecting" | "uploading" | "done" | "error" | "cancelled";
	uploaded: number;
	total: number;
	error: string;
	videoUrl?: string;
	warnings: string[];
	canRetry: boolean;
}
export interface PublishingInfo {
	available: boolean;
	approved: boolean;
	connected: boolean;
	captionPermission: boolean;
	status: string;
	progress: UploadProgress;
}
export type UploadMarker = { timeMs: number; label: string; kind: "scene" | "zoom" | "point" };
export function chapterText(markers: UploadMarker[], durationMs = Infinity) {
	const sorted = markers
		.filter((m) => Number.isFinite(m.timeMs) && m.timeMs >= 0 && m.timeMs < durationMs)
		.sort((a, b) => a.timeMs - b.timeMs);
	const points = [{ timeMs: 0, label: "Introduction" }, ...sorted];
	let previous = -10000;
	return points
		.filter((m) => {
			if (m.timeMs - previous < 10000) return false;
			previous = m.timeMs;
			return true;
		})
		.slice(0, 100)
		.map((m) => {
			const seconds = Math.floor(m.timeMs / 1000);
			const hours = Math.floor(seconds / 3600);
			const time =
				(hours ? `${hours}:` : "") +
				String(Math.floor(seconds / 60) % 60).padStart(2, "0") +
				":" +
				String(seconds % 60).padStart(2, "0");
			return `${time} ${m.label
				.replace(/[\r\n<>]/g, " ")
				.trim()
				.slice(0, 100)}`;
		})
		.join("\n");
}
