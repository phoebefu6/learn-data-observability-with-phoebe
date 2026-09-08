/* obs-live.js - the monitor bench for learn-data-observability-with-phoebe.
   Real computation, not a simulation: 30 nights of load metadata for one table are
   generated from a fixed seed, five real defects are injected into them, and every
   monitor you switch on is genuinely evaluated night by night against that history.

   What is real: the metadata, the defects, every monitor's arithmetic, the counts.
   What is MODELLED and labelled as modelled on the widget: the on-call human. A
   muted channel is represented by an acknowledgement delay, because a person who
   is paged six times a week for nothing stops reading the channel. That behaviour
   is the one thing here that is not arithmetic.

   Exposes window.OBS_ENGINE so a page can read the canon, and renders into
   [data-obs-bench] when a DOM is present. */
(function (root) {
  "use strict";

  /* ============================================================
     1. the history - 30 nights of load metadata, one fixed seed
     ============================================================ */

  var COLS_BASE = ["order_id", "customer_id", "order_ts", "amount", "currency",
                   "status", "channel", "ship_region", "updated_at"];

  /* mulberry32 - small, deterministic, good enough for teaching data */
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* The five injected defects. day is 1-based within the 30-night window.
     Each carries the pillar it belongs to and the monitor that can see it. */
  var DEFECTS = [
    { day: 9,  pillar: "freshness",    name: "Late load",
      note: "Upstream export job retried twice. Table landed 3h 50m after the 06:00 promise." },
    { day: 16, pillar: "volume",       name: "Partial load",
      note: "One of three source shards never arrived. Row count 41 percent of a normal Tuesday." },
    { day: 19, pillar: "uniqueness",   name: "Silent dedup failure",
      note: "A merge key changed upstream. Row count looks fine; duplicate rate went 1.0 to 8.4 percent." },
    { day: 23, pillar: "schema",       name: "Column dropped",
      note: "ship_region disappeared and promo_code appeared. Two dashboards silently lost a filter." },
    { day: 25, pillar: "distribution", name: "Null-rate jump",
      note: "A form field became optional. customer_id null rate went 0.5 to 11.4 percent." }
  ];

  function buildHistory() {
    var r = rng(20260906);
    var days = [];
    /* day 1 is a Monday, so weekday 5 and 6 are the weekend */
    for (var d = 1; d <= 30; d++) {
      var wd = (d - 1) % 7;                       /* 0..6, 5 and 6 are weekend */
      var weekend = wd >= 5;
      var base = weekend ? 5400 : 12000;
      var rows = Math.round(base * (0.94 + r() * 0.12));
      var lateMin = Math.round(4 + r() * 18);     /* minutes after the 06:00 promise */
      if (r() > 0.9) lateMin += 14;               /* an ordinary slow night */
      var dupRate = 0.006 + r() * 0.008;
      var nullRate = 0.002 + r() * 0.005;
      var cols = COLS_BASE.slice();

      var defect = null;
      for (var i = 0; i < DEFECTS.length; i++) if (DEFECTS[i].day === d) defect = DEFECTS[i];

      if (defect) {
        /* clamp the untouched signals to a quiet baseline so credit for a catch can only
           go to the monitor that actually watches the injected pillar */
        lateMin = 12; rows = weekend ? 5400 : 12000; dupRate = 0.010; nullRate = 0.005;
        if (defect.pillar === "freshness")    lateMin = 230;
        if (defect.pillar === "volume")       rows = Math.round(rows * 0.41);
        if (defect.pillar === "uniqueness")   dupRate = 0.084;
        if (defect.pillar === "schema") {
          cols = COLS_BASE.filter(function (c) { return c !== "ship_region"; }).concat(["promo_code"]);
        }
        if (defect.pillar === "distribution") nullRate = 0.114;
      }

      days.push({
        day: d, weekday: wd, weekend: weekend,
        rows: rows,
        distinctIds: Math.round(rows * (1 - dupRate)),
        dupRate: dupRate,
        lateMin: lateMin,
        nullRate: nullRate,
        cols: cols,
        defect: defect
      });
    }
    return days;
  }

  var HISTORY = buildHistory();

  /* ============================================================
     2. the monitors - each is real arithmetic over the history
     ============================================================ */

  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function sd(a) {
    if (a.length < 2) return null;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1));
  }
  function percentile(a, p) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
    return s[idx];
  }
  function trailing(days, i, n, pick, sameWeekday) {
    var out = [];
    for (var j = i - 1; j >= 0 && out.length < n; j--) {
      if (sameWeekday && days[j].weekday !== days[i].weekday) continue;
      out.push(pick(days[j]));
    }
    return out;
  }

  /* A monitor: id, pillar, label, and fire(day, index, history, tight) -> null | message.
     `tight` is the paranoid setting for that monitor. */
  var MONITORS = [
    {
      id: "fresh_deadline", pillar: "Freshness", label: "Freshness: fixed deadline",
      blurb: "Fire if the table lands later than a clock time you picked.",
      fire: function (d, i, h, tight) {
        var limit = tight ? 5 : 30;
        return d.lateMin > limit
          ? "landed " + d.lateMin + " min after 06:00 (limit " + limit + ")" : null;
      }
    },
    {
      id: "fresh_dist", pillar: "Freshness", label: "Freshness: learned distribution",
      blurb: "Fire if lateness exceeds the p95 of the trailing 14 nights. On-time is a distribution, not a deadline.",
      fire: function (d, i, h, tight) {
        var hist = trailing(h, i, 14, function (x) { return x.lateMin; });
        if (hist.length < 7) return null;
        var p = percentile(hist, tight ? 0.75 : 0.95);
        var pad = tight ? 1 : 10;
        return d.lateMin > p + pad
          ? "landed " + d.lateMin + " min late, trailing p" + (tight ? 75 : 95) + " is " + p : null;
      }
    },
    {
      id: "vol_fixed", pillar: "Volume", label: "Volume: fixed band",
      blurb: "Fire if row count leaves a band you hard-coded once.",
      fire: function (d, i, h, tight) {
        var band = tight ? 0.05 : 0.30, centre = 12000;
        var lo = centre * (1 - band), hi = centre * (1 + band);
        if (d.rows < lo) return d.rows + " rows, below the " + Math.round(lo) + " floor";
        if (d.rows > hi) return d.rows + " rows, above the " + Math.round(hi) + " ceiling";
        return null;
      }
    },
    {
      id: "vol_weekday", pillar: "Volume", label: "Volume: same-weekday median",
      blurb: "Fire if row count deviates from the median of the last 4 same weekdays. Seasonality stops being an alert.",
      fire: function (d, i, h, tight) {
        var hist = trailing(h, i, 4, function (x) { return x.rows; }, true);
        if (hist.length < 2) return null;
        var med = median(hist), tol = tight ? 0.06 : 0.25;
        var delta = (d.rows - med) / med;
        return Math.abs(delta) > tol
          ? d.rows + " rows vs a same-weekday median of " + Math.round(med) +
            " (" + (delta > 0 ? "+" : "") + Math.round(delta * 100) + " percent)" : null;
      }
    },
    {
      id: "uniq", pillar: "Uniqueness", label: "Uniqueness: duplicate rate",
      blurb: "Fire if 1 - distinct(key)/count(*) crosses a threshold. The only monitor that sees a dedup failure.",
      fire: function (d, i, h, tight) {
        var limit = tight ? 0.005 : 0.02;
        return d.dupRate > limit
          ? "duplicate rate " + (d.dupRate * 100).toFixed(1) + " percent (limit " +
            (limit * 100).toFixed(1) + ")" : null;
      }
    },
    {
      id: "schema", pillar: "Schema", label: "Schema: column set diff",
      blurb: "Fire if today's column set differs from last night's. Additions and removals both.",
      fire: function (d, i, h) {
        if (i === 0) return null;
        var prev = h[i - 1].cols, now = d.cols;
        var gone = prev.filter(function (c) { return now.indexOf(c) < 0; });
        var added = now.filter(function (c) { return prev.indexOf(c) < 0; });
        if (!gone.length && !added.length) return null;
        var bits = [];
        if (gone.length) bits.push("dropped " + gone.join(", "));
        if (added.length) bits.push("added " + added.join(", "));
        return bits.join("; ");
      }
    },
    {
      id: "nulls", pillar: "Distribution", label: "Distribution: null rate",
      blurb: "Fire if a column's null rate exceeds the trailing mean plus 3 standard deviations.",
      fire: function (d, i, h, tight) {
        var hist = trailing(h, i, 14, function (x) { return x.nullRate; });
        if (hist.length < 7) return null;
        var m = mean(hist), s = sd(hist), k = tight ? 1 : 3;
        return d.nullRate > m + k * s
          ? "customer_id null rate " + (d.nullRate * 100).toFixed(1) + " percent vs a trailing mean of " +
            (m * 100).toFixed(1) : null;
      }
    }
  ];

  /* ============================================================
     3. the bench - run the enabled monitors over all 30 nights
     ============================================================ */

  /* MODELLED, not measured: the human on the other end of the page.
     Six or more false pages in the trailing 7 nights means the channel is muted: the
     page still fires, nobody reads it, and the 09:00 stakeholder gets there first. So
     a fatigued incident costs the full STAKEHOLDER_ACK and does not count as caught.
     Everything else in this file is arithmetic. */
  var FRESH_ACK = 0.5;
  var FATIGUE_WINDOW = 7;
  var FATIGUE_TRIGGER = 6;
  var STAKEHOLDER_ACK = 26;   /* nobody paged: the 09:00 stakeholder finds it next morning */

  function run(enabled, tight) {
    var h = HISTORY;
    var firedByDay = [];
    var falsePages = 0, truePages = 0;
    var caught = [];

    for (var i = 0; i < h.length; i++) {
      var d = h[i], hits = [];
      for (var k = 0; k < MONITORS.length; k++) {
        var mon = MONITORS[k];
        if (!enabled[mon.id]) continue;
        var msg = mon.fire(d, i, h, !!tight);
        if (msg) hits.push({ id: mon.id, pillar: mon.pillar, label: mon.label, msg: msg });
      }
      /* a page on a night with no defect is a false page, however many monitors fired */
      var isFalse = hits.length > 0 && !d.defect;
      if (isFalse) falsePages++;
      if (hits.length > 0 && d.defect) truePages++;

      firedByDay.push({ day: d.day, hits: hits, defect: d.defect, falsePage: isFalse });
    }

    /* detection time per defect, with the modelled fatigue delay */
    var mttdParts = [];
    for (var n = 0; n < DEFECTS.length; n++) {
      var def = DEFECTS[n];
      var row = firedByDay[def.day - 1];
      if (!row.hits.length) {
        mttdParts.push({ defect: def, hours: STAKEHOLDER_ACK, detected: false, fatigued: false });
        continue;
      }
      var recentFalse = 0;
      for (var w = def.day - 1 - FATIGUE_WINDOW; w < def.day - 1; w++) {
        if (w >= 0 && firedByDay[w].falsePage) recentFalse++;
      }
      var fatigued = recentFalse >= FATIGUE_TRIGGER;
      mttdParts.push({
        defect: def, hours: fatigued ? STAKEHOLDER_ACK : FRESH_ACK,
        detected: !fatigued, fatigued: fatigued, recentFalse: recentFalse
      });
    }

    for (var q = 0; q < mttdParts.length; q++) {
      /* "caught before the stakeholder" needs a human to actually look inside the
         26 hours before the 09:00 review the next morning */
      if (mttdParts[q].detected && mttdParts[q].hours < STAKEHOLDER_ACK) caught.push(mttdParts[q].defect);
    }

    return {
      days: firedByDay,
      caught: caught.length,
      total: DEFECTS.length,
      falsePages: falsePages,
      truePages: truePages,
      mttd: mean(mttdParts.map(function (x) { return x.hours; })),
      parts: mttdParts,
      missed: DEFECTS.filter(function (def) {
        return caught.indexOf(def) < 0;
      })
    };
  }

  var RUNGS = [
    { label: "Nothing on", on: [] },
    { label: "+ fixed deadline", on: ["fresh_deadline"] },
    { label: "+ fixed volume band", on: ["fresh_deadline", "vol_fixed"] },
    { label: "Learned freshness + weekday volume", on: ["fresh_dist", "vol_weekday"] },
    { label: "+ uniqueness", on: ["fresh_dist", "vol_weekday", "uniq"] },
    { label: "+ schema diff", on: ["fresh_dist", "vol_weekday", "uniq", "schema"] },
    { label: "+ null rate (all five signals)", on: ["fresh_dist", "vol_weekday", "uniq", "schema", "nulls"] }
  ];

  function ladder() {
    return RUNGS.map(function (r) {
      var en = {};
      r.on.forEach(function (id) { en[id] = true; });
      var res = run(en, false);
      return { label: r.label, on: r.on.slice(), caught: res.caught, falsePages: res.falsePages,
               mttd: res.mttd };
    });
  }

  function paranoid() {
    var en = {};
    MONITORS.forEach(function (m) { en[m.id] = true; });
    var res = run(en, true);
    return { caught: res.caught, falsePages: res.falsePages, mttd: res.mttd,
             fatiguedCount: res.parts.filter(function (p) { return p.fatigued; }).length };
  }

  root.OBS_ENGINE = {
    HISTORY: HISTORY, DEFECTS: DEFECTS, MONITORS: MONITORS,
    run: run, ladder: ladder, paranoid: paranoid, RUNGS: RUNGS
  };
})(typeof window !== "undefined" ? window : globalThis);

