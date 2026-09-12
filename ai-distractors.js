/* Flashcard Portal — AI distractor generation.
   Adds "Generate Wrong Answers" to the developer question builder.

   The AI key lives in a Supabase Edge Function, never here.
   This file only sends the question + correct answer and receives
   plain text back. Nothing secret passes through the browser.

   Depends on globals already defined in developer.html:
     draft, syncDraftFromForm(), renderChoiceEditor(), uid(), FC_CONFIG
   Load this AFTER those scripts. */

(function () {
  "use strict";

  var FN_NAME = "distractors";

  function fnUrl() {
    var base = (window.FC_CONFIG && window.FC_CONFIG.url) || "";
    return base.replace(/\/+$/, "") + "/functions/v1/" + FN_NAME;
  }

  /* Supabase session token, so the function can reject anonymous callers. */
  async function accessToken() {
    var client = window.FC && window.FC.client;
    if (!client || !client.auth) throw new Error("Sign in to the question studio first.");
    var r = await client.auth.getSession();
    if (r.error) throw r.error;
    var token = r.data && r.data.session && r.data.session.access_token;
    if (!token) throw new Error("Your session has ended. Sign in again to generate answers.");
    return token;
  }

  /* ---- API call ---------------------------------------------------- */

  async function fetchDistractors(question, correct, count, type) {
    var token = await accessToken();

    var res = await fetch(fnUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "apikey": (window.FC_CONFIG && window.FC_CONFIG.publishableKey) || ""
      },
      body: JSON.stringify({
        question: question,
        correct: correct,
        count: count,
        type: type
      })
    });

    var payload = null;
    try { payload = await res.json(); } catch (_) {}

    if (!res.ok) {
      var msg = (payload && (payload.error || payload.message)) || ("HTTP " + res.status);
      throw new Error(msg);
    }
    if (!payload || !Array.isArray(payload.wrong)) {
      throw new Error("Malformed response from the generator.");
    }
    return payload.wrong;
  }

  /* ---- Fill logic --------------------------------------------------- */

  function emptySlots() {
    return draft.choices.filter(function (c) {
      return !c.correct && !String(c.text || "").trim() && !c.image;
    });
  }

  function correctChoice() {
    return draft.choices.find(function (c) { return c.correct; });
  }

  function dedupe(list, against) {
    var seen = against.map(function (s) { return s.toLowerCase().trim(); });
    var out = [];
    list.forEach(function (item) {
      var norm = String(item || "").toLowerCase().trim();
      if (!norm) return;
      if (seen.indexOf(norm) !== -1) return;
      seen.push(norm);
      out.push(String(item).trim());
    });
    return out;
  }

  async function generate(replaceAll) {
    syncDraftFromForm();

    if (draft.type !== "multiple-choice" && draft.type !== "multiple-select") {
      alert("Switch the question type to Multiple Choice or Pick Multiple first.");
      return;
    }

    var qText = String(draft.questionText || "").trim();
    if (!qText) { alert("Type the question first."); return; }

    var right = correctChoice();
    var rightText = right ? String(right.text || "").trim() : "";
    if (!rightText) { alert("Type the correct answer and mark it correct first."); return; }

    /* Keep existing answers intact until generation succeeds. */
    var slots = replaceAll ? draft.choices.filter(function (c) { return !c.correct; }) : emptySlots();
    if (!slots.length) {
      alert("No empty answer slots. Use Replace, or add more with + Add Answer.");
      return;
    }

    var requestedDraft = draft;
    var requestedState = JSON.stringify(draft);
    var btn = document.getElementById("aiDistractorBtn");
    var btnReplace = document.getElementById("aiDistractorReplaceBtn");
    var note = document.getElementById("aiDistractorNote");
    var original = btn ? btn.textContent : "";

    if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }
    if (btnReplace) btnReplace.disabled = true;
    if (note) { note.textContent = "Asking the model for " + slots.length + " distractor(s)…"; }

    try {
      var existing = draft.choices.filter(function (c) { return !replaceAll || c.correct; })
        .map(function (c) { return String(c.text || "").trim(); })
        .filter(Boolean);

      var raw = await fetchDistractors(qText, rightText, slots.length, draft.type);
      var clean = dedupe(raw, existing);

      if (!clean.length) throw new Error("Model returned nothing usable. Try again.");

      syncDraftFromForm();
      if (draft !== requestedDraft || JSON.stringify(draft) !== requestedState) {
        throw new Error("The question changed while answers were being generated. Your edits were kept; generate again when ready.");
      }

      slots.forEach(function (slot, i) {
        if (clean[i]) {
          slot.text = clean[i];
          if (replaceAll) { slot.image = null; slot.imagePath = null; }
        }
      });

      renderChoiceEditor();

      var filled = Math.min(clean.length, slots.length);
      if (note) {
        note.textContent = "Filled " + filled + " of " + slots.length +
          ". Read every one before saving — the model can be confidently wrong.";
      }
    } catch (err) {
      if (note) note.textContent = "";
      alert("Could not generate: " + (err.message || String(err)));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = original || "✨ Generate Wrong Answers"; }
      if (btnReplace) btnReplace.disabled = false;
    }
  }

  /* ---- Wiring -------------------------------------------------------- */

  function wire() {
    var btn = document.getElementById("aiDistractorBtn");
    var btnReplace = document.getElementById("aiDistractorReplaceBtn");
    if (btn) btn.onclick = function () { generate(false); };
    if (btnReplace) btnReplace.onclick = function () {
      if (confirm("Clear all wrong answers and regenerate?")) generate(true);
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  window.FC_AI = { generate: generate, fetchDistractors: fetchDistractors };
})();
