export interface StreamDriverStatus {
	platform: string;
	installed: boolean;
	version?: string;
	phase: "idle" | "downloading" | "verifying" | "installer-open";
	error?: string;
}
