import type { ComponentProps } from "react";
import "./windowHeader.css";

/** Matches the inset native controls on Mac; other platforms retain their native frame. */
export function WindowHeader({ className = "", ...props }: ComponentProps<"header">) {
	const isMac = /mac/i.test(navigator.platform);
	return (
		<header
			{...props}
			className={`${className} window-header${isMac ? " window-header-mac" : ""}`}
		/>
	);
}
