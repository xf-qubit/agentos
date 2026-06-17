import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { checkRustPackageMetadata } from "./check-rust-package-metadata.mjs";

const root = resolve(import.meta.dirname, "..");

function pkg(name, manifestPath, targets, overrides = {}) {
	return {
		name,
		manifest_path: resolve(root, manifestPath),
		publish: null,
		license: "Apache-2.0",
		repository: "https://github.com/rivet-dev/agent-os",
		description: `${name} description`,
		targets,
		...overrides,
	};
}

const validMetadata = {
	packages: [
		pkg("agent-os-protocol", "crates/agent-os-protocol/Cargo.toml", [
			{ kind: ["lib"], name: "agent_os_protocol" },
		]),
		pkg("agent-os-sidecar", "crates/agent-os-sidecar/Cargo.toml", [
			{ kind: ["lib"], name: "agent_os_sidecar_wrapper" },
			{ kind: ["bin"], name: "agent-os-sidecar" },
		]),
		pkg("agent-os-client", "crates/client/Cargo.toml", [
			{ kind: ["lib"], name: "agent_os_client" },
		]),
	],
};

test("accepts expected Rust package metadata", () => {
	assert.deepEqual(checkRustPackageMetadata({ root, metadata: validMetadata }), []);
});

test("rejects stale agent-os-client lib target names", () => {
	const metadata = structuredClone(validMetadata);
	const client = metadata.packages.find((item) => item.name === "agent-os-client");
	client.targets[0].name = "secure_exec_client";

	assert.deepEqual(checkRustPackageMetadata({ root, metadata }), [
		"agent-os-client must expose a lib target named agent_os_client",
	]);
});

test("rejects non-publishable required Rust packages", () => {
	const metadata = structuredClone(validMetadata);
	const client = metadata.packages.find((item) => item.name === "agent-os-client");
	client.publish = false;

	assert.deepEqual(checkRustPackageMetadata({ root, metadata }), [
		"agent-os-client must remain publishable",
	]);
});
