import pack from "../../public/assets/memes/starter-v1/manifest.json";

export const bundledMemes = pack.memes;
export const bundledMemeURL = (asset: string) => {
	const hash = bundledMemes.find((m) => m.asset === asset)?.sha256.slice(0, 12);
	return `assets/memes/starter-v1/${asset}?v=${hash}`;
};
export const bundledMemeFromURL = (url: string) =>
	bundledMemes.find((meme) => bundledMemeURL(meme.asset) === url);
