# Learn Data Observability with Phoebe

Fourteen sessions on finding out that a table is wrong before a stakeholder does. Pipelines that never fail still ship wrong numbers: a shard stops arriving and the row count sits at 41 percent of normal for two business days, a merge key changes and the duplicate rate triples while the count looks perfect, a column disappears and two dashboards quietly lose a filter. None of that raises an error.

**Live:** https://phoebefu6.github.io/learn-data-observability-with-phoebe/

Two tracks. **Leader, 6 sessions, no SQL:** what data downtime costs, the five signals, which quality dimensions to measure, the noise problem, tiering tables, and the three numbers to report. **Builder, 8 sessions:** one table instrumented signal by signal, ending in a monitor set you have actually scored.

- `assets/obs-live.js` holds the **monitor bench**. Thirty nights of load metadata for `orders_daily` are generated from a fixed seed with five real defects injected into specific nights, and every monitor you switch on is genuinely evaluated night by night in the browser: trailing percentiles, same-weekday medians, duplicate rates, column-set diffs, standard deviations. The counts are arithmetic, not a script.
- **The measured ladder:** nothing on 0 of 5 caught. Fixed deadline 1 of 5. Plus a fixed volume band 2 of 5 with **8 false pages**. Swap both for learned thresholds and it is still 2 of 5 with **0 false pages** - same catches, same detection time, all eight pages were noise. Plus uniqueness 3 of 5, plus schema 4 of 5, plus null rate **5 of 5 with 2 false pages and 0.5 hours mean detection**.
- **The anti-lever:** all seven monitors with every threshold tightened catches **2 of 5** with **25 false pages** and detection back at **15.8 hours**, no better than having almost nothing on. One rule in that bench is modelled and labelled as modelled on the widget itself: six or more false pages in a trailing week is treated as a muted channel, so the page fires and the stakeholder still gets there first. Everything else is arithmetic you can hover and check.
- **The seam against siblings is enforced, not assumed.** Row-level assertions in a transform project belong to the analytics engineering course, statistical and ML detectors to the anomaly detection course, and traces and spans to the AI observability course. Each page names the boundary and points at the owner.
- Running artifact: a **monitor set** on `orders_daily` at Bellwether, a fictional grocery delivery company.
- Full source map, verification tiers and frozen canon: `materials/official-course-map.md`

by Phoebe Fu
