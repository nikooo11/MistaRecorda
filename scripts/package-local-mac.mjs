import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Package the completed build with one persistent identity. Do not silently
// fall back to ad-hoc signing: that invalidates macOS privacy grants on updates.
if (process.platform !== "darwin") throw Error("Local Mac packaging requires macOS.");
const identity = process.env.CSC_NAME?.trim() || "MistaRecorda Local Development";
if (identity === "-") throw Error("A persistent signing certificate is required.");
const identities = execFileSync("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"], {
	encoding: "utf8",
});
const matches = [...identities.matchAll(/\b([A-Fa-f0-9]{40}) "([^"]+)"/g)].filter(
	([, hash, name]) => name === identity || hash.toLowerCase() === identity.toLowerCase(),
);
if (matches.length !== 1) {
	throw Error(
		`Expected one valid code-signing identity named "${identity}". Create it in Keychain Access or set CSC_NAME to your existing Apple signing identity. Nothing was packaged or installed.`,
	);
}
const builder = fileURLToPath(new URL("../node_modules/electron-builder/cli.js", import.meta.url));
execFileSync(
	process.execPath,
	[
		builder,
		"--mac",
		`--${process.arch}`,
		"--dir",
		"--publish",
		"never",
		`--config.mac.identity=${matches[0][2]}`,
		"--config.forceCodeSigning=true",
		"--config.mac.timestamp=none",
	],
	{ stdio: "inherit" },
);
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
if (!requirement.includes("designated =>") || /designated => cdhash\b/.test(requirement)) {
	throw Error("The packaged app lacks a persistent code requirement. Do not install it.");
}
console.log("Packaged with a persistent signing identity; installation is a separate step.");