/* ============================================================
   4. the widget - renders the bench into [data-obs-bench]
   ============================================================ */
(function () {
  "use strict";
  if (typeof document === "undefined") return;
  var E = window.OBS_ENGINE;
  if (!E) return;

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined && txt !== null) n.textContent = txt;
    return n;
  }

  var PRESETS = [
    { label: "Nothing on", on: [] },
    { label: "The naive pair", on: ["fresh_deadline", "vol_fixed"] },
    { label: "The learned pair", on: ["fresh_dist", "vol_weekday"] },
    { label: "All five signals", on: ["fresh_dist", "vol_weekday", "uniq", "schema", "nulls"] }
  ];

  document.querySelectorAll("[data-obs-bench]").forEach(function (host) {
    var state = {};
    var tight = false;

    var wrap = el("div", "wk mb-wrap");

    var head = el("div", "wk-head");
    head.appendChild(el("b", null, "The monitor bench"));
    head.appendChild(el("span", null, "30 nights of orders_daily · 5 real defects in there"));
    wrap.appendChild(head);

    var body = el("div", "wk-body");

    var honesty = el("p", "hb-honesty",
      "The metadata, the defects and every threshold below are computed in your browser, " +
      "night by night. One thing is modelled and it is the human: six or more false pages in " +
      "a trailing week mutes the channel, so the page still fires and nobody reads it.");
    body.appendChild(honesty);

    /* ---- readouts ---- */
    var reads = el("div", "mb-reads");
    function readout(cls, label) {
      var box = el("div", "mb-read " + cls);
      var big = el("b", "mb-big", "-");
      var lab = el("span", "mb-rlab", label);
      box.appendChild(big); box.appendChild(lab);
      reads.appendChild(box);
      return big;
    }
    var outCaught = readout("mb-r1", "caught before the stakeholder");
    var outFalse = readout("mb-r2", "false pages in 30 nights");
    var outMttd = readout("mb-r3", "mean hours to detect");
    body.appendChild(reads);

    /* ---- controls ---- */
    var ctl = el("div", "mb-ctl");
    var presetRow = el("div", "mb-presets");
    presetRow.appendChild(el("span", "mb-plab", "Presets"));
    PRESETS.forEach(function (p) {
      var b = el("button", "hb-btn", p.label);
      b.type = "button";
      b.addEventListener("click", function () {
        state = {};
        p.on.forEach(function (id) { state[id] = true; });
        tight = false;
        syncInputs();
        paint();
      });
      presetRow.appendChild(b);
    });
    ctl.appendChild(presetRow);

    var boxes = {};
    var list = el("div", "mb-monitors");
    E.MONITORS.forEach(function (m) {
      var row = el("label", "mb-mon");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.addEventListener("change", function () {
        state[m.id] = cb.checked;
        paint();
      });
      boxes[m.id] = cb;
      var txt = el("span", "mb-mtxt");
      txt.appendChild(el("b", null, m.label));
      txt.appendChild(el("span", "mb-mblurb", m.blurb));
      row.appendChild(cb);
      row.appendChild(el("span", "mb-pillar", m.pillar));
      row.appendChild(txt);
      list.appendChild(row);
    });
    ctl.appendChild(list);

    var anti = el("label", "mb-anti");
    var acb = document.createElement("input");
    acb.type = "checkbox";
    acb.addEventListener("change", function () { tight = acb.checked; paint(); });
    var atxt = el("span", "mb-mtxt");
    atxt.appendChild(el("b", null, "Hair-trigger every threshold"));
    atxt.appendChild(el("span", "mb-mblurb",
      "The move everybody reaches for after an incident: tighten all of it. Watch all three numbers, not one."));
    anti.appendChild(acb);
    anti.appendChild(atxt);
    ctl.appendChild(anti);
    body.appendChild(ctl);

    /* ---- the 30-night strip ---- */
    var striplab = el("p", "mb-striplab", "Thirty nights. Hover a night to read what fired.");
    body.appendChild(striplab);
    var strip = el("div", "mb-strip");
    body.appendChild(strip);

    var legend = el("div", "mb-legend");
    [["mb-c-quiet", "quiet night"], ["mb-c-false", "false page"],
     ["mb-c-caught", "defect caught"], ["mb-c-missed", "defect missed"]].forEach(function (p) {
      var s = el("span", "mb-lg");
      s.appendChild(el("i", p[0]));
      s.appendChild(el("span", null, p[1]));
      legend.appendChild(s);
    });
    body.appendChild(legend);

    var findings = el("div", "mb-findings");
    body.appendChild(findings);

    wrap.appendChild(body);

    var foot = el("div", "wk-foot");
    foot.appendChild(el("span", null,
      "Five defects: a late load, a partial load, a silent dedup failure, a dropped column and a null-rate jump."));
    wrap.appendChild(foot);

    host.appendChild(wrap);

    function syncInputs() {
      Object.keys(boxes).forEach(function (id) { boxes[id].checked = !!state[id]; });
      acb.checked = tight;
    }

    function paint() {
      var res = E.run(state, tight);
      outCaught.textContent = res.caught + "/" + res.total;
      outFalse.textContent = res.falsePages;
      outMttd.textContent = res.mttd.toFixed(1) + "h";

      var anyOn = Object.keys(state).some(function (k) { return state[k]; });

      strip.textContent = "";
      res.days.forEach(function (d) {
        var cls = "mb-night mb-c-quiet";
        var title = "Night " + d.day + ": quiet";
        if (d.defect) {
          var part = null;
          res.parts.forEach(function (p) { if (p.defect.day === d.day) part = p; });
          var got = part && part.detected;
          cls = "mb-night " + (got ? "mb-c-caught" : "mb-c-missed");
          title = "Night " + d.day + " · " + d.defect.name + " · " +
            (got ? "caught in 30 min" :
              (part && part.fatigued ? "page fired into a muted channel, the stakeholder found it"
                                     : "nothing watching this signal")) +
            "\n" + d.defect.note;
        } else if (d.falsePage) {
          cls = "mb-night mb-c-false";
          title = "Night " + d.day + ": false page · " +
            d.hits.map(function (h) { return h.msg; }).join(" · ");
        }
        var cell = el("i", cls, String(d.day));
        cell.title = title;
        strip.appendChild(cell);
      });

      findings.textContent = "";
      if (!anyOn) {
        findings.appendChild(el("p", "hb-empty",
          "Nothing is switched on. Five things go wrong in the next 30 nights and you hear about all five from somebody else."));
      } else {
        var missedList = res.parts.filter(function (p) { return !p.detected; });
        if (missedList.length) {
          var mh = el("div", "mb-miss");
          mh.appendChild(el("b", null, "Still landing on the stakeholder"));
          missedList.forEach(function (p) {
            var r = el("p", "mb-missrow");
            r.appendChild(el("b", null, "Night " + p.defect.day + " · " + p.defect.name));
            r.appendChild(el("span", null, p.fatigued
              ? " - the page fired and the channel was muted (" + p.recentFalse +
                " false pages in the week before it)."
              : " - " + p.defect.note));
            mh.appendChild(r);
          });
          findings.appendChild(mh);
        }
        if (res.falsePages >= 6) {
          var warn = el("p", "dh-verdict warn",
            res.falsePages + " false pages in 30 nights is more than one a week. At six in a " +
            "trailing week this bench treats the channel as muted, which is what the number " +
            "means in a real team.");
          findings.appendChild(warn);
        }
        if (res.caught === res.total && res.falsePages <= 2) {
          var winp = el("p", "dh-verdict",
            "Five of five, " + res.falsePages + " false pages, mean detection " +
            res.mttd.toFixed(1) + " hours. That is a monitored table.");
          findings.appendChild(winp);
        }
      }
    }

    syncInputs();
    paint();
  });
})();
