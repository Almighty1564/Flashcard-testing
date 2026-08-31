/* ============================================================
   MOD 1 — Load Calculation Practice
   Drop-in module. Usage:

     <div id="calcHost"></div>
     <script src="mod1-calc.js"></script>
     <script> Mod1Calc.mount(document.getElementById('calcHost')); </script>

   When embedded, it inherits --line, --muted, --accent, --good and --bad
   from the host page. Set --m1-go-fg to control the primary button text.

   Injects its own scoped styles (.m1c- prefix). No dependencies,
   no localStorage, no network. Safe inside mod1.html.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- Honda reference data ---------- */
  var GENS = [
    { name: "Honda EU2200i",  ratedW: 1800, ratedA: 15,   maxW: 2200, maxA: 18.3, lb: 46.5  },
    { name: "Honda EU3000iS", ratedW: 2800, ratedA: 23.4, maxW: 3000, maxA: 25,   lb: 134.9 },
    { name: "Honda EU7000iS", ratedW: 5500, ratedA: 45,   maxW: 7000, maxA: 58.3, lb: 263.2 }
  ];
  var MAX_A = 45;

  var GEN_NAMES = GENS.map(function (g) { return g.name; });

  function pickGen(totalA) {
    var fits = GENS.filter(function (g) { return g.ratedA >= totalA; })
                   .sort(function (a, b) { return a.lb - b.lb; });
    return fits[0] || null;
  }

  /* ---------- helpers ---------- */
  function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function fmt(n) { return r2(n).toLocaleString("en-US"); }

  var DEVICES = ["laptop", "field radio", "satellite terminal", "ruggedized printer",
    "floodlight", "battery charger", "comms server", "thermal sight", "water purifier",
    "tablet", "signal repeater", "monitor", "GPS base station", "dehumidifier"];

  /* ============================================================
     GENERATOR SELECTION — 5 variants
     ============================================================ */

  /* V1: one uniform bank of identical devices */
  function genUniform() {
    var n, v, a, totA;
    do {
      n = rnd(4, 20); v = rnd(24, 120); a = pick([0.8, 1, 1.2, 1.5, 1.5, 2, 2.5]);
      totA = n * a;
    } while (totA < 1 || totA > MAX_A);

    var each = v * a, totW = each * n, gen = pickGen(totA);
    return {
      tag: "Generator selection \u2022 Uniform bank",
      scenario: "Your team is establishing a forward operating location and deploying by rotary wing. Weight and space are restricted and you must bring your own power source.",
      rows: [["Devices 1\u2013" + n + " \u2014 " + pick(DEVICES), v + "V / " + a + "A each"]],
      fields: [
        { key: "w", label: "Total watts", answer: totW, tol: 1 },
        { key: "a", label: "Total amps", answer: totA, tol: 0.15 },
        { key: "g", label: "Generator", kind: "select", options: GEN_NAMES, answer: gen.name }
      ],
      steps: [
        v + "V \u00D7 " + a + "A = <b>" + fmt(each) + "W</b> per device",
        fmt(each) + "W \u00D7 " + n + " = <b>" + fmt(totW) + "W</b>",
        a + "A \u00D7 " + n + " = <b>" + fmt(totA) + "A</b>",
        "Lightest unit rated \u2265 " + fmt(totA) + "A \u2192 <b>" + gen.name + "</b> ("
          + gen.ratedA + "A rated, " + gen.lb + " lb)"
      ]
    };
  }

  /* V2: mixed loadout — a bulk group plus one-off devices */
  function genMixed() {
    var groups, totA, guard = 0;
    do {
      groups = [];
      var names = shuffle(DEVICES);
      groups.push({ n: rnd(3, 9), v: rnd(24, 48), a: pick([1, 1.5, 1.5, 2]), name: names[0] });
      var extras = rnd(2, 4);
      for (var i = 0; i < extras; i++) {
        groups.push({ n: 1, v: rnd(75, 120), a: pick([1.5, 2, 3, 4, 5]), name: names[i + 1] });
      }
      totA = groups.reduce(function (t, g) { return t + g.n * g.a; }, 0);
      guard++;
    } while ((totA < 1 || totA > MAX_A) && guard < 80);

    var totW = 0;
    groups.forEach(function (g) { g.each = g.v * g.a; g.w = g.each * g.n; totW += g.w; });
    totA = r2(totA);
    var gen = pickGen(totA);

    return {
      tag: "Generator selection \u2022 Mixed loadout",
      scenario: "Your team is establishing a forward operating location and deploying by rotary wing. Weight and space are restricted and you must bring your own power source.",
      rows: groups.map(function (g) {
        return [(g.n > 1 ? "Devices \u00D7" + g.n + " \u2014 " : "Device \u2014 ") + g.name,
                g.v + "V / " + g.a + "A each"];
      }),
      fields: [
        { key: "w", label: "Total watts", answer: totW, tol: 1 },
        { key: "a", label: "Total amps", answer: totA, tol: 0.15 },
        { key: "g", label: "Generator", kind: "select", options: GEN_NAMES, answer: gen.name }
      ],
      steps: groups.map(function (g) {
        return g.v + "V \u00D7 " + g.a + "A = " + fmt(g.each) + "W each"
             + (g.n > 1 ? "  \u00D7 " + g.n + " = <b>" + fmt(g.w) + "W</b>" : "");
      }).concat([
        "Total watts = <b>" + fmt(totW) + "W</b>",
        "Total amps = sum of device amps = <b>" + fmt(totA) + "A</b>",
        "Lightest unit rated \u2265 " + fmt(totA) + "A \u2192 <b>" + gen.name + "</b> ("
          + gen.ratedA + "A rated, " + gen.lb + " lb)"
      ])
    };
  }

  /* V3: nameplate wattage given, single 120V bus — solve for amps */
  function genWattage() {
    var items, totW, guard = 0;
    do {
      items = [];
      var names = shuffle(DEVICES), n = rnd(4, 7);
      for (var i = 0; i < n; i++) {
        items.push({ name: names[i], count: rnd(1, 4), w: rnd(3, 24) * 25 });
      }
      totW = items.reduce(function (t, x) { return t + x.count * x.w; }, 0);
      guard++;
    } while (totW > MAX_A * 120 && guard < 80);

    var totA = r2(totW / 120), gen = pickGen(totA);
    return {
      tag: "Generator selection \u2022 Nameplate wattage",
      scenario: "Every device below runs on the 120V bus. Total the load, convert to amps, and select the generator.",
      rows: items.map(function (x) {
        return [(x.count > 1 ? x.count + " \u00D7 " : "") + x.name, fmt(x.w) + "W each"];
      }),
      fields: [
        { key: "w", label: "Total watts", answer: totW, tol: 1 },
        { key: "a", label: "Total amps at 120V", answer: totA, tol: 0.2 },
        { key: "g", label: "Generator", kind: "select", options: GEN_NAMES, answer: gen.name }
      ],
      steps: items.map(function (x) {
        return x.count + " \u00D7 " + fmt(x.w) + "W = <b>" + fmt(x.count * x.w) + "W</b> \u2014 " + x.name;
      }).concat([
        "Total watts = <b>" + fmt(totW) + "W</b>",
        fmt(totW) + "W \u00F7 120V = <b>" + fmt(totA) + "A</b>",
        "Lightest unit rated \u2265 " + fmt(totA) + "A \u2192 <b>" + gen.name + "</b> ("
          + gen.ratedA + "A rated, " + gen.lb + " lb)"
      ])
    };
  }

  /* V4: planned expansion — size for the future load, not today's */
  function genExpansion() {
    var n1, a1, v1, n2, a2, v2, now, later, guard = 0;
    do {
      v1 = rnd(24, 48); a1 = pick([1, 1.5, 2]); n1 = rnd(4, 10);
      v2 = rnd(24, 110); a2 = pick([1, 1.5, 2, 3]); n2 = rnd(2, 8);
      now = n1 * a1; later = now + n2 * a2;
      guard++;
    } while ((later > MAX_A || now < 1) && guard < 80);

    var gen = pickGen(later), genNow = pickGen(now);
    return {
      tag: "Generator selection \u2022 Planned expansion",
      scenario: "The site opens with the initial loadout and a second element arrives in 30 days with additional equipment. One generator must carry the site through both phases.",
      rows: [
        ["Phase 1 \u2014 " + n1 + " \u00D7 " + pick(DEVICES), v1 + "V / " + a1 + "A each"],
        ["Phase 2 adds \u2014 " + n2 + " \u00D7 " + pick(DEVICES), v2 + "V / " + a2 + "A each"]
      ],
      fields: [
        { key: "a1", label: "Phase 1 amps", answer: now, tol: 0.15 },
        { key: "a2", label: "Amps after phase 2", answer: later, tol: 0.15 },
        { key: "g", label: "Generator", kind: "select", options: GEN_NAMES, answer: gen.name }
      ],
      steps: [
        a1 + "A \u00D7 " + n1 + " = <b>" + fmt(now) + "A</b> at phase 1",
        a2 + "A \u00D7 " + n2 + " = " + fmt(n2 * a2) + "A added",
        fmt(now) + "A + " + fmt(n2 * a2) + "A = <b>" + fmt(later) + "A</b> final load",
        "Size to the final load, not phase 1"
          + (genNow && genNow.name !== gen.name
              ? " \u2014 the " + genNow.name + " covers phase 1 but not phase 2"
              : "")
          + " \u2192 <b>" + gen.name + "</b> (" + gen.ratedA + "A rated)"
      ]
    };
  }

  /* V5: fixed generator on hand — how much headroom is left */
  function genHeadroom() {
    var gen = pick(GENS), n, a, v, load, guard = 0;
    do {
      v = rnd(24, 110); a = pick([1, 1.5, 2, 2.5]); n = rnd(3, 14);
      load = n * a; guard++;
    } while ((load > gen.ratedA * 0.9 || load < gen.ratedA * 0.3) && guard < 100);

    var addA = pick([0.5, 1, 1.5, 2]);
    var spare = r2(gen.ratedA - load);
    var canAdd = Math.floor(spare / addA);

    return {
      tag: "Generator selection \u2022 Remaining capacity",
      scenario: "Your element already has a " + gen.name + " on hand (" + gen.ratedA
        + "A rated). Work out what is left after the current loadout.",
      rows: [
        ["Devices \u00D7" + n + " \u2014 " + pick(DEVICES), v + "V / " + a + "A each"],
        ["Generator on hand", gen.name + " \u2014 " + gen.ratedA + "A rated"],
        ["Each additional device draws", addA + "A"]
      ],
      fields: [
        { key: "a", label: "Current load (A)", answer: load, tol: 0.15 },
        { key: "s", label: "Spare capacity (A)", answer: spare, tol: 0.15 },
        { key: "c", label: "Devices you can still add", answer: canAdd, tol: 0 }
      ],
      steps: [
        a + "A \u00D7 " + n + " = <b>" + fmt(load) + "A</b> current load",
        gen.ratedA + "A \u2212 " + fmt(load) + "A = <b>" + fmt(spare) + "A</b> spare",
        fmt(spare) + "A \u00F7 " + addA + "A = " + fmt(spare / addA)
          + " \u2192 round down to <b>" + canAdd + " device"
          + (canAdd === 1 ? "" : "s") + "</b>"
      ]
    };
  }

  /* ============================================================
     BREAKER BOX LOAD — 4 variants
     ============================================================ */

  var APPL = [
    { n: "Water heater",     lo: 35, hi: 55 },
    { n: "Dishwasher",       lo: 10, hi: 15 },
    { n: "Electric dryer",   lo: 45, hi: 58 },
    { n: "Electric range",   lo: 80, hi: 120 },
    { n: "Garbage disposal", lo: 5,  hi: 9 },
    { n: "Well pump",        lo: 10, hi: 20 },
    { n: "Microwave",        lo: 10, hi: 18 },
    { n: "Freezer",          lo: 5,  hi: 12 }
  ];

  function drawAppliances(count) {
    return shuffle(APPL).slice(0, count).map(function (a) {
      return { n: a.n, w: rnd(a.lo, a.hi) * 100 };
    });
  }

  function coreCalc(sqft, circuits, appliances, hvacW) {
    var s1 = sqft * 3;
    var s2 = circuits * 1500;
    var s3 = appliances.reduce(function (t, a) { return t + a.w; }, 0);
    var gross = s1 + s2 + s3;
    var first = Math.min(gross, 10000);
    var rest = Math.max(gross - 10000, 0);
    var sub = first + rest * 0.4;
    var total = sub + hvacW;
    return { s1: s1, s2: s2, s3: s3, gross: gross, first: first, rest: rest,
             sub: sub, total: total, amps: total / 230 };
  }

  function coreSteps(sqft, circuits, appliances, c, hvacLine) {
    var steps = [
      fmt(sqft) + " sq ft \u00D7 3W = <b>" + fmt(c.s1) + "W</b>",
      circuits + " circuits \u00D7 1,500W = <b>" + fmt(c.s2) + "W</b>",
      appliances.map(function (a) { return a.n + " " + fmt(a.w) + "W"; }).join(" + ")
        + " = <b>" + fmt(c.s3) + "W</b>",
      "Steps 1\u20133 = " + fmt(c.gross) + "W \u2192 first " + fmt(c.first)
        + "W @ 100% + " + fmt(c.rest) + "W @ 40% (" + fmt(c.rest * 0.4) + "W) = <b>"
        + fmt(c.sub) + "W</b>"
    ];
    if (hvacLine) steps.push(hvacLine);
    steps.push(fmt(c.total) + "W \u00F7 230 = <b>" + fmt(c.amps) + "A</b>");
    return steps;
  }

  /* V1: standard six-step residence */
  function boxStandard() {
    var sqft = rnd(10, 36) * 100, circuits = rnd(3, 5);
    var appliances = drawAppliances(rnd(3, 5));
    var heat = rnd(45, 110) * 100, ac = rnd(30, 60) * 100;
    var hvac = Math.max(heat, ac);
    var c = coreCalc(sqft, circuits, appliances, hvac);

    return {
      tag: "Breaker box load \u2022 Standard residence",
      scenario: "Size the service for this residence. Work the six steps in order.",
      rows: [["Living area", fmt(sqft) + " sq ft"],
             ["Small appliance + laundry circuits", String(circuits)]]
        .concat(appliances.map(function (a) { return [a.n, fmt(a.w) + "W"]; }))
        .concat([["Heating unit", fmt(heat) + "W"], ["Central air", fmt(ac) + "W"]]),
      fields: [
        { key: "s1", label: "Step 1 \u2014 lighting (W)", answer: c.s1, tol: 1 },
        { key: "s2", label: "Step 2 \u2014 1500W circuits (W)", answer: c.s2, tol: 1 },
        { key: "s3", label: "Step 3 \u2014 appliances (W)", answer: c.s3, tol: 1 },
        { key: "s4", label: "Step 4 \u2014 after demand (W)", answer: c.sub, tol: 5 },
        { key: "s5", label: "Step 5 \u2014 with HVAC (W)", answer: c.total, tol: 5 },
        { key: "s6", label: "Step 6 \u2014 service amps", answer: c.amps, tol: 0.6 }
      ],
      steps: coreSteps(sqft, circuits, appliances, c,
        "Larger of heat (" + fmt(heat) + "W) and air (" + fmt(ac) + "W) = " + fmt(hvac)
        + "W \u2192 " + fmt(c.sub) + " + " + fmt(hvac) + " = <b>" + fmt(c.total) + "W</b>")
    };
  }

  /* V2: full calc, then choose the panel */
  function boxPanel() {
    var PANELS = [100, 125, 150, 200, 400];
    var sqft, circuits, appliances, heat, ac, hvac, c, guard = 0;
    do {
      sqft = rnd(12, 40) * 100; circuits = rnd(3, 6);
      appliances = drawAppliances(rnd(4, 6));
      heat = rnd(50, 140) * 100; ac = rnd(30, 70) * 100;
      hvac = Math.max(heat, ac);
      c = coreCalc(sqft, circuits, appliances, hvac);
      guard++;
    } while (c.amps > 380 && guard < 60);

    var panel = PANELS.filter(function (p) { return p >= c.amps; })[0];
    return {
      tag: "Breaker box load \u2022 Panel sizing",
      scenario: "Calculate the demand load, then select the smallest standard panel that carries it.",
      rows: [["Living area", fmt(sqft) + " sq ft"],
             ["Small appliance + laundry circuits", String(circuits)]]
        .concat(appliances.map(function (a) { return [a.n, fmt(a.w) + "W"]; }))
        .concat([["Heating unit", fmt(heat) + "W"], ["Central air", fmt(ac) + "W"]]),
      fields: [
        { key: "s5", label: "Total demand (W)", answer: c.total, tol: 5 },
        { key: "s6", label: "Service amps", answer: c.amps, tol: 0.6 },
        { key: "p", label: "Panel size", kind: "select",
          options: PANELS.map(function (p) { return p + "A"; }), answer: panel + "A" }
      ],
      steps: coreSteps(sqft, circuits, appliances, c,
        "Larger of heat (" + fmt(heat) + "W) and air (" + fmt(ac) + "W) = " + fmt(hvac)
        + "W \u2192 total <b>" + fmt(c.total) + "W</b>")
        .concat(["Smallest standard panel \u2265 " + fmt(c.amps) + "A \u2192 <b>" + panel + "A</b>"])
    };
  }

  /* V3: detached shop — no HVAC, five steps */
  function boxShop() {
    var sqft = rnd(6, 20) * 100, circuits = rnd(2, 4);
    var appliances = drawAppliances(rnd(2, 4));
    var c = coreCalc(sqft, circuits, appliances, 0);
    return {
      tag: "Breaker box load \u2022 Detached shop",
      scenario: "A detached shop is being fed from a subpanel. There is no heating or cooling unit, so step 5 does not apply.",
      rows: [["Floor area", fmt(sqft) + " sq ft"],
             ["Small appliance + laundry circuits", String(circuits)]]
        .concat(appliances.map(function (a) { return [a.n, fmt(a.w) + "W"]; }))
        .concat([["Heating / cooling", "none"]]),
      fields: [
        { key: "s1", label: "Step 1 \u2014 lighting (W)", answer: c.s1, tol: 1 },
        { key: "s2", label: "Step 2 \u2014 1500W circuits (W)", answer: c.s2, tol: 1 },
        { key: "s3", label: "Step 3 \u2014 appliances (W)", answer: c.s3, tol: 1 },
        { key: "s4", label: "Step 4 \u2014 after demand (W)", answer: c.sub, tol: 5 },
        { key: "s6", label: "Step 6 \u2014 service amps", answer: c.amps, tol: 0.6 }
      ],
      steps: coreSteps(sqft, circuits, appliances, c, null)
    };
  }

  /* V4: existing service — how much is left */
  function boxHeadroom() {
    var service = pick([100, 150, 200]);
    var sqft, circuits, appliances, heat, ac, hvac, c, guard = 0;
    do {
      sqft = rnd(10, 30) * 100; circuits = rnd(3, 5);
      appliances = drawAppliances(rnd(3, 5));
      heat = rnd(45, 110) * 100; ac = rnd(30, 60) * 100;
      hvac = Math.max(heat, ac);
      c = coreCalc(sqft, circuits, appliances, hvac);
      guard++;
    } while ((c.amps > service * 0.92 || c.amps < service * 0.35) && guard < 120);

    var spareA = r2(service - c.amps);
    var spareW = r2(spareA * 230);
    return {
      tag: "Breaker box load \u2022 Remaining capacity",
      scenario: "The building already has a " + service + "A service. The owner wants to add equipment. Work out what capacity is left.",
      rows: [["Existing service", service + "A"],
             ["Living area", fmt(sqft) + " sq ft"],
             ["Small appliance + laundry circuits", String(circuits)]]
        .concat(appliances.map(function (a) { return [a.n, fmt(a.w) + "W"]; }))
        .concat([["Heating unit", fmt(heat) + "W"], ["Central air", fmt(ac) + "W"]]),
      fields: [
        { key: "s6", label: "Calculated load (A)", answer: c.amps, tol: 0.6 },
        { key: "sp", label: "Spare capacity (A)", answer: spareA, tol: 0.7 },
        { key: "sw", label: "Spare capacity (W)", answer: spareW, tol: 160 }
      ],
      steps: coreSteps(sqft, circuits, appliances, c,
        "Larger of heat and air = " + fmt(hvac) + "W \u2192 total <b>" + fmt(c.total) + "W</b>")
        .concat([
          service + "A \u2212 " + fmt(c.amps) + "A = <b>" + fmt(spareA) + "A</b> spare",
          fmt(spareA) + "A \u00D7 230V = <b>" + fmt(spareW) + "W</b> of headroom"
        ])
    };
  }

  /* V6: motor start — continuous load against rated, surge against max */
  function genSurge() {
    var MOTORS = ["water pump", "air compressor", "reefer unit", "winch", "shop vac"];
    var n, a, v, motorA, mult, running, peak, gen, guard = 0;
    do {
      v = rnd(24, 110); a = pick([1, 1.5, 2]); n = rnd(3, 12);
      motorA = pick([4, 5, 6, 8, 10]);
      mult = pick([2, 2.5, 3]);
      running = r2(n * a + motorA);
      peak = r2(running + motorA * (mult - 1));
      gen = GENS.filter(function (g) {
        return g.ratedA >= running && g.maxA >= peak;
      }).sort(function (x, y) { return x.lb - y.lb; })[0];
      guard++;
    } while (!gen && guard < 200);
    if (!gen) return genUniform();

    var ratedOnly = pickGen(running);
    return {
      tag: "Generator selection \u2022 Motor start",
      scenario: "The loadout includes a motor. It draws its running current continuously but pulls a surge on start. Size the continuous load against the rated column and the surge against the max column.",
      rows: [
        ["Devices \u00D7" + n + " \u2014 " + pick(DEVICES), v + "V / " + a + "A each"],
        ["Motor \u2014 " + pick(MOTORS), motorA + "A running"],
        ["Motor starting draw", mult + "\u00D7 running"]
      ],
      fields: [
        { key: "r", label: "Running load (A)", answer: running, tol: 0.15 },
        { key: "p", label: "Peak load at start (A)", answer: peak, tol: 0.15 },
        { key: "g", label: "Generator", kind: "select", options: GEN_NAMES, answer: gen.name }
      ],
      steps: [
        a + "A \u00D7 " + n + " = " + fmt(n * a) + "A from the devices",
        fmt(n * a) + "A + " + motorA + "A motor = <b>" + fmt(running) + "A</b> running",
        motorA + "A \u00D7 " + mult + " = " + fmt(motorA * mult) + "A on start, so peak = "
          + fmt(running) + "A + " + fmt(motorA * (mult - 1)) + "A = <b>" + fmt(peak) + "A</b>",
        "Need rated \u2265 " + fmt(running) + "A and max \u2265 " + fmt(peak) + "A \u2192 <b>"
          + gen.name + "</b> (" + gen.ratedA + "A rated / " + gen.maxA + "A max)"
          + (ratedOnly && ratedOnly.name !== gen.name
              ? " \u2014 the " + ratedOnly.name + " handles the running load but its "
                + ratedOnly.maxA + "A max cannot take the start"
              : "")
      ]
    };
  }

  var GEN_VARIANTS = [genUniform, genMixed, genWattage, genExpansion, genHeadroom, genSurge];
  var BOX_VARIANTS = [boxStandard, boxPanel, boxShop, boxHeadroom];

  function make(mode) {
    if (mode === "gen") return pick(GEN_VARIANTS)();
    if (mode === "box") return pick(BOX_VARIANTS)();
    return pick(GEN_VARIANTS.concat(BOX_VARIANTS))();
  }

  /* ============================================================
     UI
     ============================================================ */

  var CSS = ""
  + ".m1c{--m1-line:var(--line,#2a333c);--m1-mut:var(--muted,#8d9aa7);--m1-acc:var(--accent,#f0a202);"
  + "--m1-ok:var(--good,#54a86e);--m1-bad:var(--bad,#d4564f);"
  + "--m1-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:inherit;max-width:680px;margin:0 auto}"
  + ".m1c *{box-sizing:border-box}"
  + ".m1c-tabs{display:flex;gap:8px;margin-bottom:14px}"
  + ".m1c-tab{flex:1;border:1px solid var(--m1-line);background:rgba(255,255,255,.03);color:var(--m1-mut);"
  + "padding:10px 6px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;text-align:center}"
  + ".m1c-tab[aria-selected=true]{color:inherit;border-color:var(--m1-acc);box-shadow:inset 0 -2px 0 var(--m1-acc)}"
  + ".m1c-card{border:1px solid var(--m1-line);border-radius:10px;padding:16px;margin-bottom:12px;background:rgba(255,255,255,.02)}"
  + ".m1c-tag{font-size:.72rem;color:var(--m1-acc);font-weight:600;margin-bottom:6px}"
  + ".m1c-scn{font-size:.9rem;margin:0 0 12px;opacity:.92}"
  + ".m1c-rows{width:100%;border-collapse:collapse;font-family:var(--m1-mono);font-size:.82rem}"
  + ".m1c-rows td{padding:5px 0;border-bottom:1px solid var(--m1-line)}"
  + ".m1c-rows td:last-child{text-align:right;white-space:nowrap}"
  + ".m1c-rows tr:last-child td{border-bottom:none}"
  + ".m1c-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}"
  + "@media(max-width:420px){.m1c-fields{grid-template-columns:1fr}}"
  + ".m1c-f label{display:block;font-size:.75rem;color:var(--m1-mut);margin-bottom:4px}"
  + ".m1c-f input,.m1c-f select{width:100%;background:rgba(0,0,0,.35);border:1px solid var(--m1-line);"
  + "color:inherit;border-radius:7px;padding:11px 12px;font-family:var(--m1-mono);font-size:1rem}"
  + ".m1c-f.bad input,.m1c-f.bad select{border-color:var(--m1-bad)}"
  + ".m1c-f.good input,.m1c-f.good select{border-color:var(--m1-ok)}"
  + ".m1c-btns{display:flex;gap:10px;margin-top:16px}"
  + ".m1c-btns button{flex:1;border-radius:8px;padding:12px;font-size:.88rem;font-weight:600;cursor:pointer;"
  + "border:1px solid var(--m1-line);background:rgba(255,255,255,.05);color:inherit}"
  + ".m1c-btns button.m1c-go{background:var(--m1-acc);color:var(--m1-go-fg,#1a1200);border-color:var(--m1-acc)}"
  + ".m1c-verdict{margin-top:14px;font-size:.88rem;font-weight:600}"
  + ".m1c-verdict.ok{color:var(--m1-ok)}.m1c-verdict.bad{color:var(--m1-bad)}"
  + ".m1c-steps{margin-top:12px;border-top:1px solid var(--m1-line);padding-top:12px}"
  + ".m1c-steps h4{font-size:.75rem;color:var(--m1-mut);margin:0 0 8px;font-weight:600}"
  + ".m1c-steps ol{margin:0;padding-left:20px;font-family:var(--m1-mono);font-size:.8rem;line-height:1.75;opacity:.9}"
  + ".m1c-steps b{color:var(--m1-acc)}"
  + ".m1c-ref{border:1px solid var(--m1-line);border-radius:10px;padding:12px 16px;margin-bottom:12px}"
  + ".m1c-ref summary{cursor:pointer;font-size:.82rem;font-weight:600;color:var(--m1-mut)}"
  + ".m1c-ref table{width:100%;border-collapse:collapse;font-family:var(--m1-mono);font-size:.76rem;margin-top:10px}"
  + ".m1c-ref th{text-align:left;color:var(--m1-mut);font-weight:500;padding:4px 6px 8px 0;border-bottom:1px solid var(--m1-line)}"
  + ".m1c-ref td{padding:6px 6px 6px 0;border-bottom:1px solid var(--m1-line)}"
  + ".m1c-score{font-family:var(--m1-mono);font-size:.78rem;color:var(--m1-mut);text-align:center;margin-top:14px}";

  function injectCSS() {
    if (document.getElementById("m1c-style")) return;
    var s = document.createElement("style");
    s.id = "m1c-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function refTable() {
    return "<details class='m1c-ref'><summary>Honda generator ratings</summary>"
      + "<table><tr><th>Model</th><th>Rated (continuous)</th><th>Max (surge)</th><th>Weight</th></tr>"
      + GENS.map(function (g) {
          return "<tr><td>" + g.name.replace("Honda ", "") + "</td>"
               + "<td>" + g.ratedW + "W / " + g.ratedA + "A</td>"
               + "<td>" + g.maxW + "W / " + g.maxA + "A</td>"
               + "<td>" + g.lb + " lb</td></tr>";
        }).join("")
      + "</table><p style='font-size:.75rem;color:var(--m1-mut);margin:10px 0 0;line-height:1.6'>"
      + "Continuous load sizes against the rated column. The max column is surge headroom only "
      + "\u2014 motor start, compressor kick \u2014 not a load you can run on."
      + "</p></details>";
  }

  function mount(host, opts) {
    opts = opts || {};
    injectCSS();
    var mode = opts.mode || "gen";
    var right = 0, asked = 0, prob = null;

    host.classList.add("m1c");
    host.innerHTML =
      "<div class='m1c-tabs' role='tablist'>"
      + "<div class='m1c-tab' data-m='gen' role='tab'>Generator</div>"
      + "<div class='m1c-tab' data-m='box' role='tab'>Breaker box</div>"
      + "<div class='m1c-tab' data-m='mix' role='tab'>Mixed</div>"
      + "</div>"
      + refTable()
      + "<div class='m1c-card' id='m1c-body'></div>"
      + "<div class='m1c-score'></div>";

    var body = host.querySelector("#m1c-body");
    var score = host.querySelector(".m1c-score");
    var tabs = [].slice.call(host.querySelectorAll(".m1c-tab"));

    function paintTabs() {
      tabs.forEach(function (t) { t.setAttribute("aria-selected", t.dataset.m === mode); });
    }
    tabs.forEach(function (t) {
      t.tabIndex = 0;
      t.onclick = function () { mode = t.dataset.m; paintTabs(); render(); };
      t.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t.click(); }
      };
    });

    function render() {
      prob = make(mode);
      body.innerHTML =
        "<div class='m1c-tag'>" + prob.tag + "</div>"
        + "<p class='m1c-scn'>" + prob.scenario + "</p>"
        + "<table class='m1c-rows'>"
        + prob.rows.map(function (r) {
            return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
          }).join("")
        + "</table>"
        + "<div class='m1c-fields'>"
        + prob.fields.map(function (f, i) {
            var input = f.kind === "select"
              ? "<select data-i='" + i + "'><option value=''>Select</option>"
                + f.options.map(function (o) { return "<option>" + o + "</option>"; }).join("")
                + "</select>"
              : "<input data-i='" + i + "' type='text' inputmode='decimal' autocomplete='off'>";
            return "<div class='m1c-f'><label>" + f.label + "</label>" + input + "</div>";
          }).join("")
        + "</div>"
        + "<div class='m1c-btns'>"
        + "<button class='m1c-go'>Check answer</button><button class='m1c-next'>New problem</button>"
        + "</div>"
        + "<div class='m1c-verdict'></div>";

      body.querySelector(".m1c-go").onclick = check;
      body.querySelector(".m1c-next").onclick = render;
    }

    function check() {
      var missed = [];
      prob.fields.forEach(function (f, i) {
        var el = body.querySelector("[data-i='" + i + "']");
        var ok;
        if (f.kind === "select") {
          ok = el.value === f.answer;
        } else {
          var v = parseFloat(String(el.value).replace(/[^0-9.\-]/g, ""));
          ok = !isNaN(v) && Math.abs(v - f.answer) <= f.tol;
        }
        el.parentNode.className = "m1c-f " + (ok ? "good" : "bad");
        if (!ok) missed.push(f.label.replace(/\s*\u2014.*/, ""));
      });

      var all = missed.length === 0;
      var v = body.querySelector(".m1c-verdict");
      v.className = "m1c-verdict " + (all ? "ok" : "bad");
      v.textContent = all ? "Correct." : "Missed: " + missed.join(", ") + ".";

      var old = body.querySelector(".m1c-steps");
      if (old) old.remove();
      var s = document.createElement("div");
      s.className = "m1c-steps";
      s.innerHTML = "<h4>Worked solution</h4><ol><li>" + prob.steps.join("</li><li>") + "</li></ol>";
      body.appendChild(s);

      asked++; if (all) right++;
      score.textContent = "Session: " + right + " correct of " + asked;
    }

    paintTabs();
    render();
    return { newProblem: render, setMode: function (m) { mode = m; paintTabs(); render(); } };
  }

  root.Mod1Calc = { mount: mount, generators: GENS, makeProblem: make };

})(window);
