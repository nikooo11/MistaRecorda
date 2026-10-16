// Add the user-provided GIF + audio meme packs. Every distinct clip joins the soundboard once;
// memes reference soundboard sounds by ID, so several memes can share one clip.
// Originals are never changed. Re-running replaces this script's entries in place.
// Usage: node scripts/build-meme-packs.mjs /path/to/meme-pack /path/to/meme-pack-2
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";

const [pack1, pack2] = process.argv.slice(2);
if (!pack1 || !pack2) throw Error("Pass the meme-pack and meme-pack-2 folders.");
const packs = { "meme-pack": pack1, "meme-pack-2": pack2 };
const memeOutput = fileURLToPath(new URL("../public/assets/memes/starter-v1/", import.meta.url));
const soundOutput = fileURLToPath(new URL("../public/sounds/starter-v1/", import.meta.url));
const hash = (data) => createHash("sha256").update(data).digest("hex");
const pcmBytes = (wav) => {
	for (let offset = 12; offset + 8 <= wav.length; offset += 8 + wav.readUInt32LE(offset + 4))
		if (wav.toString("ascii", offset, offset + 4) === "data")
			return wav.readUInt32LE(offset + 4);
	throw Error("Decoded audio has no PCM data.");
};
const FAHHHHH = "8c4c2b71-3d8a-41f5-9a42-000000000001";

// One entry per distinct clip. The packs' READMEs list the duplicates: pack 1's Fahh clip
// (math-not-mathing.mp3 / picard-facepalm.mp3) is covered by the existing Fahhhhh sound,
// and Bruh (eye-roll.mp3) was the sound originally intended for Math Not Mathing.
const sounds = [
	[
		"black-cat-slow-clap",
		"Slow Clap",
		"meme-pack/01-black-cat-slow-clap",
		"#5E6B7A",
		"CdqMZ_s7Y6k",
	],
	["who-are-you", "Who Are You", "meme-pack/02-mike-evans-who-are-you", "#8A5A44", "Oc7Cin_87H4"],
	["chill-guy", "Chill Guy", "meme-pack/04-chill-guy", "#6D8257", "b3rNUhDqciM"],
	[
		"moo-deng-tantrum",
		"Moo Deng Tantrum",
		"meme-pack/05-moo-deng-tantrum",
		"#9A6B7C",
		"iDLmYZ5HqgM",
	],
	["mj-laugh", "MJ Laugh", "meme-pack/06-mj-laugh", "#A0794A", "Gf9LYy6enUk"],
	["scrib-doon", "Scrib Doon", "meme-pack-2/08-scrib-doon", "#7A6A8E", "67dmM5UM-AQ"],
	["dun-dun", "Dun Dun", "meme-pack-2/09-pll-a-text", "#5A6F8F", "lMalvNeJFLk"],
	[
		"emotional-damage",
		"Emotional Damage",
		"meme-pack-2/10-what-the-hell",
		"#9B5A5A",
		"tcPKQ3fuIVU",
	],
	["bruh", "Bruh", "meme-pack-2/11-eye-roll", "#6E7468", "Lo9NDIavsq4"],
	[
		"oh-my-god-wow",
		"Oh My God Wow",
		"meme-pack-2/12-are-you-kidding-me",
		"#A0864A",
		"uvsPzuriDdA",
	],
	["crickets", "Crickets", "meme-pack-2/13-blinking-guy", "#5F7F6A", "CpGtBnVZLSk"],
	["nani", "Nani", "meme-pack-2/14-shocked-pikachu", "#A87A3E", "lGRd9QvU-qk"],
	["think-music", "Think Music", "meme-pack-2/15-this-is-fine", "#4E7A8C", "HuABhumm6fY"],
	["boo-womp", "Boo-Womp", "meme-pack-2/16-sarcastic-thumbs-up", "#7D6A55", "Xsrjy7140Lw"],
	["airhorn", "Airhorn", "meme-pack-2/17-mic-drop", "#8F5E78", "iZzCSk7QRno"],
].map(([key, name, folder, color, video]) => ({ key, name, folder, color, video }));

