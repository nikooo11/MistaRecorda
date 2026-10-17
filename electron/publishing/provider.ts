import type { UploadMetadata } from "../../src/types/publishing";
export type UploadJob = {
	file: string;
	metadata: UploadMetadata;
	session?: string;
	videoId?: string;
	size?: number;
	mtimeMs?: number;
	thumbnail?: string;
	srt?: string;
};
/** A future provider must implement explicit uploads without changing capture/export. */
export interface VideoUploadProvider {
	readonly id: string;
	upload(
		job: UploadJob,
		progress: (uploaded: number, total: number) => void,
		signal: AbortSignal,
	): Promise<string>;
}
