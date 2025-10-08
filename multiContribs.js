// {{Wikipedia:USync |repo=https://github.com/DVRTed/enwiki-userscripts |ref=refs/heads/prod |path=multiContribs.js}}
"use strict";
/*
multiContribs.js - View contributions of multiple users
Usage:
 - [[Special:BlankPage/MultiContribs]]
 - or multiContribs option on SPI page
*/
const CONFIG = {
    RUN_PAGE: "Special:BlankPage/MultiContribs",
    RUN_NS: -1,
    USER_LIMIT: 50,
    LIMITS: [10, 25, 50, 100, 250, 500],
    NAMESPACES: [
        { id: "", name: "All namespaces" },
        { id: "0", name: "Main (articles)" },
        { id: "1", name: "Talk" },
        { id: "2", name: "User" },
        { id: "3", name: "User talk" },
        { id: "4", name: "Wikipedia" },
        { id: "5", name: "Wikipedia talk" },
        { id: "6", name: "File" },
        { id: "7", name: "File talk" },
        { id: "10", name: "Template" },
        { id: "11", name: "Template talk" },
        { id: "14", name: "Category" },
        { id: "15", name: "Category talk" },
        { id: "118", name: "Draft" },
        { id: "119", name: "Draft talk" },
    ],
    TAGS: [
        "mobile edit",
        "mobile web edit",
        "possible vandalism",
        "twinkle",
        "visualeditor",
        "mw-reverted",
        "mw-undo",
        "mw-rollback",
        "mw-new-redirect",
        "mw-manual-revert",
        "mw-blank",
        "huggle",
    ],
};
const formatTimestamp = (ts) => {
    const d = new Date(ts);
    const time = `${d.getUTCHours().toString().padStart(2, "0")}:${d
        .getUTCMinutes()
        .toString()
        .padStart(2, "0")}`;
    const date = `${d.getUTCDate()} ${d.toLocaleDateString("en-US", {
        month: "long",
        timeZone: "UTC",
    })} ${d.getUTCFullYear()}`;
    return `${time}, ${date}`;
};
const parseUsers = (input) => {
    const users = input
        .trim()
        .split("\n")
        .map((u) => {
        const title = mw.Title.newFromText(u.trim(), 2);
        return title ? title.getPrefixedText() : null;
    })
        .filter((u) => u !== null);
    return [...new Set(users)];
};
const getElement = (id) => document.getElementById(id);
const renderContribItem = (c) => {
    const time = formatTimestamp(c.timestamp);
    const newFlag = c.new
        ? '<span class="mw-tag-markers"><abbr title="This edit created a new page">N</abbr></span> '
        : "";
    const intensity = Math.min(Math.abs(c.sizediff) / 1000, 1);
    const color = c.sizediff > 0
        ? `rgb(0, ${200 - intensity * 100}, 0)`
        : `rgb(${200 - intensity * 100}, 0, 0)`;
    const weight = Math.abs(c.sizediff) >= 500 ? "bold" : "";
    const sign = c.sizediff > 0 ? "+" : "";
    const tags = c.tags
        ?.map((t) => `<span class="mw-tag" title="${t}">${t}</span>`)
        .join("") || "";
    const current = c.top
        ? '<span class="mw-changeslist-separator"></span><span class="mw-uctop">current</span>'
        : "";
    const parsed_comment = c.comment?.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (_, page, label) => `<a href="/wiki/${page}">${label || page}</a>`);
    return `<li data-mw-revid="${c.revid}">
    <span class="mw-changeslist-links">
      <span><a href="/w/index.php?title=${c.title}&diff=prev&oldid=${c.revid}">diff</a></span>
      <span><a href="/w/index.php?title=${c.title}&action=history">hist</a></span>
    </span>
    [<a href="/wiki/Special:Contributions/${c.user}" style="font-weight:bold">${c.user}</a>]
    <bdi><a href="/w/index.php?title=${c.title}&oldid=${c.revid}" class="mw-changeslist-date">${time}</a></bdi>
    <span class="mw-changeslist-separator"></span>${newFlag}
    <span class="mw-plusminus-pos mw-diff-bytes" style="color:${color};font-weight:${weight}">${sign}${c.sizediff || 0}</span>
    <span class="mw-changeslist-separator"></span>
    <bdi><a href="/wiki/${c.title}" class="mw-contributions-title">${c.title}</a></bdi>
    <span class="comment comment--without-parentheses">${parsed_comment || ""}</span>
    ${tags}${current}
  </li>`;
};
class MultiContribs {
    constructor() {
        if (mw.config.get("wgNamespaceNumber") !== CONFIG.RUN_NS ||
            mw.config.get("wgPageName").toLowerCase() !==
                CONFIG.RUN_PAGE.toLowerCase()) {
            return;
        }
        this.init();
    }
    init() {
        document.title = "Contributions of multiple users";
        this.loadStyles();
        this.renderUI();
        this.bindEvents();
        this.loadFromURL();
    }
    loadStyles() {
        mw.loader.load(["mediawiki.interface.helpers.styles", "codex-styles"]);
        const style = document.createElement("style");
        style.textContent = STYLES;
        document.head.appendChild(style);
    }
    renderUI() {
        const content = document.getElementById("content");
        if (!content)
            return;
        const limitsOpts = CONFIG.LIMITS.map((l) => `<option value="${l}">${l}</option>`).join("");
        const nsOpts = CONFIG.NAMESPACES.map((ns) => `<option value="${ns.id}">${ns.name}</option>`).join("");
        const tagOpts = `<option value="">All tags</option>` +
            CONFIG.TAGS.map((t) => `<option value="${t}">${t}</option>`).join("");
        content.innerHTML = `
<div class="vector-body">
  <details class="cdx-accordion" open>
    <summary><h3 class="cdx-accordion__header">Contributions of multiple users</h3></summary>
    <div id="mctb-form" class="cdx-card">
      <div class="cdx-card__text__description mctb-card">
        <div class="input-col1">
          <label for="users-input">Users/IPs (one per line):</label>
          <div class="cdx-text-area users-input-container">
            <textarea id="users-input" class="cdx-text-area__textarea" rows="5" placeholder="Enter usernames or IP addresses, one per line"></textarea>
          </div>
        </div>
        <div class="input-col2">
          <div class="mctb-option">
            <label for="limit-input">Results per user:</label>
            <select id="limit-input" class="cdx-select">${limitsOpts}</select>
          </div>
          <div class="mctb-option">
            <label for="namespace-input">Namespace:</label>
            <select id="namespace-input" class="cdx-select">${nsOpts}</select>
          </div>
          <div class="mctb-option">
            <label for="tag-input">Filter by tag:</label>
            <select id="tag-input" class="cdx-select">${tagOpts}</select>
          </div>
          <div class="mctb-option">
            <div class="cdx-checkbox">
              <div class="cdx-checkbox__wrapper">
                <input id="show-new-only" class="cdx-checkbox__input" type="checkbox" />
                <span class="cdx-checkbox__icon"></span>
                <div class="cdx-checkbox__label cdx-label">
                  <label for="show-new-only"><span class="cdx-label__label__text">Show only page creations</span></label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <button id="load-contribs" class="cdx-button cdx-button--action-progressive cdx-button--weight-primary">
        Load Contributions
      </button>
    </div>
  </details>
  <div id="mctb-results" class="mctb-option"></div>
</div>`;
    }
    bindEvents() {
        getElement("load-contribs")?.addEventListener("click", () => this.loadContributions());
    }
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        getElement("limit-input").value = params.get("limit") || "50";
        if (params.has("namespace"))
            getElement("namespace-input").value = params.get("namespace");
        if (params.has("tag"))
            getElement("tag-input").value = params.get("tag");
        if (params.has("new"))
            getElement("show-new-only").checked = params.get("new") === "1";
        if (params.has("users")) {
            getElement("users-input").value = params
                .get("users")
                .split(",")
                .join("\n");
            this.loadContributions();
        }
    }
    updateURL(users) {
        const params = new URLSearchParams();
        const limit = getElement("limit-input").value;
        const ns = getElement("namespace-input").value;
        const tag = getElement("tag-input").value;
        const newOnly = getElement("show-new-only").checked;
        if (users.length > 0)
            params.set("users", users.join(","));
        if (limit !== "50")
            params.set("limit", limit);
        if (ns)
            params.set("namespace", ns);
        if (tag)
            params.set("tag", tag);
        if (newOnly)
            params.set("new", "1");
        window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?" + params : ""));
    }
    async loadContributions() {
        const users = parseUsers(getElement("users-input").value);
        const results = getElement("mctb-results");
        const btn = getElement("load-contribs");
        if (!results || !btn)
            return;
        if (users.length === 0) {
            results.innerHTML =
                "<p>Please enter at least one username or IP address.</p>";
            return;
        }
        if (users.length > CONFIG.USER_LIMIT) {
            results.innerHTML = `<p>Exceeded the ${CONFIG.USER_LIMIT} users limit.</p>`;
            return;
        }
        btn.disabled = true;
        btn.textContent = "Loading...";
        results.innerHTML = "<p>Loading contributions...</p>";
        this.updateURL(users);
        try {
            const contribs = [];
            const limit = parseInt(getElement("limit-input").value);
            const ns = getElement("namespace-input").value;
            const tag = getElement("tag-input").value;
            const newOnly = getElement("show-new-only").checked;
            for (const user of users) {
                const params = {
                    action: "query",
                    list: "usercontribs",
                    ucuser: user,
                    uclimit: limit,
                    ucprop: "ids|title|timestamp|comment|size|flags|sizediff|tags",
                };
                if (ns)
                    params.ucnamespace = ns;
                if (tag)
                    params.uctag = tag;
                if (newOnly)
                    params.ucshow = "new";
                const result = await new mw.Api().get(params);
                if (result.query?.usercontribs) {
                    result.query.usercontribs.forEach((c) => {
                        c.user = user;
                        contribs.push(c);
                    });
                }
            }
            contribs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            if (contribs.length === 0) {
                results.innerHTML =
                    "<p>No contributions found with the selected filters.</p>";
            }
            else {
                results.innerHTML = `<p>Found ${contribs.length} contributions</p><ul class="mw-contributions-list">${contribs
                    .map(renderContribItem)
                    .join("")}</ul>`;
                mw.hook("wikipage.content").fire($(results));
            }
        }
        catch (error) {
            results.innerHTML = `<p>Error loading contributions: ${error instanceof Error ? error.message : String(error)}</p>`;
        }
        finally {
            btn.disabled = false;
            btn.textContent = "Load Contributions";
        }
    }
}
mw.loader.using(["mediawiki.api", "mediawiki.util"]).then(() => {
    new MultiContribs();
    // Add link to SPI pages
    if (mw.config
        .get("wgPageName")
        .startsWith("Wikipedia:Sockpuppet_investigations/")) {
        $("ul:has(span.cuEntry)").each(function () {
            const users = $(this)
                .find("span.cuEntry .plainlinks a")
                .map(function () {
                return $(this).text();
            })
                .get();
            $(this)
                .find("li")
                .last()
                .find("a")
                .first()
                .before(`<a href="/wiki/${CONFIG.RUN_PAGE}?users=${encodeURIComponent(users.join(","))}" style="font-style:italic">multiContribs</a> <b>·</b> `);
        });
    }
    mw.util.addPortletLink("p-tb", "/wiki/" + CONFIG.RUN_PAGE, "multiContribs", "t-multicontribs", "View contributions of multiple users");
});
const STYLES = `
#mctb-form { flex-direction: column; padding: 15px; background-color: #f8f9fa; }
.mctb-card { display: flex; align-items: center; width: 100%; margin: 10px 0; }
.mctb-card .input-col1 { flex: 1; }
.mctb-option { margin: 10px 0; }
#users-input { min-height: inherit; padding: 8px; background-color: #fff; font-size: 14px; border-radius: 4px; resize: vertical; }
#users-input:focus { outline: none; border-color: #0645ad; }
.users-input-container { max-width: 600px; min-height: 200px; }
#mctb-form select { width: auto; min-width: 50px; max-width: 300px; }
.mw-uctop { font-weight: bold; }
.mw-tag-markers { margin-right: 5px; color: #0645ad; font-size: 0.8em; }
.mw-tag-markers abbr { border-bottom: 1px dotted; cursor: help; }
.mw-tag { padding: 0 4px; border: 1px solid #a2a9b1; margin-left: 5px; background-color: #eef2ff; color: #0645ad; font-size: 0.85em; border-radius: 2px; }
`;
