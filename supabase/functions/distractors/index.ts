const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MODEL = "gemini-3.5-flash-lite";
const DAILY_LIMIT = 100;
const ALLOWED_ORIGINS = new Set([
  "https://www.tomato08.com",
  "https://tomato08.com",
  "https://almighty1564.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:5500",
]);

function allowedOrigin(origin: string | null) {
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}
function corsHeaders(origin: string | null) {
  const allow = allowedOrigin(origin);
  return {
    ...(allow ? {"Access-Control-Allow-Origin": allow} : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {status, headers:{...corsHeaders(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});
}
function buildPrompt(question: string, correct: string, count: number, type: string) {
  const kind = type === "multiple-select" ? "multiple-select" : "multiple-choice";
  return [
    `Write ${count} WRONG answer options for this ${kind} exam question.`,
    `QUESTION: ${question}`,
    `CORRECT ANSWER: ${correct}`,
    "Use real alternatives from the same category as the correct answer.",
    "Make the first option the most tempting near miss, then medium, then easier distractors.",
    "Respect negation in the question. For a NOT question, wrong options should be actual members of the excluded category.",
    "For phrase answers, keep the same sentence shape and change the decisive detail.",
    "Never output an option that could also be correct, a synonym/restatement, duplicates, All/None of the above, labels, or explanations.",
    "Match the correct answer's format, length, units, and level of detail.",
    `Output ONLY a JSON array of exactly ${count} strings, most tempting first.`
  ].join("\n\n");
}
function parseList(text: string, count: number) {
  let s = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let arr: unknown = null;
  try { arr = JSON.parse(s); } catch {
    const match = s.match(/\[[\s\S]*\]/);
    if (match) try { arr = JSON.parse(match[0]); } catch { arr = null; }
  }
  if (arr && !Array.isArray(arr) && typeof arr === "object") {
    arr = Object.values(arr as Record<string,unknown>).find(v => Array.isArray(v)) ?? null;
  }
  if (!Array.isArray(arr)) throw new Error("unparseable model response");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const value = String(item ?? "").trim().replace(/^[A-Da-d][.)]\s*/, "");
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key); out.push(value);
  }
  return out.slice(0, count);
}
async function consumeQuota(auth: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("authorization service unavailable");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
    method:"POST",
    headers:{"Authorization":auth,"apikey":SUPABASE_ANON_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({p_daily_limit:DAILY_LIMIT}),
  });
  if (response.status === 401 || response.status === 403) return {authorized:false,allowed:false};
  if (!response.ok) throw new Error("authorization check failed");
  return {authorized:true,allowed:await response.json() === true};
}
async function callModel(prompt: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method:"POST",
      signal:controller.signal,
      headers:{"Content-Type":"application/json","x-goog-api-key":GEMINI_KEY},
      body:JSON.stringify({
        contents:[{parts:[{text:prompt}]}],
        generationConfig:{temperature:0.9,maxOutputTokens:2048,responseMimeType:"application/json",thinkingConfig:{thinkingLevel:"minimal"}}
      })
    });
    if (!response.ok) throw new Error(`model provider returned ${response.status}`);
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("model returned no text");
    return text;
  } finally { clearTimeout(timer); }
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (!allowedOrigin(origin)) return json({error:"Origin not allowed."}, 403, origin);
  if (req.method === "OPTIONS") return new Response("ok", {headers:corsHeaders(origin)});
  if (req.method !== "POST") return json({error:"POST only."},405,origin);
  if (!GEMINI_KEY) return json({error:"Generator is unavailable."},503,origin);

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({error:"Sign in required."},401,origin);

  let body: Record<string,unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string,unknown>;
  } catch { return json({error:"Body must be a JSON object."},400,origin); }

  const question = String(body.question ?? "").trim();
  const correct = String(body.correct ?? "").trim();
  const type = String(body.type ?? "multiple-choice");
  let count = Number(body.count ?? 3);
  if (!question || !correct) return json({error:"Question and correct answer are required."},400,origin);
  if (question.length > 4000 || correct.length > 2000) return json({error:"Question or answer is too long."},400,origin);
  if (!['multiple-choice','multiple-select'].includes(type)) return json({error:"Unsupported question type."},400,origin);
  if (!Number.isFinite(count)) count = 3;
  count = Math.max(1,Math.min(8,Math.round(count)));

  try {
    const quota = await consumeQuota(auth);
    if (!quota.authorized) return json({error:"Developer access required."},403,origin);
    if (!quota.allowed) return json({error:"Daily AI generation limit reached."},429,origin);
    const wrong = parseList(await callModel(buildPrompt(question,correct,count,type)),count);
    if (!wrong.length) return json({error:"Generator returned no usable options."},502,origin);
    return json({wrong,model:MODEL},200,origin);
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === 'AbortError';
    console.error("distractors failed", timeout ? "timeout" : String((error as Error)?.message || "error"));
    return json({error:timeout ? "Generator timed out. Try again." : "Generation failed. Try again."},502,origin);
  }
});
