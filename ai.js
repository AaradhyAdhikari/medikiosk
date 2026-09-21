"use strict";
/* The model service behind the clinical summary and the document reader.
   Lives outside server.js so the same code can be exercised on its own —
   tools/ai-bench.js runs it against every provider that has a key — without
   booting the kiosk. One switch, several back ends, and the app degrades to
   its offline path rather than breaking if none is set.

   Callers build content in Anthropic's block shape —
     [{type:"text", text}, {type:"image", source:{type:"base64", media_type, data}}]
   — and each provider translates on the way out, so the two call sites never
   learn which service is answering. */

const PROVIDERS = {
  groq: {
    keyVar: "GROQ_API_KEY",
    model: "qwen/qwen3.8-27b",                 // Groq's current vision model (JSON mode, 3 images/request)
    // Free-tier limits are per model. Text-only work — the summary, the
    // follow-up questions — goes to a separate model with its own budget, so
    // a scan and a summary in the same minute do not fight over one quota.
    textModel: "llama-3.3-70b-versatile",
    textAlsoTry: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"],
    // Groq retires models often. When the one above answers "does not
    // exist", these are tried in turn before the provider is given up on.
    alsoTry: ["qwen/qwen3.6-27b", "meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"],
    url: "https://api.groq.com/openai/v1/chat/completions",
    style: "openai",
    label: "Groq",
  },
  mistral: {
    keyVar: "MISTRAL_API_KEY",
    model: "mistral-large-latest",
    // The free Experiment tier does not serve Large. These are tried in
    // turn when a model answers "not available in your subscription tier".
    alsoTry: ["mistral-medium-latest", "mistral-small-latest", "pixtral-12b-latest"],
    url: "https://api.mistral.ai/v1/chat/completions",
    style: "mistral",
    label: "Mistral",
  },
  anthropic: {
    keyVar: "ANTHROPIC_API_KEY",
    model: "claude-opus-5",
    url: "https://api.anthropic.com/v1/messages",
    style: "anthropic",
    label: "Claude",
  },
};

/* Every provider with a key joins the chain, in this order: the free tiers
   first, the paid one last. A call goes to the first; if that fails — a
   rate limit, a timeout, an outage, unparseable output — the same call goes
   to the next, so one free tier's bad minute never reaches the patient as
   "Saved as image". AI_PROVIDER=mistral (say) puts that one first; the rest
   still stand behind it. */
const PREFERENCE = ["groq", "mistral", "anthropic"];

function configure(env, opts) {
  env = env || process.env; opts = opts || {};
  const explicit = String(env.AI_PROVIDER || "").toLowerCase();
  const order = PROVIDERS[explicit]
    ? [explicit].concat(PREFERENCE.filter((p) => p !== explicit))
    : PREFERENCE;
  const timeoutMs = Number(env.AI_TIMEOUT_MS || (opts.serverless ? 45000 : 90000));
  const clients = order
    .filter((p) => env[PROVIDERS[p].keyVar])
    .map((p) => makeClient({
      provider: p,
      key: env[PROVIDERS[p].keyVar],
      // AI_MODEL_GROQ / AI_MODEL_MISTRAL pin one provider's model; AI_MODEL
      // (or the old ANTHROPIC_MODEL) applies to whichever is first.
      model: env["AI_MODEL_" + p.toUpperCase()] || (p === order[0] && (env.AI_MODEL || env.ANTHROPIC_MODEL)) || PROVIDERS[p].model,
      textModel: env["AI_TEXT_MODEL_" + p.toUpperCase()] || PROVIDERS[p].textModel || null,
      timeoutMs,
      log: opts.log,
    }));
  return chain(clients, opts.log);
}

