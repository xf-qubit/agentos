import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	actorBytes,
	actorHandle,
	createActorHandle,
	startActorRuntime,
} from "./helpers/actor-runtime.js";

const RUN_E2E = process.env.AGENTOS_ACTOR_E2E === "1";

describe.skipIf(!RUN_E2E)("AgentOS real Rivet actor", () => {
	test("persists direct-UDS filesystem chunks across sleep and engine restart", async () => {
		const storagePath = mkdtempSync(join(tmpdir(), "agentos-actor-e2e-"));
		const actorKey = `persistence-${Date.now()}`;
		let runtime: Awaited<ReturnType<typeof startActorRuntime>> | undefined;
		try {
			runtime = await startActorRuntime(storagePath);
			let handle = await createActorHandle(runtime.endpoint, actorKey, {
				workspace: "actor-input",
			});

			expect(await handle.echo("custom-action-ok")).toBe("custom-action-ok");
			expect(await handle.getCreationInput()).toEqual({
				workspace: "actor-input",
			});
			expect(await handle.getWakeCount()).toBe(1);
			await handle.mkdir("/persist");
			await handle.writeFile("/persist/message.txt", "survives sleep");
			const large = new Uint8Array(2 * 1024 * 1024 + 17);
			for (let index = 0; index < large.length; index += 1) {
				large[index] = index % 251;
			}
			await handle.writeFile("/persist/chunked.bin", large);

			const storage = await handle.inspectAgentOsStorage();
			expect(storage.tables).toEqual([
				"agentos_vfs_blocks",
				"agentos_vfs_metadata_chunks",
				"agentos_vfs_metadata_heads",
			]);
			expect(storage.metadataCount).toBe(1);
			expect(storage.metadataChunkCount).toBeGreaterThan(0);
			expect(storage.metadataChunkBytes).toBeGreaterThan(0);
			expect(storage.blockCount).toBeGreaterThan(0);
			expect(storage.blockBytes).toBeGreaterThan(0);

			await handle.sleepActor();
			await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
			expect(await handle.getWakeCount()).toBe(2);
			expect(
				new TextDecoder().decode(
					actorBytes(await handle.readFile("/persist/message.txt")),
				),
			).toBe("survives sleep");
			expect(actorBytes(await handle.readFile("/persist/chunked.bin"))).toEqual(
				large,
			);

			const restartPort = Number(new URL(runtime.endpoint).port);
			await runtime.stop();
			runtime = await startActorRuntime(storagePath, restartPort);
			handle = actorHandle(runtime.endpoint, actorKey);
			expect(await handle.getCreationInput()).toEqual({
				workspace: "actor-input",
			});
			expect(
				new TextDecoder().decode(
					actorBytes(await handle.readFile("/persist/message.txt")),
				),
			).toBe("survives sleep");
			expect(actorBytes(await handle.readFile("/persist/chunked.bin"))).toEqual(
				large,
			);
			expect(await handle.getWakeCount()).toBe(3);
		} finally {
			await runtime?.stop();
			rmSync(storagePath, { recursive: true, force: true });
		}
	}, 180_000);
});
