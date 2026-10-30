import { runMonteCarloSimulation } from '../engine/monteCarloRunner.ts';
import type { SimulationWorkerRequest, SimulationWorkerResponse } from '../engine/types.ts';

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const req = event.data;
  if (!req || req.type !== 'RUN_SIMULATION') return;

  try {
    const result = runMonteCarloSimulation({
      userLineup: req.userLineup,
      userTeamId: req.userTeamId ?? 'AL-E-1',
      seasons: req.seasons,
      seed: req.seed,
      onProgress: (completedSeasons, totalSeasons) => {
        const progressMsg: SimulationWorkerResponse = {
          type: 'PROGRESS',
          completedSeasons,
          totalSeasons,
        };
        self.postMessage(progressMsg);
      },
    });

    const completeMsg: SimulationWorkerResponse = {
      type: 'COMPLETE',
      result,
    };
    self.postMessage(completeMsg);
  } catch (err) {
    const errorMsg: SimulationWorkerResponse = {
      type: 'ERROR',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errorMsg);
  }
};
