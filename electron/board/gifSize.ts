/** Validate GIF block boundaries without flattening an animated upload to a PNG. */
export function gifSize(data: Buffer): { width: number; height: number } {
	const invalid = () => {
		throw Error("Choose a valid GIF.");
	};
	if (data.length < 14 || !["GIF87a", "GIF89a"].includes(data.toString("ascii", 0, 6)))
		return invalid();
	const width = data.readUInt16LE(6),
		height = data.readUInt16LE(8);
	if (!width || !height || width > 20000 || height > 20000) return invalid();
	let i = 13 + (data[10] & 128 ? 3 * 2 ** ((data[10] & 7) + 1) : 0);
	let frames = 0;
	const blocks = () => {
		while (i < data.length) {
			const size = data[i++];
			if (!size) return;
			i += size;
			if (i > data.length) invalid();
		}
		invalid();
	};
	while (i < data.length) {
		const marker = data[i++];
		if (marker === 0x3b) {
			if (frames > 0) return { width, height };
			return invalid();
		}
		if (marker === 0x21) {
			i++;
			blocks();
			continue;
		}
		if (marker !== 0x2c || i + 9 >= data.length) return invalid();
		const frameWidth = data.readUInt16LE(i + 4),
			frameHeight = data.readUInt16LE(i + 6);
		if (!frameWidth || !frameHeight || frameWidth > 20000 || frameHeight > 20000)
			return invalid();
		const packed = data[i + 8];
		i += 9 + (packed & 128 ? 3 * 2 ** ((packed & 7) + 1) : 0);
		const lzw = data[i++];
		if (lzw < 2 || lzw > 8 || i >= data.length) return invalid();
		blocks();
		frames++;
	}
	return invalid();
}
