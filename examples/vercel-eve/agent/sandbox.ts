import { agentOSBackend } from "@rivet-dev/agentos-eve";
import { defineSandbox } from "eve/sandbox";
import { registry } from "../registry";

export default defineSandbox({
	backend: agentOSBackend({ actor: "vm", registry }),
});
