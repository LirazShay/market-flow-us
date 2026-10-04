# Market Flow US Baseline Provenance

## Imported baseline

The repository was initialized from the exact `market-scope/main` file tree at:

```text
source repo:   LirazShay/market-scope
source commit: d8bc770d292d328d7e89febb8ef4f450abe9458e
source tree:   c49cc5f691e6d27ad120e0a5395e6b190f1b5952
```

The imported Market Flow US baseline commit is:

```text
cf6a21a17288832af3a69703dff39c9f843fe9a5
```

Its tree SHA is exactly the same:

```text
c49cc5f691e6d27ad120e0a5395e6b190f1b5952
```

Therefore all 121 imported files matched the donor byte-for-byte at the baseline boundary.

## Baseline CI in market-flow-us

The exact imported tree passed on the new repository:

- Planning Docs CI — run `37222313702` — success.
- MarketScope Fast CI — run `37222313735` — success.
- MarketScope Browser CI — run `37222313687` — success.

The Workload workflow was imported unchanged and remains manually dispatchable. Donor MarketScope had already passed its representative workload before the clone.

## Meaning

The baseline is the rollback/reference point for the U.S. conversion.

Migration policy:

```text
baseline green
→ focused replacement
→ targeted proof
→ full required gates green
→ only then remove superseded Israeli path
```

The old MarketScope planning history is recoverable from the baseline commit and does not remain authoritative after the U.S. replan.
