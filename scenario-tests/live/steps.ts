// Live BDD steps — reuse the orchestrator-runner defs but wire a real
// Connection + real adapters. Deliberately a stub: the live workflow is
// triggered manually via the `integration` PR label (see nightly.yml later).
// When ready, replace the imports below with adapter factories from
// @kast/kamino-adapter and @kast/mayan-adapter and thread a throwaway
// Keypair through the world.
import '../orchestrator/steps.js';
