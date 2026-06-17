import { describe, expect, it } from "vitest";
import { AgentOs } from "../src/agent-os.js";

const SESSION_ID = "session-1";

function createSessionUpdateNotification(text: string) {
	return {
		jsonrpc: "2.0" as const,
		method: "session/update",
		params: {
			update: {
				sessionUpdate: "agent_message_chunk",
				content: {
					text,
				},
			},
		},
	};
}

function createTrackedAgent(initialTexts: string[] = []) {
	const agent = Object.create(AgentOs.prototype) as AgentOs & {
		_sessions: Map<string, unknown>;
		_recordSessionNotification: (
			session: Record<string, unknown>,
			notification: ReturnType<typeof createSessionUpdateNotification>,
		) => void;
	};

	const trackedSession = {
		sessionId: SESSION_ID,
		agentType: "codex",
		processId: "proc-1",
		pid: null,
		closed: false,
		modes: null,
		configOptions: [],
		capabilities: {},
		agentInfo: null,
		eventHandlers: new Set(),
		permissionHandlers: new Set(),
		configOverrides: new Map(),
		pendingPermissionReplies: new Map(),
	};

	agent._sessions = new Map([[SESSION_ID, trackedSession]]);
	return { agent, trackedSession };
}

function readText(event: { params?: unknown }): string {
	const params = event.params as {
		update?: { content?: { text?: string } };
	};
	return params.update?.content?.text ?? "";
}

async function flushSessionEventDispatch(): Promise<void> {
	await Promise.resolve();
}

describe("AgentOs session event ordering", () => {
	it("subscribes to live events without replaying buffered history", async () => {
		const { agent, trackedSession } = createTrackedAgent(["alpha", "beta"]);
		const seen: string[] = [];

		const unsubscribe = agent.onSessionEvent(SESSION_ID, (event) => {
			seen.push(readText(event));
		});

		expect(seen).toEqual([]);

		agent._recordSessionNotification(
			trackedSession,
			createSessionUpdateNotification("delta"),
		);
		agent._recordSessionNotification(
			trackedSession,
			createSessionUpdateNotification("gamma"),
		);
		await flushSessionEventDispatch();

		expect(seen).toEqual(["delta", "gamma"]);

		unsubscribe();
		agent._recordSessionNotification(
			trackedSession,
			createSessionUpdateNotification("epsilon"),
		);
		await flushSessionEventDispatch();

		expect(seen).toEqual(["delta", "gamma"]);
	});

	it("delivers live sidecar events to subscribers in arrival order", async () => {
		const { agent, trackedSession } = createTrackedAgent();
		const seen: string[] = [];

		agent.onSessionEvent(SESSION_ID, (event) => {
			seen.push(readText(event));
		});

		agent._recordSessionNotification(
			trackedSession,
			createSessionUpdateNotification("second"),
		);
		agent._recordSessionNotification(
			trackedSession,
			createSessionUpdateNotification("first"),
		);
		await flushSessionEventDispatch();

		expect(seen).toEqual(["second", "first"]);
	});
});
