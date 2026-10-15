import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Wrap an already-signed local app. This never installs it or bundles drivers.
// Public releases use the Developer ID Installer certificate in release.yml.
if (process.platform !== "darwin") throw Error("Mac installer packaging requires macOS.");
const bundle = fileURLToPath(
	new URL(
		`../release/mac${process.arch === "arm64" ? "-arm64" : ""}/MistaRecorda.app`,
		import.meta.url,
	),
);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle], { stdio: "inherit" });
const requirement = execFileSync("/usr/bin/codesign", ["-d", "-r-", bundle], {
	encoding: "utf8",
	stdio: ["ignore", "pipe", "pipe"],
});
if (!requirement.includes("designated =>") || /designated => cdhash\b/.test(requirement))
	throw Error("Package the app with its persistent identity first.");
const builder = fileURLToPath(new URL("../node_modules/electron-builder/cli.js", import.meta.url));
const environment = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" };
for (const key of [
	"CSC_LINK",
	"CSC_INSTALLER_LINK",
	"CSC_NAME",
	"CSC_KEY_PASSWORD",
	"CSC_INSTALLER_KEY_PASSWORD",
])
	delete environment[key];
execFileSync(
	process.execPath,
	[
		builder,
		"--mac",
		"pkg",
		`--${process.arch}`,
		"--prepackaged",
		bundle,
		"--publish",
		"never",
		"--config.forceCodeSigning=false",
		"--config.mac.notarize=false",
		"--config.mac.identity=null",
		"--config.pkg.artifactName=${productName}-local-${arch}.${ext}",
	],
	{
		stdio: "inherit",
		env: environment,
	},
);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle], { stdio: "inherit" });
console.log(
	"Local .pkg created. Its app is signed; this local installer container is not signed/notarized for public distribution. No driver is bundled or installed.",
);
