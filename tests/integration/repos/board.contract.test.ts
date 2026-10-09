import { runBoardContract } from "@tests/support/contracts/boards.contract";
import { drizzleHarness } from "../support/harness";

runBoardContract("Drizzle + Postgres", drizzleHarness);