function chain(clients, log) {
  const warn = log || ((...a) => console.warn(...a));
  const first = clients[0];
  if (!first) {
    // No key anywhere. Same shape as a live client, so callers need no branch.
    const off = makeClient({ provider: "anthropic", key: "", model: PROVIDERS.anthropic.model });
    return Object.assign({}, off, { on: false, chain: [], check: async () => [] });
  }
  async function viaEach(fn, what) {
    const errors = [];
    for (const c of clients) {
      try {
        return await fn(c);
      } catch (e) {
        errors.push(c.label + ": " + String(e && e.message || e).slice(0, 160));
        const next = clients[clients.indexOf(c) + 1];
        if (next) warn("  " + what + " on " + c.label + " failed (" + String(e.message).slice(0, 100) + ") — trying " + next.label);
      }
    }
    // Every provider failed. Report all of them: the last error alone hides
    // why the first one — the one that should have answered — did not.
    throw new Error(errors.join(" | "));
  }
  /* One tiny request to every provider in the chain, in parallel, so an
     operator can see which keys work without scanning a paper and reading
     the event log. Text only, a handful of tokens: free on every tier. */
  async function check() {
    return Promise.all(clients.map(async (c) => {
      const t0 = Date.now();
      try {
        const text = await c.ask([{ type: "text", text: 'Reply with exactly this JSON and nothing else: {"ok":true}' }], 60);
        const ok = /"ok"\s*:\s*true/.test(text);
        return { provider: c.provider, model: c.model, ok, ms: Date.now() - t0, error: ok ? null : "unexpected reply: " + text.slice(0, 60) };
      } catch (e) {
        return { provider: c.provider, model: c.model, ok: false, ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 200) };
      }
    }));
  }

  return {
    provider: first.provider, model: first.model, label: first.label, on: true,
    chain: clients.map((c) => c.provider + " · " + c.model + (c.textModel && c.textModel !== c.model ? " (text: " + c.textModel + ")" : "")),
    ask: (content, maxTokens) => viaEach((c) => c.ask(content, maxTokens), "summary"),
    readDocument: (dataUrl) => viaEach((c) => c.readDocument(dataUrl), "document read"),
    check,
    parseJson,
  };
}

function makeClient({ provider, key, model, textModel, timeoutMs, log }) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error("Unknown AI provider: " + provider);
  const warn = log || ((...a) => console.warn(...a));

  /* A model call that never answers is worse than one that fails: the kiosk
     sits on "Reading…" and a serverless host kills the function underneath
     it, which the patient sees as nothing at all. Bound every call so the
     failure is ours to report. */
  /* "Model does not exist" is a configuration problem, not a request problem;
     the next model on the list may well exist. Everything else is thrown. */
  const goneModel = (e) => /model.{0,40}(does not exist|not found|decommissioned|deprecated|no longer)|not available in your subscription|tier_not_allowed/i.test(String(e && e.message));
  let activeModel = model;
  let activeText = textModel || null;

  async function ask(content, maxTokens) {
    const hasImage = (content || []).some((b) => b && b.type === "image");
    // Text-only calls take the text model when the provider has one; a call
    // carrying an image must go to a model that can see.
    const useText = !hasImage && activeText;
    const first = useText ? activeText : activeModel;
    const also = useText ? (spec.textAlsoTry || []) : (spec.alsoTry || []);
    const candidates = [first].concat(also.filter((m) => m !== first));
    for (let i = 0; i < candidates.length; i++) {
      try {
        const text = await askWith(candidates[i], content, maxTokens);
        if (candidates[i] !== first) {
          warn("  " + spec.label + ": model " + first + " is gone; using " + candidates[i] + " from now on");
          if (useText) activeText = candidates[i]; else activeModel = candidates[i];
        }
        return text;
      } catch (e) {
        if (!goneModel(e) || i === candidates.length - 1) throw e;
      }
    }
  }

  async function askWith(model, content, maxTokens, jsonMode) {
    if (jsonMode === undefined) jsonMode = true;
    const signal = AbortSignal.timeout(timeoutMs || 90000);
    if (spec.style === "anthropic") {
      const res = await fetch(spec.url, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: maxTokens || 3000, messages: [{ role: "user", content }] }),
      });
      if (!res.ok) throw new Error(spec.label + " API " + res.status + " " + (await res.text()).slice(0, 200));
      const j = await res.json();
      return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    }

    // Mistral and Groq both speak the OpenAI chat shape; they differ only in
    // how an inline image is spelled.
    const body = {
      model,
      max_tokens: maxTokens || 3000,
      messages: [{ role: "user", content: toChatContent(content, spec.style) }],
    };
    // Both callers ask for a JSON object and parse it. JSON mode makes the
    // smaller models stop wrapping it in prose or half a code fence.
    if (jsonMode) body.response_format = { type: "json_object" };
    const res = await fetch(spec.url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      /* Groq validates JSON-mode output and returns 400 when the model's
         answer did not parse — usually a long answer cut off, sometimes a
         model that strays. Ask once more without JSON mode; the caller's
         parser copes with a code fence or a line of prose around the object. */
      if (jsonMode && res.status === 400 && /validate JSON|json_validate/i.test(detail)) {
        warn("  " + spec.label + ": JSON mode refused on " + model + " — retrying without it");
        return askWith(model, content, maxTokens, false);
      }
      throw new Error(spec.label + " API " + res.status + " " + detail);
    }
    const j = await res.json();
    const msg = j && j.choices && j.choices[0] && j.choices[0].message;
    const text = msg && msg.content;
    // Some responses come back as an array of parts rather than a plain string.
    if (Array.isArray(text)) {
      return text.map((p) => (typeof p === "string" ? p : (p && p.text) || "")).join("\n");
    }
    if (typeof text !== "string" || !text.trim()) throw new Error(spec.label + " API returned no text");
    return text;
  }

  async function readDocument(dataUrl) {
    const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl || "");
    if (!m) throw new Error("Expected a base64 image data URL");
    try {
      return await readOnce(m[1], m[2]);
    } catch (e) {
      if (!transient(e)) throw e;
      warn("  document read retrying after:", String(e.message).slice(0, 120));
      // A free-tier 429 clears in a second or two; retrying instantly just
      // earns a second one.
      await new Promise((r) => setTimeout(r, /429/.test(String(e.message)) ? 2500 : 800));
      return await readOnce(m[1], m[2]);
    }
  }

  async function readOnce(mediaType, data) {
    const text = await ask([
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      { type: "text", text: DOCUMENT_PROMPT },
    ], 1500);
    return parseJson(text);
  }

  return {
    provider, label: spec.label,
    get model() { return activeModel; },
    get textModel() { return activeText; },
    on: Boolean(key),
    ask, readDocument, parseJson,
  };
}

