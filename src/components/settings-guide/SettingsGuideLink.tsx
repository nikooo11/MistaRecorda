import { useState } from "react";

export function SettingsGuideLink() {
	const [error, setError] = useState("");
	return (
		<span>
			<button
				type="button"
				className="settings-guide-link"
				title="A short guide to recommended recording and streaming settings, with examples."
				onClick={() => {
					setError("");
					void window.electronAPI.studio
						.request("openSettingsGuide")
						.catch(() => setError("Could not open the tutorial. Please try again."));
				}}
			>
				Settings tutorial
			</button>
			{error && <small role="alert">{error}</small>}
		</span>
	);
}
