// Rebuild the seven labeled effects from the user-supplied compilation.
// Usage: node scripts/build-starter-sounds.mjs /path/to/original.mp3

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";

const source = process.argv[2];
const sourceSha256 = "8369ac7fba2be25a38933c45145b6be1c5eb1ec1b01a8586b5ad12b61412119f";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (!source || hash(readFileSync(source)) !== sourceSha256)
	throw Error("Pass the original supplied seven-sound MP3; its checksum must match.");
const output = fileURLToPath(new URL("../public/sounds/starter-v1/", import.meta.url));
mkdirSync(output, { recursive: true });
// The video labels identify complete effects; internal gaps are deliberately retained.
const cuts = [
	["Fahhhhh", "fahhhhh", 0.25, 2.11, "#9B596A"],
	["Core", "core", 2.11, 2.82, "#7766A3"],
	["Shocked", "shocked", 2.85, 4.06, "#AD7940"],
	["Bass Drop", "bass-drop", 4.2, 7.14, "#466784"],
	["Boom Timer", "boom-timer", 7.14, 8.765, "#4F827C"],
	["Bow and Arrow", "bow-and-arrow", 8.765, 10.04, "#697F48"],
	["Gear", "gear", 10.08, 12.04, "#717888"],
];
const sounds = cuts.map(([name, slug, start, end, color], index) => {
	const asset = `${String(index + 1).padStart(2, "0")}-${slug}.wav`;
	const durationMs = Math.round((end - start) * 1000);
	execFileSync(ffmpeg, [
		"-v",
		"error",
		"-y",
		"-i",
		source,
		"-af",
		`atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,afade=t=in:d=0.003,afade=t=out:st=${(durationMs - 3) / 1000}:d=0.003`,
		"-ar",
		"48000",
		"-ac",
		"2",
		"-c:a",
		"pcm_s16le",
		"-map_metadata",
		"-1",
		path.join(output, asset),
	]);
	return {
		id: `8c4c2b71-3d8a-41f5-9a42-${String(index + 1).padStart(12, "0")}`,
		name,
		asset,
		durationMs,
		color,
		sourceStartSeconds: start,
		sourceEndSeconds: end,
		sha256: hash(readFileSync(path.join(output, asset))),
	};
});
writeFileSync(
	path.join(output, "manifest.json"),
	JSON.stringify(
		{
			version: 1,
			name: "Starter sounds",
			sourceUrl: "https://www.youtube.com/watch?v=LL2m6ak3auc",
			sourceFile: path.basename(source),
			sourceSha256,
			processing:
				"Seven labeled sections; stereo 48 kHz PCM; 3 ms edge fades; original levels preserved.",
			sounds,
		},
		null,
		2,
	) + "\n",
);
console.log(`Created ${sounds.length} clips in ${output}`);
