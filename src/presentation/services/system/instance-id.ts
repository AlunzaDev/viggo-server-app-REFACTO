import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

/** Identifies this API process as the owner of job leases. */
export const INSTANCE_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
