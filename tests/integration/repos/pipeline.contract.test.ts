import { runPipelineContract } from "@tests/support/contracts/pipelines.contract";
import { drizzleHarness } from "../support/harness";

runPipelineContract("Drizzle + Postgres", drizzleHarness);
