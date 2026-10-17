import { z } from "zod";
import type { BoardStatus } from "./board";
export const remoteActionSchema = z.discriminatedUnion("action", [
	z
		.object({
			action: z.literal("record"),
			intent: z.enum(["start", "stop", "pause", "resume"]),
		})
		.strict(),
	z.object({ action: z.literal("scene"), id: z.string().uuid() }).strict(),
	z.object({ action: z.literal("camera"), enabled: z.boolean() }).strict(),
	z.object({ action: z.literal("zoom"), enabled: z.boolean() }).strict(),
	z.object({ action: z.literal("whiteboard"), enabled: z.boolean() }).strict(),
	z
		.object({
			action: z.literal("stage"),
			kind: z.enum(["sound", "meme"]),
			id: z.string().uuid(),
		})
		.strict(),
	z.object({ action: z.literal("deploy"), token: z.string().uuid() }).strict(),
	z.object({ action: z.literal("cancelStage") }).strict(),
	z.object({ action: z.literal("voice"), id: z.string().max(100) }).strict(),
]);
export type RemoteAction = z.infer<typeof remoteActionSchema>;
export type RemoteArmed = {
	kind: "sound" | "meme";
	id: string;
	name: string;
	token: string;
	preview?: string;
};
export interface RemoteInfo {
	sequence: number;
	status: BoardStatus;
	scenes: { id: string; name: string; camera: boolean }[];
	sceneId: string;
	camera: boolean;
	zoom: boolean;
	zoomAvailable: boolean;
	whiteboard: boolean;
	sounds: { id: string; name: string; color: string }[];
	memes: { id: string; name: string; dataURL: string; soundId: string }[];
	armed: RemoteArmed | null;
}
export type RemoteSnapshot = Omit<RemoteInfo, "sounds" | "memes"> &
	Partial<Pick<RemoteInfo, "sounds" | "memes">>;
