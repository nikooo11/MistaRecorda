import { expect, test } from "vitest";
import { gifSize } from "./gifSize";

// A complete one-pixel GIF, including image data and trailer.
const gif = Buffer.from("R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=", "base64");
test("accepts GIF blocks without converting away their animation", () => {
	expect(gifSize(gif)).toEqual({ width: 1, height: 1 });
	const animated = Buffer.concat([gif.subarray(0, -1), gif.subarray(19)]);
	expect(gifSize(animated)).toEqual({ width: 1, height: 1 });
});
test("rejects malformed or truncated GIF uploads", () => {
	for (let n = 0; n < gif.length; n++) expect(() => gifSize(gif.subarray(0, n))).toThrow();
	const tooLarge = Buffer.from(gif);
	tooLarge.writeUInt16LE(30000, 6);
	expect(() => gifSize(tooLarge)).toThrow();
});
