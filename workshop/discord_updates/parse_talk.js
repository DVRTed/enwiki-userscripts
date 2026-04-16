import * as cheerio from "cheerio";

async function fetch_dt_data(page) {
  const url =
    `https://en.wikipedia.org/w/api.php?action=discussiontoolspageinfo` +
    `&format=json&page=${encodeURIComponent(page)}&prop=threaditemshtml` +
    `&threaditemsflags=excludesignatures&formatversion=2`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "TalkPageParser/1.0 (personal project -- [[en:User:DVRTed]])",
    },
  });

  try {
    const json = await res.json();
    return json.discussiontoolspageinfo.threaditemshtml;
  } catch (e) {
    console.error("Failed to parse JSON response:", e);
    return null;
  }
}

function clean_html(html) {
  if (!html) return "";
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, " ").trim();
}

function flatten_replies(replies, flat_list = []) {
  if (!replies) return flat_list;
  for (const r of replies) {
    let txt = clean_html(r.html);
    if (txt.length > 1200) {
      txt = txt.substring(0, 1200) + "...";
    }
    flat_list.push({ author: r.author, text: txt });
    if (r.replies) flatten_replies(r.replies, flat_list);
  }
  return flat_list;
}

export async function fetch_talk_threads(page) {
  const data = await fetch_dt_data(page);
  if (!data) return [];

  return data.map((item) => ({
    title: clean_html(item.html),
    comments: flatten_replies(item.replies),
  }));
}
