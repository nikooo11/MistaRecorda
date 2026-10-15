import { expect, test } from "vitest";
import { readGuideProgress } from "./guideContent";
test("resumes only supported, bounded integer progress from saved settings", () => {
	expect(readGuideProgress(null)).toEqual({});
	expect(readGuideProgress("record")).toEqual({});
	expect(readGuideProgress({ record: 2, stream: 4, other: 3 })).toEqual({ record: 2, stream: 4 });
	expect(readGuideProgress({ record: -2, stream: 99 })).toEqual({ record: 0, stream: 4 });
	expect(readGuideProgress({ record: 2.5, stream: NaN })).toEqual({});
});
