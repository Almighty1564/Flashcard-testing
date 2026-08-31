/* Flashcard Portal — shared Supabase layer.
   Loaded by tester.html, mod1.html and developer.html.
   Requires supabase-config.js and the Supabase UMD bundle to load first.

   Everything is exposed on window.FC so the existing inline page scripts
   can keep working unchanged. */

(function () {
  "use strict";

  var cfg = window.FC_CONFIG || {};
  var lib = window.supabase;

  if (!lib || !lib.createClient) {
    console.error("Supabase library did not load.");
  }

  var client = lib.createClient(cfg.url, cfg.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "flashcard_portal_session"
    }
  });

  var signedUrlCache = new Map();

  /* ---------------------------------------------------------------
     AUTH
     --------------------------------------------------------------- */

  function usernameToEmail(username) {
    var u = String(username || "").trim().toLowerCase();
    if (!u) return "";
    if (u.indexOf("@") !== -1) return u;
    return u + "@" + (cfg.emailDomain || "flashcard.invalid");
  }

  async function signIn(username, password) {
    var email = usernameToEmail(username);
    if (!email) throw new Error("Enter your username.");
    if (!password) throw new Error("Enter your password.");

    var res = await client.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (res.error) throw new Error("Username or password is incorrect.");
    return res.data.session;
  }

  async function signOut() {
    signedUrlCache.clear();
    try { await client.auth.signOut(); } catch (_) {}
  }

  async function getSession() {
    var res = await client.auth.getSession();
    return res.data ? res.data.session : null;
  }

  async function getProfile() {
    var session = await getSession();
    if (!session) return null;

    var res = await client
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (res.error) throw new Error(res.error.message);
    if (!res.data) return { id: session.user.id, username: null, role: "tester" };
    return res.data;
  }

  /* Returns a profile, or null if nobody is signed in. */
  async function requireUser() {
    var session = await getSession();
    if (!session) return null;
    return await getProfile();
  }

  async function requireDeveloper() {
    var profile = await requireUser();
    if (!profile) return null;
    if (profile.role !== "developer") return { denied: true, profile: profile };
    return { denied: false, profile: profile };
  }

  /* ---------------------------------------------------------------
     IMAGES  (private bucket -> short-lived signed URLs)
     --------------------------------------------------------------- */

  function collectPaths(rows) {
    var paths = new Set();
    rows.forEach(function (q) {
      if (q.question_image_path) paths.add(q.question_image_path);
      var ad = q.answer_data || {};
      if (ad.image_path) paths.add(ad.image_path);
      (ad.choices || []).forEach(function (c) {
        if (c && c.image_path) paths.add(c.image_path);
      });
      (ad.pairs || []).forEach(function (p) {
        if (p && p.left && p.left.image_path) paths.add(p.left.image_path);
        if (p && p.right && p.right.image_path) paths.add(p.right.image_path);
      });
    });
    return Array.from(paths);
  }

  async function signPaths(paths) {
    var wanted = paths.filter(function (p) { return p && !signedUrlCache.has(p); });
    if (!wanted.length) return;

    /* One hour is long enough for a study session and short enough
       that a leaked URL expires on its own. */
    var res = await client.storage
      .from(cfg.imageBucket)
      .createSignedUrls(wanted, 3600);

    if (res.error) {
      console.warn("Could not sign image URLs:", res.error.message);
      return;
    }
    (res.data || []).forEach(function (row) {
      if (row && row.path && row.signedUrl) signedUrlCache.set(row.path, row.signedUrl);
    });
  }

  function signedUrl(path) {
    if (!path) return null;
    return signedUrlCache.get(path) || null;
  }

  async function uploadImage(dataUrl, storagePath) {
    var blob = await (await fetch(dataUrl)).blob();
    var res = await client.storage
      .from(cfg.imageBucket)
      .upload(storagePath, blob, { upsert: true, contentType: blob.type || "image/png" });
    if (res.error) throw new Error("Image upload failed: " + res.error.message);
    signedUrlCache.delete(storagePath);
    return storagePath;
  }

  async function removeImages(paths) {
    var list = (paths || []).filter(Boolean);
    if (!list.length) return;
    try {
      await client.storage.from(cfg.imageBucket).remove(list);
      list.forEach(function (p) { signedUrlCache.delete(p); });
    } catch (_) {}
  }

  /* ---------------------------------------------------------------
     MODULES
     --------------------------------------------------------------- */

  async function listModules() {
    var res = await client
      .from("modules")
      .select("id, slug, name, description, is_published")
      .order("slug", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return res.data || [];
  }

  async function getModule(slug) {
    var res = await client
      .from("modules")
      .select("id, slug, name, description, is_published")
      .eq("slug", slug)
      .maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }

  /* ---------------------------------------------------------------
     BANK LOADING  (returns the exact shape the study engine expects)
     --------------------------------------------------------------- */

  function toCard(row, index) {
    var ad = row.answer_data || {};
    var card = {
      id: row.id,
      groupId: row.group_id,
      type: row.question_type,
      order: row.sort_order != null ? row.sort_order : index + 1,
      status: "complete",
      question: {
        text: row.question_text || "",
        image: signedUrl(row.question_image_path)
      }
    };

    if (row.question_type === "flashcard") {
      card.answer = {
        text: ad.text || "",
        image: signedUrl(ad.image_path)
      };
    }

    if (row.question_type === "multiple-choice" || row.question_type === "multiple-select") {
      card.choices = (ad.choices || []).map(function (c, i) {
        return {
          id: c.id || row.id + "-choice-" + (i + 1),
          text: c.text || "",
          image: signedUrl(c.image_path),
          correct: c.correct === true
        };
      });
      card.shuffleChoices = ad.shuffle !== false;
    }

    if (row.question_type === "matching") {
      card.pairs = (ad.pairs || []).map(function (p, i) {
        var left = p.left || {};
        var right = p.right || {};
        return {
          id: p.id || row.id + "-pair-" + (i + 1),
          left: { text: left.text || "", image: signedUrl(left.image_path) },
          right: { text: right.text || "", image: signedUrl(right.image_path) }
        };
      });
    }

    return card;
  }

  async function loadBank(slug) {
    var module = await getModule(slug);
    if (!module) throw new Error("Module \"" + slug + "\" was not found, or you do not have access to it.");

    var groupRes = await client
      .from("question_groups")
      .select("id, name, sort_order")
      .eq("module_id", module.id)
      .order("sort_order", { ascending: true });
    if (groupRes.error) throw new Error(groupRes.error.message);

    var qRes = await client
      .from("questions")
      .select("id, group_id, question_type, question_text, question_image_path, answer_data, sort_order, is_active")
      .eq("module_id", module.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (qRes.error) throw new Error(qRes.error.message);

    var rows = qRes.data || [];
    await signPaths(collectPaths(rows));

    return {
      schemaVersion: 1,
      module: { id: module.id, slug: module.slug, name: module.name },
      groups: (groupRes.data || []).map(function (g, i) {
        return { id: g.id, name: g.name, order: g.sort_order != null ? g.sort_order : i + 1 };
      }),
      cards: rows.map(toCard)
    };
  }

  /* ---------------------------------------------------------------
     TESTER PROGRESS
     --------------------------------------------------------------- */

  async function loadProgress(questionIds) {
    var session = await getSession();
    if (!session) throw new Error("Not signed in.");

    var out = { progress: {}, mastery: {}, totalReviews: 0 };
    var ids = questionIds || [];
    if (!ids.length) return out;

    /* Chunked so a very large module cannot blow up the query string. */
    var chunk = 300;
    for (var i = 0; i < ids.length; i += chunk) {
      var slice = ids.slice(i, i + chunk);
      var res = await client
        .from("card_progress")
        .select("question_id, last_result, due_at, interval_days, ease, reps, lapses, total_reviews, last_reviewed_at")
        .eq("user_id", session.user.id)
        .in("question_id", slice);
      if (res.error) throw new Error(res.error.message);

      (res.data || []).forEach(function (r) {
        out.progress[r.question_id] = {
          dueAt: r.due_at ? Date.parse(r.due_at) : 0,
          intervalDays: Number(r.interval_days) || 0,
          ease: Number(r.ease) || 2.5,
          reps: r.reps || 0,
          lapses: r.lapses || 0,
          totalReviews: r.total_reviews || 0
        };
        if (r.last_result) {
          out.mastery[r.question_id] = {
            lastResult: r.last_result,
            lastReviewedAt: r.last_reviewed_at
          };
        }
        out.totalReviews += r.total_reviews || 0;
      });
    }
    return out;
  }

  async function saveCardProgress(questionId, p, mastery) {
    var session = await getSession();
    if (!session) return;

    var row = {
      user_id: session.user.id,
      question_id: questionId,
      last_result: mastery && mastery.lastResult ? mastery.lastResult : null,
      due_at: p && p.dueAt ? new Date(p.dueAt).toISOString() : null,
      interval_days: p ? p.intervalDays || 0 : 0,
      ease: p ? p.ease || 2.5 : 2.5,
      reps: p ? p.reps || 0 : 0,
      lapses: p ? p.lapses || 0 : 0,
      total_reviews: p ? p.totalReviews || 0 : 0,
      last_reviewed_at: mastery && mastery.lastReviewedAt ? mastery.lastReviewedAt : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    var res = await client
      .from("card_progress")
      .upsert(row, { onConflict: "user_id,question_id" });
    if (res.error) console.warn("Progress save failed:", res.error.message);
  }

  async function saveSession(moduleId, summary) {
    var session = await getSession();
    if (!session) return;

    var res = await client.from("test_sessions").insert({
      user_id: session.user.id,
      module_id: moduleId,
      mode: summary.mode,
      selected_group_ids: summary.scopeGroups || [],
      result_counts: summary.counts || {},
      total_questions: summary.total || 0,
      started_at: summary.startedAt || null,
      completed_at: summary.completedAt || new Date().toISOString()
    });
    if (res.error) console.warn("Session history save failed:", res.error.message);
  }

  /* ---------------------------------------------------------------
     QUESTION REPORTS
     --------------------------------------------------------------- */

  async function reportQuestion(questionId, moduleId, reason, details) {
    var session = await getSession();
    if (!session) throw new Error("Not signed in.");
    if (!reason) throw new Error("Pick what is wrong with the question.");

    var res = await client.from("question_reports").insert({
      question_id: questionId,
      module_id: moduleId || null,
      user_id: session.user.id,
      reason: reason,
      details: (details || "").slice(0, 2000) || null
    });
    if (res.error) throw new Error(res.error.message);
  }

  /* Developer only. Returns [] if the role check fails. */
  async function listReports(moduleSlug) {
    var res = await client.rpc("list_question_reports", {
      p_module_slug: moduleSlug || null
    });
    if (res.error) throw new Error(res.error.message);
    return res.data || [];
  }

  async function setReportStatus(id, status) {
    var res = await client.rpc("set_report_status", { p_id: id, p_status: status });
    if (res.error) throw new Error(res.error.message);
  }

  /* Stud number for display: explicit value, else digits from the
     username (tester07 -> 07), else null. */
  function studLabel(profile) {
    if (!profile) return null;
    if (profile.stud_number) return String(profile.stud_number);
    /* stud_number may not exist yet — fall through to the username */
    var m = String(profile.username || "").match(/(\d+)\s*$/);
    return m ? m[1] : null;
  }

  async function setStudNumber(userId, value) {
    var res = await client.rpc("set_stud_number", {
      p_user_id: userId, p_value: value == null ? "" : String(value)
    });
    if (res.error) {
      if (/set_stud_number|stud_number/i.test(res.error.message || "")) {
        throw new Error("Stud numbers need the latest SQL migration. Run supabase-reports-and-rank.sql.");
      }
      throw new Error(res.error.message);
    }
  }

  /* ---------------------------------------------------------------
     RANKING
     --------------------------------------------------------------- */

  /* { myRank, totalUsers, myLearned, topLearned, bankSize } or null. */
  async function memorizedRank(moduleSlug) {
    var res = await client.rpc("memorized_rank", { p_module_slug: moduleSlug });
    if (res.error) {
      console.warn("Rank lookup failed:", res.error.message);
      return null;
    }
    var row = (res.data || [])[0];
    if (!row) return null;
    return {
      myRank: row.my_rank,
      totalUsers: row.total_users,
      myLearned: row.my_learned,
      topLearned: row.top_learned,
      bankSize: row.bank_size
    };
  }

  /* ---------------------------------------------------------------
     EXPORT
     --------------------------------------------------------------- */

  window.FC = {
    client: client,
    config: cfg,
    usernameToEmail: usernameToEmail,
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    getProfile: getProfile,
    requireUser: requireUser,
    requireDeveloper: requireDeveloper,
    listModules: listModules,
    getModule: getModule,
    loadBank: loadBank,
    loadProgress: loadProgress,
    saveCardProgress: saveCardProgress,
    saveSession: saveSession,
    signPaths: signPaths,
    signedUrl: signedUrl,
    uploadImage: uploadImage,
    removeImages: removeImages,
    reportQuestion: reportQuestion,
    listReports: listReports,
    setReportStatus: setReportStatus,
    memorizedRank: memorizedRank,
    studLabel: studLabel,
    setStudNumber: setStudNumber
  };
})();
