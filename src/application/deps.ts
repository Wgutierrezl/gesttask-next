import type { Repos, UnitOfWork } from "./ports/repositories";
import type { Clock, IdGenerator } from "./ports/services";

/** What every use-case factory receives from the composition root. */
export interface AppDeps {
  uow: UnitOfWork;
  /** Non-transactional repositories for reads. */
  repos: Repos;
  clock: Clock;
  ids: IdGenerator;
}
