import { createWorld as createRivetWorld } from "@rivet-dev/vercel-world";
import { registry } from "./registry";

export const createWorld = () => createRivetWorld({ registry });