// GIF lengths come from the packs' READMEs.
const memes = [
	{
		folder: "meme-pack/01-black-cat-slow-clap",
		name: "Black Cat Slow Clap",
		seconds: 6.9,
		sound: "black-cat-slow-clap",
		description:
			"A slow, sarcastic clap for an obvious point, a late realization or a weak effort.",
		tags: [
			"slow clap",
			"clap",
			"sarcastic",
			"applause",
			"bravo",
			"well done",
			"cat",
			"black cat",
			"congrats",
			"obvious",
			"reaction",
		],
	},
	{
		folder: "meme-pack/02-mike-evans-who-are-you",
		name: "Mike Evans Who Are You",
		seconds: 4.8,
		sound: "who-are-you",
		description:
			"A confused “who are you?” for a stranger, an unexpected guest or an unknown claim.",
		tags: [
			"who are you",
			"who",
			"confused",
			"stranger",
			"unknown",
			"mike evans",
			"football",
			"nfl",
			"huh",
			"reaction",
		],
	},
	{
		folder: "meme-pack/03-math-not-mathing",
		name: "Math Not Mathing",
		seconds: 3,
		sound: "bruh",
		description: "Confused calculations for numbers, logic or claims that do not add up.",
		tags: [
			"math",
			"math not mathing",
			"calculating",
			"confused",
			"doesn't add up",
			"numbers",
			"logic",
			"thinking",
			"suspicious",
			"bruh",
			"reaction",
		],
	},
	{
		folder: "meme-pack/04-chill-guy",
		name: "Chill Guy",
		seconds: 6.9,
		sound: "chill-guy",
		description:
			"A relaxed, unbothered shrug for staying calm while everything else is chaotic.",
		tags: [
			"chill guy",
			"chill",
			"relaxed",
			"calm",
			"unbothered",
			"vibes",
			"whatever",
			"laid back",
			"dog",
			"cool",
			"reaction",
		],
	},
	{
		folder: "meme-pack/05-moo-deng-tantrum",
		name: "Moo Deng Tantrum",
		seconds: 3.6,
		sound: "moo-deng-tantrum",
		description:
			"A tiny hippo tantrum for being annoyed, refusing something or a dramatic meltdown.",
		tags: [
			"moo deng",
			"hippo",
			"tantrum",
			"angry",
			"annoyed",
			"meltdown",
			"no",
			"refuse",
			"cute",
			"dramatic",
			"reaction",
		],
	},
	{
		folder: "meme-pack/06-mj-laugh",
		name: "MJ Laugh",
		seconds: 9.5,
		sound: "mj-laugh",
		description:
			"A big Michael Jordan laugh for something hilarious, absurd or hard to take seriously.",
		tags: [
			"laugh",
			"laughing",
			"lol",
			"funny",
			"hilarious",
			"michael jordan",
			"mj",
			"crying laughing",
			"absurd",
			"joke",
			"reaction",
		],
	},
	{
		folder: "meme-pack/07-picard-facepalm",
		name: "Picard Facepalm",
		seconds: 2.46,
		sound: FAHHHHH,
		description:
			"A classic facepalm for a dumb mistake, an obvious error or secondhand embarrassment.",
		tags: [
			"facepalm",
			"picard",
			"star trek",
			"smh",
			"disappointed",
			"stupid",
			"mistake",
			"fail",
			"embarrassing",
			"really",
			"reaction",
		],
	},
	{
		folder: "meme-pack-2/08-scrib-doon",
		name: "Scrib Doon",
		seconds: 4.06,
		sound: "scrib-doon",
		description:
			"A Star Wars podrace announcer's alien gibberish for nonsense, jargon or confusing talk.",
		tags: [
			"scrib doon",
			"star wars",
			"podrace",
			"alien",
			"gibberish",
			"nonsense",
			"jargon",
			"confusing",
			"what",
			"huh",
			"reaction",
		],
	},
	{
		folder: "meme-pack-2/09-pll-a-text",
		name: "PLL A Text",
		seconds: 1.03,
		sound: "dun-dun",
		description:
			"A mysterious “A” text with a dramatic sting for a reveal, plot twist or ominous message.",
		tags: [
			"pretty little liars",
			"pll",
			"text",
			"message",
			"mystery",
			"reveal",
			"plot twist",
			"dun dun",
			"ominous",
			"dramatic",
			"suspense",
		],
	},
	{
		folder: "meme-pack-2/10-what-the-hell",
		name: "What the Hell",
		seconds: 8,
		sound: "emotional-damage",
		description:
			"A disgusted, judging Barbie for a shocking take, a bad idea or emotional damage.",
		tags: [
			"what the hell",
			"barbie",
			"judging",
			"disgusted",
			"shocked",
			"emotional damage",
			"cringe",
			"offended",
			"bad idea",
			"reaction",
		],
	},
	{
		folder: "meme-pack-2/11-eye-roll",
		name: "Eye Roll",
		seconds: 1,
		sound: "bruh",
		description:
			"A frustrated Tony Soprano eye roll for an annoying comment or something obvious.",
		tags: [
			"eye roll",
			"tony soprano",
			"sopranos",
			"frustrated",
			"annoyed",
			"really",
			"bruh",
			"ugh",
			"whatever",
			"smh",
			"reaction",
		],
	},
	{
		folder: "meme-pack-2/12-are-you-kidding-me",
		name: "Are You Kidding Me",
		seconds: 2.1,
		sound: "oh-my-god-wow",
		description:
			"Mike Wazowski asking if this is a joke, for disbelief at something ridiculous.",
		tags: [
			"are you kidding me",
			"is this a joke",
			"mike wazowski",
			"monsters inc",
			"disbelief",
			"seriously",
			"joke",
			"wow",
			"shocked",
			"reaction",
		],
	},
	{
		folder: "meme-pack-2/13-blinking-guy",
		name: "Blinking Guy",
		seconds: 2.95,
		sound: "crickets",
		description:
			"A confused double take with crickets for awkward silence or a baffling statement.",
		tags: [
			"blinking guy",
			"blink",
			"confused",
			"what",
			"awkward",
			"silence",
			"crickets",
			"double take",
			"disbelief",
			"wtf",
			"reaction",
		],
	},
	{
		folder: "meme-pack-2/14-shocked-pikachu",
		name: "Shocked Pikachu",
		seconds: 3.1,
		sound: "nani",
		description: "Surprised Pikachu for fake surprise at a completely predictable outcome.",
		tags: [
			"shocked pikachu",
			"pikachu",
			"pokemon",
			"surprised",
			"shocked",
			"predictable",
			"obvious",
			"nani",
			"anime",
			"surprise",
			"reaction",
		],
	},
	{
		folder: "meme-pack-2/15-this-is-fine",
		name: "This Is Fine",
		seconds: 2.8,
		sound: "think-music",
		description: "A calm dog in a burning room for pretending everything is fine during chaos.",
		tags: [
			"this is fine",
			"fine",
			"dog",
			"fire",
			"burning",
			"chaos",
			"denial",
			"calm",
			"disaster",
			"waiting",
			"reaction",
		],
	},
	{
		folder: "meme-pack-2/16-sarcastic-thumbs-up",
		name: "Sarcastic Thumbs Up",
		seconds: 1.5,
		sound: "boo-womp",
		description:
			"A forced thumbs up for sarcastic approval, a letdown or an underwhelming result.",
		tags: [
			"thumbs up",
			"sarcastic",
			"sarcasm",
			"approve",
			"great",
			"letdown",
			"fail",
			"womp womp",
			"underwhelming",
			"ok",
			"reaction",
		],
	},
	{
		folder: "meme-pack-2/17-mic-drop",
		name: "Mic Drop",
		seconds: 2.9,
		sound: "airhorn",
		description: "Obama's mic drop for a winning point, a perfect finish or a confident exit.",
		tags: [
			"mic drop",
			"obama",
			"winning",
			"nailed it",
			"boom",
			"finished",
			"confident",
			"mlg",
			"airhorn",
			"mic",
			"celebrate",
		],
	},
];

