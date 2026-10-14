import type { BoardAPI } from "../../types/board";
export const desktopBoard = (): BoardAPI => window.electronAPI.board;
export function companionTransport(onConnection: (state: string) => void): BoardAPI {
	let socket: WebSocket;
	let nextId = 0;
	const pending = new Map<
		number,
		{
			resolve: (v: unknown) => void;
			reject: (e: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	const listeners = new Map<string, Set<(data: unknown) => void>>();
	const emit = (event: string, data: unknown) => listeners.get(event)?.forEach((cb) => cb(data));
	function connect() {
		const active = new WebSocket(
			`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/connect`,
		);
		socket = active;
		socket.onopen = () => {
			onConnection("Waiting for approval on your computer…");
			socket.send(
				JSON.stringify({
					type: "pair",
					code: location.hash.slice(1),
					token: sessionStorage.getItem("mistarecorda-device"),
					name: /iPad|Macintosh/.test(navigator.userAgent) ? "iPad" : "Drawing companion",
				}),
			);
		};
		socket.onmessage = (e) => {
			const m = JSON.parse(e.data);
			if (m.type === "approved") {
				sessionStorage.setItem("mistarecorda-device", m.token);
				history.replaceState(null, "", location.pathname);
				onConnection("Connected");
				emit("connected", m);
			} else if (m.type === "pending") {
				onConnection("Approve this device in MistaRecorda on your computer.");
			} else if (m.type === "reply") {
				const p = pending.get(m.id);
				if (p) {
					clearTimeout(p.timer);
					p.resolve(m.data);
					pending.delete(m.id);
				}
			} else if (m.type === "error") {
				onConnection(m.message);
				emit("error", m.message);
				for (const p of pending.values()) {
					clearTimeout(p.timer);
					p.reject(Error(m.message));
				}
				pending.clear();
			} else emit(m.type, m.data);
		};
		socket.onclose = () => {
			if (socket !== active) return;
			onConnection("Disconnected. Tap Reconnect after checking MistaRecorda and Wi-Fi.");
			emit("disconnected", null);
			for (const p of pending.values()) {
				clearTimeout(p.timer);
				p.reject(Error("Disconnected"));
			}
			pending.clear();
		};
	}
	connect();
	return {
		request<T>(method: string, input?: unknown) {
			if (method === "reconnect") {
				socket.close();
				connect();
				return Promise.resolve(true as T);
			}
			return new Promise<T>((resolve, reject) => {
				if (socket.readyState !== WebSocket.OPEN) {
					reject(Error("Not connected"));
					return;
				}
				const id = ++nextId;
				const timer = setTimeout(() => {
					pending.delete(id);
					reject(Error("Request timed out"));
				}, 15000);
				pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
				socket.send(JSON.stringify({ type: "request", id, method, input }));
			});
		},
		on<T>(event: string, cb: (data: T) => void) {
			const set = listeners.get(event) ?? new Set();
			listeners.set(event, set);
			const handler = (data: unknown) => cb(data as T);
			set.add(handler);
			return () => {
				set.delete(handler);
			};
		},
	};
}
