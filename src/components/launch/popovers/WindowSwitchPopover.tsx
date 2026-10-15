import { useState } from "react";
import { StackIcon } from "@phosphor-icons/react";
import { Button } from "../../ui/button";
import { toast } from "sonner";

/** Opens the editable source list directly, alongside saved environments. */
export function WindowSwitchPopover({ disabled }: { recording: boolean; disabled?: boolean }) {
	const [busy, setBusy] = useState(false);
	return (
		<Button
			variant="ghost"
			data-hud-icon
			size="icon"
			disabled={disabled || busy}
			aria-label="Layers and environments"
			title="Layers · screens, windows, environments and shortcuts"
			onClick={async () => {
				setBusy(true);
				try {
					await window.electronAPI.studio.request("togglePanel", "layers");
				} catch (error) {
					toast.error((error as Error).message);
				} finally {
					setBusy(false);
				}
			}}
		>
			<StackIcon size={16} />
		</Button>
	);
}
