import { afterEach, expect, test, vi } from "vitest";
import { CountdownSession } from "./countdownSession";
afterEach(() => vi.useRealTimers());
test("cancel resolves Start immediately and a second countdown can complete", async () => {
	vi.useFakeTimers();
	const tick = vi.fn();
	const session = new CountdownSession(tick);
	const first = session.start(3);
	session.cancel();
	await expect(first).resolves.toEqual({ success: false, cancelled: true });
	expect(session.remaining).toBeNull();
	const second = session.start(3);
	vi.advanceTimersByTime(2000);
	expect(session.remaining).toBe(1);
	vi.advanceTimersByTime(1000);
	await expect(second).resolves.toEqual({ success: true });
	expect(tick.mock.calls.map((c) => c[0])).toEqual([3, null, 3, 2, 1, null]);
});
test("a duplicate start cannot replace an active gate and invalid delay creates no timer", async () => {
	vi.useFakeTimers();
	const session = new CountdownSession(() => {});
	await expect(session.start(NaN)).resolves.toMatchObject({ success: false });
	const active = session.start(5);
	await expect(session.start(1)).resolves.toMatchObject({ success: false });
	session.cancel();
	await expect(active).resolves.toMatchObject({ cancelled: true });
	expect(vi.getTimerCount()).toBe(0);
});
