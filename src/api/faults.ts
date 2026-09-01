/**
 * Fault injection.
 *
 * Each fault corresponds to a real failure a roster consumer must survive, and
 * to a validation gate that ought to catch it. Being able to turn them on from
 * a console is what lets a consumer's resilience be demonstrated rather than
 * asserted.
 */
export interface FaultConfig {
  /** Return only this percentage of rows. Simulates a truncated export. */
  truncatePercent: number | null;
  /** Stamp dateLastModified to now on every row, defeating delta sync. */
  stampAllModified: boolean;
  /** Omit these school sourcedIds entirely. Simulates a sharing change. */
  dropSchools: string[];
  /** Duplicate this percentage of rows. */
  duplicatePercent: number | null;
  /** Return HTTP 500 for these collection names. */
  failCollections: string[];
  /** Serve a byte-identical payload regardless of changes upstream. */
  frozenFeed: boolean;
  /** Overlap page boundaries, as a provider under concurrent writes does. */
  unstablePagination: boolean;
  /** Artificial latency in milliseconds. */
  latencyMs: number;
  /** Return 200 with an empty collection. */
  emptyPayload: boolean;
}

export const NO_FAULTS: FaultConfig = {
  truncatePercent: null,
  stampAllModified: false,
  dropSchools: [],
  duplicatePercent: null,
  failCollections: [],
  frozenFeed: false,
  unstablePagination: false,
  latencyMs: 0,
  emptyPayload: false,
};

/**
 * What each fault is for. Surfaced in the console so the person clicking the
 * switch knows which of their own defences they are testing.
 */
export const FAULT_CATALOGUE = [
  {
    key: "truncatePercent",
    label: "Truncated export",
    detail:
      "Returns a fraction of the rows. Indistinguishable from a mass withdrawal in the data, which is why a consumer must halt on row-count collapse rather than guess.",
    gate: "Row count collapse",
  },
  {
    key: "stampAllModified",
    label: "Stamp every dateLastModified",
    detail:
      "Touches the modification timestamp on every row every request. A consumer that trusts the provider's change tracking silently turns its delta into a full sync.",
    gate: "All rows changed",
  },
  {
    key: "dropSchools",
    label: "Drop schools from the share",
    detail:
      "Removes selected schools entirely. This is what a sharing change looks like, and it must not be read as a school closing or its students being deleted.",
    gate: "Org disappearance",
  },
  {
    key: "duplicatePercent",
    label: "Duplicate rows",
    detail:
      "Emits duplicate records. A consumer that does not deduplicate on ingest double counts a class roster.",
    gate: "Deduplication on ingest",
  },
  {
    key: "failCollections",
    label: "Fail selected endpoints",
    detail:
      "Returns 500 for chosen collections while others succeed. A sync that aborts the whole run because one endpoint failed has decided that nothing updates tonight.",
    gate: "Partial availability",
  },
  {
    key: "frozenFeed",
    label: "Frozen feed",
    detail:
      "Serves an identical payload indefinitely. Usually means an upstream export job is failing quietly, and looks like a healthy sync from the outside.",
    gate: "Nothing changed for N runs",
  },
  {
    key: "unstablePagination",
    label: "Unstable pagination",
    detail:
      "Overlaps and skips across page boundaries, as a real provider does when the SIS is written to mid-pagination.",
    gate: "Reconcile against a count",
  },
  {
    key: "emptyPayload",
    label: "Empty payload",
    detail:
      "Returns HTTP 200 with zero rows. Raises no exception anywhere, which is why absence must be alerted on rather than only errors.",
    gate: "Alert on absence, not only error",
  },
  {
    key: "latencyMs",
    label: "Latency",
    detail: "Delays responses. Large districts are slow; a sync must be resumable rather than restarted.",
    gate: "Resumable fetch",
  },
] as const;

export function parseFaults(json: string | null | undefined): FaultConfig {
  if (!json) return { ...NO_FAULTS };
  try {
    const parsed = JSON.parse(json) as Partial<FaultConfig>;
    return { ...NO_FAULTS, ...parsed };
  } catch {
    return { ...NO_FAULTS };
  }
}

export function activeFaultKeys(config: FaultConfig): string[] {
  const active: string[] = [];
  if (config.truncatePercent !== null) active.push("truncatePercent");
  if (config.stampAllModified) active.push("stampAllModified");
  if (config.dropSchools.length > 0) active.push("dropSchools");
  if (config.duplicatePercent !== null) active.push("duplicatePercent");
  if (config.failCollections.length > 0) active.push("failCollections");
  if (config.frozenFeed) active.push("frozenFeed");
  if (config.unstablePagination) active.push("unstablePagination");
  if (config.emptyPayload) active.push("emptyPayload");
  if (config.latencyMs > 0) active.push("latencyMs");
  return active;
}
