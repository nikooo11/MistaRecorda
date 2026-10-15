// Build lightweight copies of the approved Downloads meme pack; originals are never changed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
const input = process.argv[2];
if (!input) throw Error("Pass the folder containing the approved GIF/PNG memes.");
const output = fileURLToPath(new URL("../public/assets/memes/starter-v1/", import.meta.url));
mkdirSync(output, { recursive: true });
const hash = (data) => createHash("sha256").update(data).digest("hex");
const names = {
	"fahhh.gif": "Fahhh",
	"family-guy-star-wars-horny.gif": "Family Guy Star Wars",
	"soshicco-family-guy-chair.gif": "Family Guy Chair",
	"chadge-chad.gif": "Chad Pepe",
	"chad-cat.gif": "Chad Cat",
	"mujikcboro-seriymujik-chad.gif": "Chad",
	"trump-sleepy.gif": "Sleepy Trump",
	"bigyahu-bigyahucalling.gif": "Bigyahu Calling",
	"benjamin-netanyahu-flip.gif": "Netanyahu Flip",
	"epsteinstrump-trump-epstein.gif": "Trump and Epstein",
	"epstein-epstein-files (1).gif": "Epstein Files 2",
	"netanyahu-dancing.gif": "Netanyahu Dancing",
	"israel-spirirtually-israeli.gif": "Spiritually Israeli",
	"israel-netanyahu.gif": "Netanyahu",
	"epstein-epstein-files.gif": "Epstein Files",
	"ai-donald-trump-donald-trump-ai-dance.gif": "Trump AI Dance",
	"trump-dance-donald-the-trumpsta-oval-office-dance.gif": "Trump Oval Office Dance",
	"trump-in-bed.gif": "Trump in Bed",
	"feel-me-think-about-it.gif": "Think About It",
	"cut-it-out-smh.gif": "Cut It Out",
	"jonah-hill-annoyed.gif": "Jonah Hill Annoyed",
	"seriously.gif": "Seriously",
	"hit-the-road-hit-the-road-dude.gif": "Hit the Road",
	"ShrekMeme3.gif": "Shrek 3",
	"ShrekMeme2.gif": "Shrek 2",
};
const metadata = JSON.parse(
	readFileSync(new URL("./starter-meme-metadata.json", import.meta.url), "utf8"),
);
const files = Object.keys(names);
const unexpected = readdirSync(input).filter((f) => /\.(gif|png)$/i.test(f) && !files.includes(f));
if (unexpected.length)
	console.log("Leaving unrelated/new images out of this approved pack:", unexpected);
const memes = files.map((sourceFile, index) => {
	const source = path.join(input, sourceFile),
		original = readFileSync(source),
		sourceSha256 = hash(original);
	const slug = names[sourceFile].toLowerCase().replace(/[^a-z0-9]+/g, "-");
	const asset = `${String(index + 1).padStart(2, "0")}-${slug}.gif`,
		target = path.join(output, asset);
	if (original.length > 500_000) {
		execFileSync(ffmpeg, [
			"-v",
			"error",
			"-y",
			"-i",
			source,
			"-filter_complex",
			"fps=15,scale='min(360,iw)':-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
			"-loop",
			"0",
			target,
		]);
		if (statSync(target).size >= original.length) copyFileSync(source, target);
	} else copyFileSync(source, target);
	const data = readFileSync(target),
		id = `${sourceSha256.slice(0, 8)}-${sourceSha256.slice(8, 12)}-5${sourceSha256.slice(13, 16)}-a${sourceSha256.slice(17, 20)}-${sourceSha256.slice(20, 32)}`;
	console.log(
		`${names[sourceFile]}: ${(original.length / 1024).toFixed(0)} → ${(data.length / 1024).toFixed(0)} KB`,
	);
	return {
		id,
		name: names[sourceFile],
		...metadata[sourceFile],
		asset,
		sourceFile,
		sourceSha256,
		sha256: hash(data),
		width: data.readUInt16LE(6),
		height: data.readUInt16LE(8),
		bytes: data.length,
		soundId: index === 0 ? "8c4c2b71-3d8a-41f5-9a42-000000000001" : "",
	};
});
writeFileSync(
	path.join(output, "manifest.json"),
	JSON.stringify(
		{ version: 1, source: "User-provided Downloads meme collection, 2026-10-15", memes },
		null,
		2,
	) + "\n",
);
console.log(
	`Total: ${(memes.reduce((n, m) => n + m.bytes, 0) / 1024 / 1024).toFixed(2)} MB / ${memes.length} memes`,
);
