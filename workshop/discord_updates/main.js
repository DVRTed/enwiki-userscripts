import "dotenv/config";
import Groq from "groq-sdk";
import sharp from "sharp";
import { fetch_talk_threads } from "./parse_talk.js";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const GROQ_MODEL = "llama-3.3-70b-versatile";
const groq = new Groq();

const PAGES = {
  ANI: "Wikipedia:Administrators' noticeboard/Incidents",
  USR: "Wikipedia:User scripts/Requests",
};

const GROQ_OUTPUT_TOKENS = 3000;
const MAX_INPUT_CHARS = 28000;

async function callGroq(prompt, maxTokens = GROQ_OUTPUT_TOKENS) {
  const res = await groq.chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });
  return JSON.parse(res.choices[0].message.content);
}

function compileThreadsForPrompt(threads, maxCommentsPerThread) {
  let result = [];
  let currentChars = 0;

  for (let i = threads.length - 1; i >= 0; i--) {
    let threadComments = threads[i].comments;

    if (threadComments.length > maxCommentsPerThread) {
      const keepHalf = Math.floor(maxCommentsPerThread / 2);
      threadComments = [
        ...threadComments.slice(0, keepHalf),
        {
          author: "System",
          text: `...[${
            threadComments.length - maxCommentsPerThread
          } comments collapsed]...`,
        },
        ...threadComments.slice(-keepHalf),
      ];
    }

    const commentsText = threadComments
      .map((c) => `${c.author}: ${c.text}`)
      .join("\n");
    const text = `### ${threads[i].title}\n${commentsText}`;

    if (currentChars + text.length > MAX_INPUT_CHARS) {
      if (result.length === 0) {
        result.unshift(text.substring(0, MAX_INPUT_CHARS) + "\n...[TRUNCATED]");
      }
      break;
    }

    result.unshift(text);
    currentChars += text.length;
  }

  return result.join("\n\n---\n\n").trim();
}

async function analyzeANI(threads) {
  const promptText = compileThreadsForPrompt(threads, 10);

  const { incidents } = await callGroq(`
You are a Wikipedia drama analyst reviewing WP:ANI sections.

Pick the 4 most interesting or contentious incidents. Prioritize ones with many editors involved or heated back-and-forth.

Return JSON: { "incidents": [ ... ] }
Each item:
{
  "title": "exact section title",
  "summary": "3-5 sentences: who is involved, what the dispute is about, why it is heated",
  "dramaScore": <1, 2, or 3>,
  "participants": ["up to 4 editor usernames mentioned in the section"],
  "outcome": "State the outcome and exactly who it affected (eg 'UserX blocked indefinitely', 'UserY warned'), or if it's unresolved or ongoing, state that. IF YOU CANNOT DETERMINE, return null" 
}

SECTIONS:
${promptText}`);

  return incidents;
}

async function analyzeUSR(threads) {
  const promptText = compileThreadsForPrompt(threads, 10);
  console.log(`Sending USR prompt with length ${promptText.length}`);

  const { requests } = await callGroq(`
You are reviewing WP:US/R (Wikipedia:User scripts/Requests).

Find up to 5 requests that are truly UNANSWERED or UNRESOLVED. 
CRITICAL RULE: Do NOT include any requests where another editor has provided a script, a functional solution, a workaround, or a satisfying answer. If someone replied with a solution (even if it's not a script) and the requester expressed gratitude or marked it as resolved, it is COMPLETELY RESOLVED and must be fully skipped. Only select requests that are actively stranded and waiting for someone to help.

Return JSON: { "requests": [ ... ] }
Each item:
{
  "title": "exact section title",
  "description": "short description of what the editor is asking for",
  "status": "ignored" or "partial",
  "difficulty": "estimate of technical difficulty: 'Easy', 'Medium', or 'Hard'",
  "timeEstimate": "estimate of time required: e.g., '1-2 hours', 'A few days'"
}

SECTIONS:
${promptText}`);

  console.log("called for usr");
  return requests;
}

const W = 1600;
const PAD = 64;

const DEFS = (orb1, orb2) => `
  <defs>
    <filter id="blurLg" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="160"/>
    </filter>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.6" />
    </filter>
    <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.06" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.01" />
    </linearGradient>
    <linearGradient id="cardBorder" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02" />
    </linearGradient>
    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#09090b"/>
  <circle cx="0%" cy="0%" r="800" fill="${orb1}" opacity="0.12" filter="url(#blurLg)"/>
  <circle cx="100%" cy="100%" r="800" fill="${orb2}" opacity="0.12" filter="url(#blurLg)"/>
`;

