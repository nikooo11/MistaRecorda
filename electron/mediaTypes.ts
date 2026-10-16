import path from "node:path";

export const MEDIA_CONTENT_TYPES: Record<string, string> = {
	".m4a": "audio/mp4",
	".gif": "image/gif",
	".webp": "image/webp",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mov": "video/quicktime",
	".mkv": "video/x-matroska",
	".avi": "video/x-msvideo",
	".wav": "audio/wav",
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
};

export function getMediaContentType(filePath: string): string {
	return MEDIA_CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function isSupportedLocalMediaPath(filePath: string): boolean {
	return path.extname(filePath).toLowerCase() in MEDIA_CONTENT_TYPES;
}
