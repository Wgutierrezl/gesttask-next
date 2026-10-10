import { runCommentContract } from "@tests/support/contracts/comments.contract";
import { drizzleHarness } from "../support/harness";

runCommentContract("Drizzle + Postgres", drizzleHarness);
