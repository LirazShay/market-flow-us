# B-US-001 — File-backed SQL authoring library

## Backlog metadata

- Status: `Backlog`
- Priority: `Unprioritized`
- Blocking: `No`

## Goal

Make every important Scanner/query artifact AI-authorable and source-visible as a normal file rather than allowing DuckDB to be the only durable place where a query exists.

## Required outcome

- Define one simple file-backed query layout, preferably one `.sql` file per query with the smallest necessary metadata mechanism.
- Built-ins/examples/templates must be sourced from files or mechanically synchronized from one file source of truth; do not maintain duplicate handwritten SQL strings in code/docs/tests.
- User-authored/saved queries must have a supported file representation so the DB is not their only durable copy. DuckDB may remain runtime persistence/index/cache, but a query must be exportable/importable or file-first deterministically.
- AI tooling must be able to create/edit a query by changing ordinary repository/local files without requiring direct DuckDB manipulation.
- Define deterministic identity/name/interval metadata, conflict behavior and file↔runtime synchronization semantics.
- Preserve Scanner admission/security, Draft/Persisted/Active semantics and read-only execution.
- Keep KISS: no generic query-language subsystem, remote store or new database merely to support files.

## Acceptance evidence

- A checked-in query can be added/edited by changing files only and then loaded through the normal product path.
- Built-in SQL has exactly one authoritative text source.
- A user query can be round-tripped file → runtime persistence → file without semantic drift.
- File/DB conflict behavior is deterministic and covered by tests.
- No private/authenticated data is written to query files.
