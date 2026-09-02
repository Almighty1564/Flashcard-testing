// Flashcard Portal — distractor generator.
//
// Runs on Supabase Edge Functions (Deno). The AI API key is stored as a
// Supabase secret and never reaches the browser.
//
// Deploy:
//   supabase secrets set GEMINI_API_KEY=your_key_here
//   supabase functions deploy generate-distractors
//
// Swap providers by editing callModel() only. Everything else stays.

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

// Lock this to your own origins. "*" would let any site burn your quota.
const ALLOWED_ORIGINS = [
  "https://www.tomato08.com",
  "https://tomato08.com",
  "https://almighty1564.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:5500",
];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function buildPrompt(
  question: string,
  correct: string,
  count: number,
  type: string,
): string {
  const kind = type === "multiple-select" ? "multiple-select" : "multiple-choice";

  return [
    `You write distractors for ${kind} exam questions.`,
    "",
    "QUESTION:",
    question,
    "",
    "CORRECT ANSWER:",
    correct,
    "",
    `Write exactly ${count} INCORRECT answer options.`,
    "",
    "Rules:",
    "- Each must be factually wrong, but plausible to someone who studied poorly.",
    "- Match the correct answer's format, length, grammar and level of detail.",
    "- Target real misconceptions: confused terms, transposed values, adjacent concepts, common mix-ups.",
    "- No option may be arguably correct, a synonym of the correct answer, or a restatement of it.",
    "- Never write 'All of the above', 'None of the above', 'Both A and B', or joke answers.",
    "- No duplicates. No lettering, numbering, or bullet characters.",
    "- No explanations, no preamble, no markdown fences.",
    "",
    `Return ONLY a JSON array of exactly ${count} strings. Nothing else.`,
    `Example format: ["first wrong answer", "second wrong answer"]`,
  ].join("\n");
}

async function callModel(prompt: string): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,          // variety matters for distractors
        maxOutputTokens: 800,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Model API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Model returned no text.");
  return text;
}

function parseList(text: string, count: number): string[] {
  let s = String(text).trim();

  // Strip markdown fences if the model adds them anyway.
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let arr: unknown;
  try {
    arr = JSON.parse(s);
  } catch {
    // Fall back to the first bracketed span in the response.
    const m = s.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("Could not parse model output as JSON.");
    arr = JSON.parse(m[0]);
  }

  if (!Array.isArray(arr)) throw new Error("Model output was not a JSON array.");

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const v = String(item ?? "").trim().replace(/^[A-Da-d][.)]\s*/, "");
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.slice(0, count);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only." }, 405, origin);
  }
  if (!GEMINI_KEY) {
    return json({ error: "GEMINI_API_KEY is not set on the function." }, 500, origin);
  }

  // Require a caller token. Combined with verify_jwt this keeps the
  // endpoint off the open internet.
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Missing authorization." }, 401, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400, origin);
  }

  const question = String(body.question ?? "").trim();
  const correct = String(body.correct ?? "").trim();
  const type = String(body.type ?? "multiple-choice");
  let count = Number(body.count ?? 3);

  if (!question) return json({ error: "question is required." }, 400, origin);
  if (!correct) return json({ error: "correct is required." }, 400, origin);
  if (question.length > 4000 || correct.length > 2000) {
    return json({ error: "Question or answer is too long." }, 400, origin);
  }
  if (!Number.isFinite(count)) count = 3;
  count = Math.max(1, Math.min(8, Math.round(count)));

  try {
    const raw = await callModel(buildPrompt(question, correct, count, type));
    const wrong = parseList(raw, count);
    if (!wrong.length) return json({ error: "Model returned no usable options." }, 502, origin);
    return json({ wrong, model: MODEL }, 200, origin);
  } catch (err) {
    return json({ error: (err as Error).message || "Generation failed." }, 502, origin);
  }
});
