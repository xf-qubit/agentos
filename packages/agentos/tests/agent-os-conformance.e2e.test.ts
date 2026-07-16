import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AgentOsConformanceAction,
	type AgentOsConformanceBackend,
	type AgentOsConformanceEvent,
	defineAgentOsConformanceSuite,
} from "@rivet-dev/agentos-test-harness/agent-os-conformance";
import { expect } from "vitest";
import { actorHandle, startActorRuntime } from "./helpers/actor-runtime.js";

const RUN_E2E = process.env.AGENTOS_ACTOR_E2E === "1";
let conformanceHandle: any;

defineAgentOsConformanceSuite({
	name: RUN_E2E
		? "AgentOS real Rivet actor conformance"
		: "AgentOS real Rivet actor conformance (skipped)",
	skip: !RUN_E2E,
	async createBackend(): Promise<AgentOsConformanceBackend> {
		if (!RUN_E2E) {
			return {
				call: async () => undefined as never,
				on: () => () => {},
				dispose: async () => {},
			};
		}
		const storagePath = mkdtempSync(join(tmpdir(), "agentos-conformance-e2e-"));
		const runtime = await startActorRuntime(storagePath);
		const handle = actorHandle(runtime.endpoint, `conformance-${Date.now()}`);
		conformanceHandle = handle;
		const connection = handle.connect();
		const subscriptions = new Set<() => void>();

		return {
			async call<T>(
				action: AgentOsConformanceAction,
				...args: unknown[]
			): Promise<T> {
				const method = handle[action];
				if (typeof method !== "function") {
					throw new Error(`Actor backend does not implement ${action}`);
				}
				return (await method.apply(handle, args)) as T;
			},
			on(
				event: AgentOsConformanceEvent,
				handler: (payload: any) => void,
			): () => void {
				const unsubscribe = connection.on(event, handler);
				const dispose =
					typeof unsubscribe === "function" ? unsubscribe : () => undefined;
				subscriptions.add(dispose);
				return () => {
					subscriptions.delete(dispose);
					dispose();
				};
			},
			async dispose() {
				for (const unsubscribe of subscriptions) unsubscribe();
				connection.dispose?.();
				await runtime.stop();
				rmSync(storagePath, { recursive: true, force: true });
			},
		};
	},
	async verifyBackend() {
		if (!RUN_E2E) return;
		const counts = await conformanceHandle.getHookCounts();
		expect(counts.sessionEvent).toBeGreaterThan(0);
		expect(counts.permissionRequest).toBeGreaterThan(0);
	},
});
