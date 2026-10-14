import { execFileSync } from "node:child_process";
import { mkdtempSync, chmodSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Run only after the user approves this login-Keychain change. No sudo, system
// trust changes, privacy resets, or broad private-key access are used.
if (process.platform !== "darwin" || !process.argv.includes("--create")) {
	throw Error("On macOS, pass --create only after approving local signing setup.");
}
const name = "MistaRecorda Local Development";
const run = (file, args) => {
	try {
		return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	} catch (error) {
		throw Error(
			`${path.basename(file)} failed: ${String(error.stderr || "operation rejected").trim()}`,
		);
	}
};
const keychain = run("/usr/bin/security", ["default-keychain", "-d", "user"])
	.trim()
	.replace(/^"|"$/g, "");
let existing = "";
try {
	existing = run("/usr/bin/security", ["find-certificate", "-c", name, "-p", keychain]);
} catch {
	/* No existing identity. */
}
const temporary = mkdtempSync(path.join(tmpdir(), "mistarecorda-signing-"));
chmodSync(temporary, 0o700);
try {
	const cert = path.join(temporary, "certificate.pem");
	if (existing) {
		writeFileSync(cert, existing, { mode: 0o600 });
	} else {
		const config = path.join(temporary, "certificate.conf");
		writeFileSync(
			config,
			`[req]\nprompt=no\ndistinguished_name=subject\nx509_extensions=extensions\n[subject]\nCN=${name}\n[extensions]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\nsubjectKeyIdentifier=hash\n`,
			{ mode: 0o600 },
		);
		const key = path.join(temporary, "private-key.pem");
		run("/usr/bin/openssl", [
			"req",
			"-new",
			"-newkey",
			"rsa:3072",
			"-nodes",
			"-x509",
			"-sha256",
			"-days",
			"3650",
			"-config",
			config,
			"-keyout",
			key,
			"-out",
			cert,
		]);
		chmodSync(key, 0o600);
		// A disposable transport password avoids empty-password PKCS#12 importer
		// incompatibilities. It is not an account/Keychain password and is never logged.
		const transportPassword = randomBytes(32).toString("hex");
		const passFile = path.join(temporary, "transport-password");
		writeFileSync(passFile, transportPassword, { mode: 0o600 });
		const container = path.join(temporary, "identity.p12");
		run("/usr/bin/openssl", [
			"pkcs12",
			"-export",
			"-inkey",
			key,
			"-in",
			cert,
			"-name",
			name,
			"-out",
			container,
			"-keypbe",
			"PBE-SHA1-3DES",
			"-certpbe",
			"PBE-SHA1-3DES",
			"-macalg",
			"sha1",
			"-passout",
			`file:${passFile}`,
		]);
		chmodSync(container, 0o600);
		run("/usr/bin/security", [
			"import",
			container,
			"-k",
			keychain,
			"-f",
			"pkcs12",
			"-P",
			transportPassword,
			"-T",
			"/usr/bin/codesign",
		]);
	}
	// Only code-signing trust in this user's domain. Other policies stay unchanged.
	run("/usr/bin/security", [
		"add-trusted-cert",
		"-r",
		"trustRoot",
		"-p",
		"codeSign",
		"-k",
		keychain,
		cert,
	]);
	const identities = run("/usr/bin/security", [
		"find-identity",
		"-v",
		"-p",
		"codesigning",
		keychain,
	]);
	if (!identities.includes(`"${name}"`))
		throw Error("The local signing identity is not available; inspect Keychain Access.");
	console.log(
		`Ready: ${name}. Private key stored in your login Keychain; temporary key files removed.`,
	);
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
