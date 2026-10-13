function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, freezeCopy(item)])
    ));
  }
  return value;
}

export function publicEvidencePlanProposal(proposal) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return proposal;
  if (proposal.status !== "PROPOSED" || !Array.isArray(proposal.partitions)) {
    return freezeCopy(proposal);
  }

  return freezeCopy({
    ...proposal,
    partitions: proposal.partitions.map((entry) => (
      entry?.role === "SEALED_HOLDOUT"
        ? { role: "SEALED_HOLDOUT", partition: { sealed: true } }
        : entry
    ))
  });
}
