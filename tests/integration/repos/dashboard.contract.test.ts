import { runDashboardContract } from "@tests/support/contracts/dashboard.contract";
import { drizzleHarness } from "../support/harness";

runDashboardContract("Drizzle + Postgres", drizzleHarness);
