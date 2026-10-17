import { describe, expect, it } from "vitest";
import { changeTabletPanel, type TabletPanelState } from "./tabletPanelState";

const expanded: TabletPanelState = { collapsed: false, minimized: false, fullScreen: false };
describe("iPad collapse and minimize", () => {
	it("collapses to a visible title bar without minimizing", () => {
		const collapsed = changeTabletPanel(expanded, "collapse");
		expect(collapsed).toEqual({ ...expanded, collapsed: true });
		expect(changeTabletPanel(collapsed, "collapse")).toEqual(expanded);
	});
	it("always reopens expanded, including a panel minimized while collapsed", () => {
		const collapsed = changeTabletPanel(expanded, "collapse");
		for (const action of ["minimize", "dock"] as const) {
			const hidden = changeTabletPanel(collapsed, action);
			expect(hidden.minimized).toBe(true);
			expect(changeTabletPanel(hidden, "dock")).toEqual(expanded);
			expect(changeTabletPanel(hidden, "open")).toEqual(expanded);
		}
	});
	it("the side icon minimizes either expanded or collapsed panels", () => {
		for (const collapsed of [false, true]) {
			expect(changeTabletPanel({ ...expanded, collapsed }, "dock").minimized).toBe(true);
		}
	});
	it("leaves full-screen reading when collapsed or minimized, then reopens floating", () => {
		const full = changeTabletPanel(expanded, "fullScreen");
		expect(full.fullScreen).toBe(true);
		expect(changeTabletPanel(full, "collapse")).toEqual({ ...expanded, collapsed: true });
		expect(changeTabletPanel(changeTabletPanel(full, "minimize"), "dock")).toEqual(expanded);
	});
});
