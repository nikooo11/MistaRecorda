export interface StreamRouting {
	input: string;
	output: string;
	monitor: string;
	outputLabel: string;
	inputLabel: string;
	virtualOutputConfirmed: true;
}
export interface StreamStatus {
	active: boolean;
	outputLabel: string;
	routing?: StreamRouting;
}
export interface AudioDevice {
	id: string;
	label: string;
	kind: "audioinput" | "audiooutput";
	groupId: string;
}
