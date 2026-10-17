import { expect, it } from "vitest";
import { PencilContact, intermediatePenSamples, appendPenSamples } from "./pencilInput";
it("rejects a palm throughout its contact but restores finger drawing after pen lift", () => {
	const p = new PencilContact();
	expect(p.down("pen", 1, 0)).toBe(false);
	expect(p.down("touch", 2, 10)).toBe(true);
	p.up(1, 20);
	expect(p.blocked(2)).toBe(true);
	expect(p.down("touch", 3, 50)).toBe(true);
	expect(p.down("touch", 4, 300)).toBe(false);
	expect(p.up(2, 400)).toBe(true);
	expect(p.blocked(2)).toBe(false);
	p.reset();
	expect(p.down("touch", 5, 0)).toBe(false);
});
it("preserves intermediate pressure samples without duplicating the native final point", () => {
	const event = {
		clientX: 130,
		clientY: 150,
		pressure: 0.8,
		getCoalescedEvents: () => [
			{ clientX: 110, clientY: 130, pressure: 0.2 },
			{ clientX: 120, clientY: 140, pressure: 0.6 },
			{ clientX: 130, clientY: 150, pressure: 0.8 },
		],
	};
	const result = appendPenSamples(
		[[0, 0]],
		[0.1],
		intermediatePenSamples(event),
		{ offsetLeft: 10, offsetTop: 30, scrollX: 10, scrollY: 20, zoom: { value: 2 } },
		{ x: 30, y: 20 },
	);
	expect(result).toEqual({
		points: [
			[0, 0],
			[10, 10],
			[15, 15],
		],
		pressures: [0.1, 0.2, 0.6],
	});
});
it("falls back safely when coalesced events are unavailable on Safari or insecure LAN origins", () => {
	expect(intermediatePenSamples({ clientX: 0, clientY: 0, pressure: 0 })).toEqual([]);
	expect(
		intermediatePenSamples({
			clientX: 0,
			clientY: 0,
			pressure: 0,
			getCoalescedEvents: () => {
				throw Error("unsupported");
			},
		}),
	).toEqual([]);
});