function toChatContent(blocks, style) {
  return (blocks || []).map((b) => {
    if (b && b.type === "image" && b.source && b.source.type === "base64") {
      const url = "data:" + b.source.media_type + ";base64," + b.source.data;
      // Mistral takes the data URL directly under image_url; the OpenAI shape
      // (which Groq follows) wraps it in {url}.
      return { type: "image_url", image_url: style === "mistral" ? url : { url } };
    }
    return b;                                    // text blocks are identical everywhere
  });
}

const DOCUMENT_PROMPT =
  "This is a photograph of an Indian medical document — a prescription, lab report, discharge summary " +
  "or a medicine strip. It may be handwritten, in Hindi or English, and poorly lit.\n\n" +
  "Extract only what you can actually read. Never guess a drug name, a dose or a value you cannot see " +
  "clearly — an omission is safe, an invention is dangerous.\n\n" +
  'Reply with ONLY a JSON object: {"docType": "prescription"|"lab_report"|"discharge"|"medicine_strip"|"other", ' +
  '"date": the printed date as a plain string or null, "label": a short human label like "Lab report · 12 Jan 2026", ' +
  '"summary": one sentence on what this document is, ' +
  '"findings": array of up to 8 short strings — diagnoses, medicines with dose, or test values with units and ranges, ' +
  '"abnormal": array of values outside their stated reference range, ' +
  '"readable": true if you could read the clinical content, false if the image is too unclear}';

function parseJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const c = fence ? fence[1] : text;
  try { return JSON.parse(c); } catch { }
  const a = c.indexOf("{"), b = c.lastIndexOf("}");
  if (a > -1 && b > a) { try { return JSON.parse(c.slice(a, b + 1)); } catch { } }
  throw new Error("Model did not return parseable JSON");
}

/* One retry, only for the failures that a second attempt can fix — a rate
   limit, a 5xx, a dropped connection. A 400 means the request itself is wrong
   and asking again just spends another call. */
const transient = (e) => /\b(429|5\d\d)\b|timeout|abort|ECONNRESET|fetch failed|network/i.test(String(e && e.message));

module.exports = { PROVIDERS, PREFERENCE, configure, makeClient, parseJson, DOCUMENT_PROMPT };
