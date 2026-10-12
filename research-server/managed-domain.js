import { resolveManagedResearchGrowthLimits } from "./growth-governance.js";
import { openManagedResearchDomain as openCoreManagedResearchDomain } from "./managed-domain-core.js";

export async function openManagedResearchDomain(options = {}) {
  if (options.growthLimits !== undefined) {
    throw new TypeError("growthLimits is server-owned by managed research resource policy");
  }
  const growthLimits = resolveManagedResearchGrowthLimits(options.resourcePolicy);
  const core = await openCoreManagedResearchDomain({
    ...options,
    growthLimits
  });
  return Object.freeze({
    ...core,
    resourceLimits: Object.freeze({
      ...core.resourceLimits,
      growth: growthLimits
    })
  });
}
