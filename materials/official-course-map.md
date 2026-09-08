# Official course map - learn-data-observability-with-phoebe

Built 2026-09-06. Hub bucket `dsec` (Data Ops & Security), difficulty tier 1 (foundational
on-ramp for the bucket). Two tracks: leader 6 x 45 min, builder 8 x 45 min.

Running artifact: a **monitor set** on one table, `analytics.orders_daily` at **Bellwether**, a
fictional grocery delivery company. Five real defects live in the 30-night history that session
b8 scores against.

---

## The seam against sibling courses (enforced, not aspirational)

Four live courses touch this material. Each seam below was checked against the sibling's actual
session titles before this course was scoped.

| Sibling | What it owns | What this course does instead |
|---|---|---|
| `learn-analytics-engineering-with-phoebe` (deng, d3) | dbt tests as build-time assertions: "Tests as the trust budget", "Contracts, docs and deployment" | Monitors that run whether or not anybody's pipeline ran, on tables you may not build yourself. b1 part 2 states the three homes for a check and hands row-level assertions to that course by name |
| `learn-anomaly-detection-with-phoebe` (ds, d2) | Statistical and ML detectors on values: rolling, seasonal, isolation forest, one-class, deep | Distribution handled with **metadata only** (null rate, cardinality, min/max, segment share). b5 states explicitly where this stops and points there for the algorithms |
| `learn-dataops-with-phoebe` (dsec, d4) | The whole delivery practice: CI, orchestration, DBOps, MLOps, IaC. b3 "Data testing and contracts", b7 "Observability, secrets and IaC" | One signal per session at depth, plus threshold arithmetic and detection scoring, which the umbrella course covers in a single session |
| `learn-ai-observability-with-phoebe` (ai, d3) | Traces, spans, OTel GenAI conventions, "On-call for AI", "Alerting and SLOs" | Tables, not traces. No span, no token cost, no LLM failure taxonomy anywhere in this course |
| `learn-data-governance-with-phoebe` (gov, d2) | Classification, breach response, rights, the operating model | No policy or legal content. a3 uses quality dimensions to choose what to measure, not to write a policy |

---

## Verified facts (with their source tier)

**Tier 1, read from the primary source.**

- **Great Expectations Core 1.x components**, in workflow order: Data Context, Data Source,
  Data Asset, Batch Definition, Batch, Expectation, Expectation Suite, Validation Definition,
  Validation Result, Checkpoint, Actions, Data Docs. Docs version seen: 1.22.0.
  <https://docs.greatexpectations.io/docs/core/introduction/gx_overview/>
- **dbt data tests**: four built-in generic tests (`unique`, `not_null`, `accepted_values`,
  `relationships`), singular tests as SQL returning failing rows, `data_tests:` as the current
  key with `tests:` still aliased, and the config split where `arguments:` carries macro inputs
  while `config:` carries `severity`, `where`, `store_failures`, `error_if`, `warn_if`.
  <https://docs.getdbt.com/docs/build/data-tests>
  *Cited in b1 only, to hand the discipline to the analytics engineering course.*
- **NIST SP 800-162** on ABAC versus RBAC - referenced once in a3 for the vocabulary of
  attributes; the substance belongs to the sibling access-control course.
  <https://csrc.nist.gov/pubs/sp/800/162/upd2/final>

**Tier 2, primary source paywalled, wording via close secondary sources. Flagged on the page
that teaches it.**

- **ISO/IEC 25012:2008** data quality model: 15 characteristics split into inherent and
  system-dependent views (accuracy, completeness, consistency, credibility, currentness,
  accessibility, compliance, confidentiality, efficiency, precision, traceability,
  understandability, availability, portability, recoverability). <https://www.iso.org/standard/35736.html>
- **DAMA-DMBOK** quality dimensions: accuracy, completeness, consistency, timeliness,
  uniqueness, validity. The inherent ISO set aligns with these except **uniqueness**, which has
  no direct ISO characteristic. a3 teaches exactly this comparison, including the gap.

**Tier 3, vendor-originated framing, taught as a widely adopted convention rather than a
standard.**

- **The five pillars of data observability** (freshness, volume, schema, distribution, lineage).
  Vendor-originated and now near-universal. a2 says so plainly: the five are a useful carve-up,
  not a standard, and lineage is the one that answers "why" while the other four answer "what".

**Modelled, never presented as measured.**

- **Alert fatigue.** The b8 bench treats six or more false pages in a trailing 7 nights as a
  muted channel, which costs the full 26-hour stakeholder discovery time for any incident in that
  state. The *direction* is well documented in software operations and clinical alarm research;
  the *threshold of six* is a teaching choice and the widget says so on its face.

---

## Frozen canon - the b8 bench

Computed in node from `assets/obs-live.js` before any page quoted a number. Any page that cites
these must match exactly.

