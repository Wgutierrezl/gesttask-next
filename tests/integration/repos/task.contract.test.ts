import { runTaskContract } from "@tests/support/contracts/tasks.contract";
import { drizzleHarness } from "../support/harness";

runTaskContract("Drizzle + Postgres", drizzleHarness);
