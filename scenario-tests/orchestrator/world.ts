import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import type { PositionState } from '@kast/orchestrator';
import type { ObligationView, PersistedOrder } from '@kast/shared';

export class KastWorld extends World {
  state: PositionState = 'IDLE';
  obligation: ObligationView | null = null;
  baseUsdc = 0n;
  pendingOrders: PersistedOrder[] = [];
  derived?: PositionState;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(KastWorld);
