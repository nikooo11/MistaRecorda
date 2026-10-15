import {
	createContext,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
	type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import {
	SETTING_HELP,
	SETTINGS_TOURS,
	type SettingHelpId,
	type SettingsTourRequest,
} from "./settingHelpContent";
import type { StudioTab } from "../../types/studio";
import "./settingHelp.css";

function HelpCopy({ id }: { id: SettingHelpId }) {
	const help = SETTING_HELP[id];
	return (
		<>
			<p>{help.what}</p>
			<p>
				<strong>When to use it</strong>
				{help.when}
			</p>
			<p>
				<strong>How to use it</strong>
				{help.how}
			</p>
		</>
	);
}

/** Kept inline so HUD mouse hit-testing includes the help and its close button. */
export function SettingHelp({ id }: { id: SettingHelpId }) {
	const titleId = useId();
	return (
		<Popover.Root>
			<Popover.Trigger asChild>
				<button
					type="button"
					className="setting-help-button"
					aria-label={`Help: ${SETTING_HELP[id].title}`}
					title={`Help: ${SETTING_HELP[id].title}`}
					data-hud-interactive
				>
					?
				</button>
			</Popover.Trigger>
			<Popover.Content
				className="setting-help-popup"
				side="bottom"
				align="end"
				sideOffset={8}
				collisionPadding={10}
				aria-labelledby={titleId}
				data-hud-interactive
			>
				<header>
					<strong id={titleId}>{SETTING_HELP[id].title}</strong>
					<Popover.Close aria-label="Close setting help">×</Popover.Close>
				</header>
				<HelpCopy id={id} />
				<Popover.Arrow className="setting-help-arrow" />
			</Popover.Content>
		</Popover.Root>
	);
}

interface TourContext {
	target?: SettingHelpId;
	index: number;
	count: number;
	move: (delta: number) => void;
	end: () => void;
}
const Tour = createContext<TourContext | undefined>(undefined);
export function useSettingsTourTarget() {
	return useContext(Tour)?.target;
}
export function SettingsTourProvider({
	request,
	navigate,
	children,
}: {
	request?: SettingsTourRequest;
	navigate: (tab: StudioTab) => void;
	children: ReactNode;
}) {
	const [tour, setTour] = useState<SettingsTourRequest>();
	const [index, setIndex] = useState(0);
	const navigateRef = useRef(navigate);
	navigateRef.current = navigate;
	useEffect(() => {
		if (!request) return;
		setTour(request);
		setIndex(Math.max(0, Math.min(request.start, SETTINGS_TOURS[request.id].length - 1)));
	}, [request?.token]);
	const steps = tour ? SETTINGS_TOURS[tour.id] : undefined;
	const target = steps?.[index];
	useEffect(() => {
		if (target) navigateRef.current(target.tab);
	}, [target, tour?.token]);
	return (
		<Tour.Provider
			value={{
				target: target?.id,
				index,
				count: steps?.length ?? 0,
				move: (delta) =>
					setIndex((current) =>
						Math.max(0, Math.min(current + delta, (steps?.length ?? 1) - 1)),
					),
				end: () => {
					setTour(undefined);
					void window.electronAPI.studio
						.request("endSettingsHelp", tour?.token)
						.catch(() => undefined);
				},
			}}
		>
			{children}
		</Tour.Provider>
	);
}

/** The guide sits immediately above and points into the live control, never intercepting its clicks. */
export function HelpTarget({ id, children }: { id: SettingHelpId; children: ReactNode }) {
	const tour = useContext(Tour);
	const active = tour?.target === id;
	const heading = useRef<HTMLHeadingElement>(null);
	const titleId = useId();
	const [error, setError] = useState("");
	useEffect(() => {
		if (!active) return;
		const frame = requestAnimationFrame(() => {
			heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
			heading.current?.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}, [active]);
	return (
		<div
			className={active ? "setting-tour-target active" : "setting-tour-target"}
			data-setting-target={id}
		>
			{active && (
				<aside className="setting-tour-callout" aria-labelledby={titleId}>
					<header>
						<span>
							On-screen guide · {tour.index + 1} / {tour.count}
						</span>
						<button type="button" onClick={tour.end}>
							End tour
						</button>
					</header>
					<h3 ref={heading} id={titleId} tabIndex={-1}>
						{SETTING_HELP[id].title}
					</h3>
					<HelpCopy id={id} />
					<nav aria-label="On-screen guide">
						<button
							type="button"
							onClick={() => tour.move(-1)}
							disabled={tour.index === 0}
						>
							Back
						</button>
						<button
							type="button"
							onClick={async () => {
								try {
									await window.electronAPI.studio.request("openSettingsGuide");
									tour.end();
								} catch {
									setError(
										"Could not reopen the tutorial. Try Settings tutorial in the header.",
									);
								}
							}}
						>
							Tutorial
						</button>
						<button
							type="button"
							onClick={() =>
								tour.index + 1 === tour.count ? tour.end() : tour.move(1)
							}
						>
							{tour.index + 1 === tour.count ? "Done" : "Next"}
						</button>
					</nav>
					{error && <p role="alert">{error}</p>}
					<span className="setting-tour-pointer" aria-hidden="true">
						↓
					</span>
				</aside>
			)}
			<div className="setting-tour-control">{children}</div>
		</div>
	);
}
