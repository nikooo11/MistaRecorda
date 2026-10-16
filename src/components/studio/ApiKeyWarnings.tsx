import { useEffect, useState } from "react";
import type { ApiKeyCheck } from "../../types/apiKeyHealth";

export function useApiKeyHealth() {
	const [checks, setChecks] = useState<ApiKeyCheck[]>([]);
	useEffect(() => {
		let disposed = false;
		const off = window.electronAPI.board.on<ApiKeyCheck[]>("apiKeyHealth", setChecks);
		void window.electronAPI.board
			.request<ApiKeyCheck[]>("apiKeyHealth")
			.then((value) => {
				if (!disposed) setChecks(value);
			})
			.catch(() => undefined);
		return () => {
			disposed = true;
			off();
		};
	}, []);
	return checks;
}

export function ApiKeyWarnings() {
	const issues = useApiKeyHealth().filter((check) => check.message);
	if (!issues.length) return null;
	return (
		<aside className="api-key-warning" role="alert" aria-label="API key status">
			<div>
				{issues.map((check) => (
					<p key={check.provider}>{check.message}</p>
				))}
			</div>
			<button onClick={() => void window.electronAPI.studio.request("open", "setup")}>
				Update API keys
			</button>
		</aside>
	);
}