const resolve = (folder, ext) => {
	const [pack, dir] = folder.split("/");
	return path.join(packs[pack], dir, `${dir.replace(/^\d+-/, "")}.${ext}`);
};
const soundManifestPath = path.join(soundOutput, "manifest.json");
const memeManifestPath = path.join(memeOutput, "manifest.json");
const soundManifest = JSON.parse(readFileSync(soundManifestPath, "utf8"));
const memeManifest = JSON.parse(readFileSync(memeManifestPath, "utf8"));
soundManifest.sounds = soundManifest.sounds.filter((s) => !s.sourceFolder);
memeManifest.memes = memeManifest.memes.filter((m) => !m.sourceFolder);

const soundIds = {};
for (const sound of sounds) {
	const number = soundManifest.sounds.length + 1;
	const id = `8c4c2b71-3d8a-41f5-9a42-${String(number).padStart(12, "0")}`;
	const asset = `${String(number).padStart(2, "0")}-${sound.key}.wav`;
	const source = resolve(sound.folder, "mp3");
	// Short 3 ms edge fades, matching the starter pack, avoid clicks; the end fade is applied
	// to the reversed clip so the final sample lands exactly on silence.
	execFileSync(ffmpeg, [
		"-v",
		"error",
		"-y",
		"-i",
		source,
		"-af",
		"aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.003,areverse,afade=t=in:d=0.003,areverse",
		"-c:a",
		"pcm_s16le",
		"-map_metadata",
		"-1",
		"-fflags",
		"+bitexact",
		path.join(soundOutput, asset),
	]);
	const wav = readFileSync(path.join(soundOutput, asset));
	soundIds[sound.key] = id;
	soundManifest.sounds.push({
		id,
		name: sound.name,
		asset,
		durationMs: Math.round((pcmBytes(wav) / 4 / 48000) * 1000),
		color: sound.color,
		sourceFolder: sound.folder,
		sourceUrl: `https://www.youtube.com/watch?v=${sound.video}`,
		sourceSha256: hash(readFileSync(source)),
		sha256: hash(wav),
	});
}