| Monitors on | Caught | False pages | MTTD (h) |
|---|---|---|---|
| Nothing | 0 of 5 | 0 | 26.0 |
| Freshness, fixed deadline (30 min) | 1 of 5 | 0 | 20.9 |
| + volume, fixed band (12,000 +/- 30 percent) | 2 of 5 | 8 | 15.8 |
| Learned freshness (trailing p95 + 10) + same-weekday volume median (+/- 25 percent) | 2 of 5 | 0 | 15.8 |
| + uniqueness (dup rate > 2 percent) | 3 of 5 | 0 | 10.7 |
| + schema diff | 4 of 5 | 1 | 5.6 |
| + null rate (trailing mean + 3 sd) | **5 of 5** | 2 | **0.5** |
| All seven monitors, every threshold tightened | **2 of 5** | **25** | 15.8 |

The two remaining false pages at the top rung: **night 8**, a null-rate wobble inside a very
small standard deviation, and **night 24**, the schema monitor firing on the revert of night
23's change.

### The five defects

| Night | Pillar | What happened | Seen only by |
|---|---|---|---|
| 9 | Freshness | Landed 230 min after the 06:00 promise (trailing p95 is 22 min) | freshness |
| 16 | Volume | One of three shards missing, 41 percent of a normal same-weekday count | volume |
| 19 | Uniqueness | Merge key changed upstream, dup rate 1.0 to 8.4 percent, **row count normal** | uniqueness |
| 23 | Schema | `ship_region` dropped, `promo_code` added | schema diff |
| 25 | Distribution | `customer_id` null rate 0.5 to 11.4 percent | null rate |

Every non-injected signal is clamped to a quiet baseline on a defect night, so no monitor can
take accidental credit for a catch it did not earn.

---

## Coverage per session

`✓` = taught to working depth. `◐` = named and handed to the session or course that owns it.

### Leader track

| Session | Covers | Depth |
|---|---|---|
| a1 What breaks, and who finds out first | Data downtime as hours-wrong-while-in-use; the discovery gap; why a green pipeline is not evidence | ✓ |
| a2 Five signals | All five pillars, what each sees and misses, which four are one aggregate query | ✓ |
| a3 Quality is a dimension with a number | DAMA six vs ISO/IEC 25012 fifteen, inherent vs system-dependent, the uniqueness gap, picking three | ✓ |
| a4 Alert or noise | False-page cost, alert fatigue, reading a coverage number bought with a muted channel | ✓ |
| a5 Coverage without headcount | Table tiering, the critical 20 percent, cheap coverage for the long tail | ✓ |
| a6 From firefighting to a trust score | The three reportable numbers, a 90-day plan, what not to promise | ✓ |
| Vendor platform selection (Monte Carlo, Soda, Elementary, Bigeye) | Named as a category with the questions to ask; no product comparison | ◐ |

### Builder track

| Session | Covers | Depth |
|---|---|---|
| b1 The metadata you already have | Four metadata queries, the metrics table, the four parts of a monitor | ✓ |
| b2 Freshness | Trailing percentiles, the full-rebuild trap, source-event vs row-write timestamps, empty-partition passes | ✓ |
| b3 Volume and uniqueness | Same-weekday medians, MAD-based robust bands, duplicate rate vs a hard uniqueness assertion | ✓ |
| b4 Schema change | Column-set diff, type widening, additive vs breaking, the revert paging too | ✓ |
| b5 Distribution drift from metadata | Null rate, cardinality, min/max, segment share, and the honest boundary | ✓ |
| b6 Expectations as code | GX Core end to end wired to the metrics table | ✓ |
| b7 Lineage and blast radius | OpenLineage, column-level lineage, the impact query, undocumented reverse-ETL | ✓ |
| b8 The monitor bench | The full ladder scored live, three numbers, the tighten-everything anti-lever | ✓ |
| Statistical and ML anomaly detection | b5 names the boundary and points at `learn-anomaly-detection-with-phoebe` | ◐ |
| Row-level tests in a transform project | b1 names the three homes and points at `learn-analytics-engineering-with-phoebe` | ◐ |

## Not covered, by design

- **Row-level assertions in a transform project.** A different discipline with its own tooling.
- **Statistical and ML anomaly detection.** Metadata distribution checks only.
- **LLM and agent observability.** Traces and spans belong to the AI observability course.
- **Severity weighting across incidents.** The b8 bench counts all five defects equally, which a
  real estate would not. Stated on the page as the first thing to add.
- **Vendor product comparison.** Categories and questions, no scorecards.
- **Certification.** Nothing here is a certificate for anything.

## Re-verify before delivery

GX Core is on a fast release cadence; confirm the component names in b6 against the current docs
before teaching it. The dbt `data_tests:` / `arguments:` split is still settling across v1.10 and
v2, so check b1's one-line reference if a learner is on an older version.