const STYLE = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&amp;display=swap');
    text { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
    .header-title { font-size: 56px; font-weight: 800; fill: #ffffff; letter-spacing: -2px; }
    .header-sub { font-size: 18px; font-weight: 500; fill: #a1a1aa; letter-spacing: 1.5px; text-transform: uppercase; }
    .card-title { font-size: 32px; font-weight: 600; fill: #ffffff; letter-spacing: -0.5px; }
    .card-desc { font-size: 24px; font-weight: 400; fill: #a1a1aa; }
    .meta { font-size: 18px; font-weight: 500; fill: #71717a; }
  </style>
`;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(text, maxChars) {
  const words = String(text ?? "").split(" ");
  const lines = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (test.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function textLines(lines, x, startY, lh, className) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${startY + i * lh}" class="${className}">${esc(
          line
        )}</text>`
    )
    .join("\n");
}

function dramaBar(score, x, y) {
  return [1, 2, 3]
    .map(
      (n, i) =>
        `<rect x="${x + i * 32}" y="${
          y - 8
        }" width="24" height="12" rx="6" fill="${
          n <= score ? "#ef4444" : "#27272a"
        }"/>`
    )
    .join("");
}

function statusBadge(status, x, y) {
  const ignored = status === "ignored";
  const color = ignored ? "#ef4444" : "#eab308";
  const label = ignored ? "IGNORED" : "PARTIAL";
  const bw = 120;
  return `
    <rect x="${x}" y="${
    y - 24
  }" width="${bw}" height="36" rx="18" fill="${color}1A" stroke="${color}4D" stroke-width="2"/>
    <text x="${x + bw / 2}" y="${
    y + 2
  }" class="meta" style="font-size: 14px; font-weight: 600; fill: ${color}; letter-spacing: 1.5px" text-anchor="middle">${label}</text>`;
}

async function generateANIImage(incidents) {
  const IW = W - PAD * 2;
  const CP = 48;
  const TITLE_LH = 46;
  const DESC_LH = 36;
  const PARTS_LH = 32;

  const cards = incidents.map((inc) => {
    const titleLines = wrap(inc.title, 75);
    const summaryLines = wrap(inc.summary, 100).slice(0, 5);
    const parts = (inc.participants ?? []).slice(0, 4).join(", ");

    const titleH = titleLines.length * TITLE_LH;
    const partsH = parts ? PARTS_LH : 0;
    const descH = summaryLines.length * DESC_LH;
    const h =
      CP + titleH + (parts ? 12 : 0) + partsH + 24 + descH + 36 + 20 + CP;
    return {
      ...inc,
      titleLines,
      summaryLines,
      parts,
      cardH: h,
      titleH,
      partsH,
      descH,
    };
  });

  const HEADER_H = 240;
  const totalH = HEADER_H + cards.reduce((s, c) => s + c.cardH + 32, 0) + PAD;

  let y = HEADER_H;
  const cardSvgs = cards
    .map((card) => {
      const cy = y;
      y += card.cardH + 32;

      const titleY = cy + CP + 34;
      const partsY = cy + CP + card.titleH + 22;
      const descStartY =
        cy + CP + card.titleH + (card.parts ? 12 + card.partsH : 0) + 30;
      const dotsY =
        cy +
        CP +
        card.titleH +
        (card.parts ? 12 + card.partsH : 0) +
        24 +
        card.descH +
        50;

      const pax = PAD + 48 + 112;
      const txtOut = String(card.outcome || "").trim();
      const hasOut =
        txtOut &&
        !["null", "none", "n/a", "none yet", "unresolved", "pending"].includes(
          txtOut.toLowerCase()
        );

      return `
    <rect x="${PAD}" y="${cy}" width="${IW}" height="${
        card.cardH
      }" rx="20" fill="#09090b" filter="url(#shadow)"/>
    <rect x="${PAD}" y="${cy}" width="${IW}" height="${
        card.cardH
      }" rx="20" fill="url(#cardGrad)" stroke="url(#cardBorder)" stroke-width="2"/>
    <rect x="${PAD}" y="${cy}" width="8" height="${
        card.cardH
      }" rx="4" fill="#ef4444"/>
    ${textLines(card.titleLines, PAD + 48, titleY, TITLE_LH, "card-title")}
    ${
      card.parts
        ? `<text x="${
            PAD + 48
          }" y="${partsY}" class="meta" style="fill: #9ca3af; font-weight: 500">Participants: ${esc(
            card.parts
          )}</text>`
        : ""
    }
    ${textLines(card.summaryLines, PAD + 48, descStartY, DESC_LH, "card-desc")}
    ${dramaBar(card.dramaScore, PAD + 48, dotsY)}
    ${
      hasOut
        ? `<text x="${pax}" y="${
            dotsY + 6
          }" class="meta" style="fill: #f87171; font-weight: 600">Outcome: ${esc(
            txtOut
          )}</text>`
        : ""
    }
    `;
    })
    .join("\n");

  const svg = `<svg width="${W}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
  ${DEFS("#ef4444", "#f97316")}
  ${STYLE}
  <rect width="${W}" height="8" fill="#ef4444"/>
  <text x="${PAD}" y="112" class="header-title">ANI Drama Digest</text>
  <text x="${PAD}" y="152" class="header-sub">Wikipedia Administrators' Noticeboard/Incidents  •  ${esc(
    new Date().toISOString().replace("T", " ").substring(0, 16) + " UTC"
  )}</text>
  <rect x="${PAD}" y="192" width="${
    W - PAD * 2
  }" height="1" fill="url(#lineGrad)"/>
  ${cardSvgs}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateUSRImage(requests) {
  const IW = W - PAD * 2;
  const CP = 48;
  const TITLE_LH = 46;
  const DESC_LH = 36;

  const rows = requests.map((req) => {
    const titleLines = wrap(req.title, 65);
    const descLines = wrap(req.description, 100).slice(0, 2);
    const titleH = titleLines.length * TITLE_LH;
    const descH = descLines.length * DESC_LH;
    const h = CP + titleH + 16 + descH + 34 + CP;
    return { ...req, titleLines, descLines, rowH: h, titleH, descH };
  });

  const HEADER_H = 240;
  const totalH = HEADER_H + rows.reduce((s, r) => s + r.rowH + 32, 0) + PAD;

  let y = HEADER_H;
  const rowSvgs = rows
    .map((row) => {
      const ry = y;
      y += row.rowH + 32;

      const titleY = ry + CP + 34;
      const descY = ry + CP + row.titleH + 26;
      const metaY = ry + CP + row.titleH + row.descH + 52;
      const badgeX = W - PAD - 120 - 48;

      return `
    <rect x="${PAD}" y="${ry}" width="${IW}" height="${
        row.rowH
      }" rx="20" fill="#09090b" filter="url(#shadow)"/>
    <rect x="${PAD}" y="${ry}" width="${IW}" height="${
        row.rowH
      }" rx="20" fill="url(#cardGrad)" stroke="url(#cardBorder)" stroke-width="2"/>
    <rect x="${PAD}" y="${ry}" width="8" height="${
        row.rowH
      }" rx="4" fill="#eab308"/>
    ${textLines(row.titleLines, PAD + 48, titleY, TITLE_LH, "card-title")}
    ${statusBadge(row.status, badgeX, titleY)}
    ${textLines(row.descLines, PAD + 48, descY, DESC_LH, "card-desc")}
    ${
      row.difficulty
        ? `<text x="${
            PAD + 48
          }" y="${metaY}" class="meta" style="font-weight: 500">Complexity: ${esc(
            row.difficulty
          )}  •  Effort: ${esc(row.timeEstimate)}</text>`
        : ""
    }`;
    })
    .join("\n");

  const svg = `<svg width="${W}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
  ${DEFS("#eab308", "#3b82f6")}
  ${STYLE}
  <rect width="${W}" height="8" fill="#eab308"/>
  <text x="${PAD}" y="112" class="header-title">Unanswered Script Requests</text>
  <text x="${PAD}" y="152" class="header-sub">Wikipedia:User scripts/Requests  •  ${esc(
    new Date().toISOString().replace("T", " ").substring(0, 16) + " UTC"
  )}</text>
  <rect x="${PAD}" y="192" width="${
    W - PAD * 2
  }" height="1" fill="url(#lineGrad)"/>
  ${rowSvgs}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function sendToDiscord(aniBuffer, usrBuffer) {
  const payloads = [
    { buf: aniBuffer, name: "ani.png" },
    { buf: usrBuffer, name: "usr.png" },
  ];

  for (const { buf, name } of payloads) {
    const form = new FormData();
    form.append("files[0]", new Blob([buf], { type: "image/png" }), name);

    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(
        `Discord webhook failed for ${name}: ${res.status} - ${text}`
      );
    } else {
      console.log(`Sent ${name} to Discord successfully.`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function main() {
  if (!DISCORD_WEBHOOK_URL) throw new Error("Missing env: DISCORD_WEBHOOK_URL");

  console.log("Fetching Wikipedia pages with DiscussionTools...");
  const [aniThreads, usrThreads] = await Promise.all([
    fetch_talk_threads(PAGES.ANI),
    fetch_talk_threads(PAGES.USR),
  ]);

  console.log(
    `ANI: ${aniThreads.length} threads | USR: ${usrThreads.length} threads`
  );

  console.log("Asking Groq for ANI...");
  const incidents = await analyzeANI(aniThreads);

  console.log("Waiting 10 seconds to avoid rate limits...");
  await new Promise((r) => setTimeout(r, 10000));

  console.log("Asking Groq for USR...");
  const requests = await analyzeUSR(usrThreads);
  console.log(
    `Got ${incidents?.length || 0} incidents, ${requests?.length || 0} requests`
  );

  console.log("Generating images...");
  const [aniImage, usrImage] = await Promise.all([
    generateANIImage(incidents || []),
    generateUSRImage(requests || []),
  ]);

  console.log("Sending to Discord...");
  await sendToDiscord(aniImage, usrImage);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