for (const meme of memes) {
	const source = resolve(meme.folder, "gif"),
		original = readFileSync(source),
		sourceSha256 = hash(original);
	const slug = meme.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	const asset = `${String(memeManifest.memes.length + 1).padStart(2, "0")}-${slug}.gif`,
		target = path.join(memeOutput, asset);
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
	const data = readFileSync(target);
	const soundId = soundIds[meme.sound] ?? meme.sound;
	const sound = soundManifest.sounds.find((s) => s.id === soundId);
	if (!sound) throw Error(`No sound for ${meme.name}`);
	console.log(
		`${meme.name}: ${(original.length / 1024).toFixed(0)} → ${(data.length / 1024).toFixed(0)} KB, sound ${sound.name}`,
	);
	memeManifest.memes.push({
		id: `${sourceSha256.slice(0, 8)}-${sourceSha256.slice(8, 12)}-5${sourceSha256.slice(13, 16)}-a${sourceSha256.slice(17, 20)}-${sourceSha256.slice(20, 32)}`,
		name: meme.name,
		description: meme.description,
		tags: meme.tags,
		asset,
		sourceFolder: meme.folder,
		sourceSha256,
		sha256: hash(data),
		width: data.readUInt16LE(6),
		height: data.readUInt16LE(8),
		bytes: data.length,
		soundId,
		// Stay up for the whole GIF and its clip, whichever is longer; keep the 3 s minimum.
		durationSeconds: Math.ceil(Math.max(3, meme.seconds, sound.durationMs / 1000) * 10) / 10,
	});
}
const note = "User-provided meme-pack and meme-pack-2 (GIF + paired audio), 2026-10-16";
memeManifest.additions = [note];
soundManifest.additions = [note];
writeFileSync(soundManifestPath, JSON.stringify(soundManifest, null, 2) + "\n");
writeFileSync(memeManifestPath, JSON.stringify(memeManifest, null, 2) + "\n");
console.log(`Sounds: ${soundManifest.sounds.length}, memes: ${memeManifest.memes.length}`);
