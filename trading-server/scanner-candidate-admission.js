import { createScannerCandidateHandoff } from "./scanner-candidate-handoff.js";

export async function admitScannerCandidate({
  ledger,
  tradingRunId,
  policyVersionId,
  result,
  context,
  resultRank,
  admittedAtMs
}) {
  if (!ledger || typeof ledger.createTradeEpisode !== "function") {
    throw new TypeError("ledger must expose createTradeEpisode().");
  }

  const handoff = createScannerCandidateHandoff({
    result,
    context,
    resultRank,
    admittedAtMs
  });

  return ledger.createTradeEpisode({
    tradingRunId,
    policyVersionId,
    candidateKey: handoff.candidateKey,
    candidateProvenance: handoff.candidateProvenance
  });
}
