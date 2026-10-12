import { resolveManagedResearchGrowthLimits } from "./growth-governance.js";
import { openManagedResearchDomain as openCoreManagedResearchDomain } from "./managed-domain-core.js";

export async function openManagedResearchDomain(options = {}) {
  const growthLimits = options.growthLimits
    ?? resolveManagedResearchGrowthLimits(options.resourcePolicy);
  return await openCoreManagedResearchDomain({
    ...options,
    growthLimits
  });
}
