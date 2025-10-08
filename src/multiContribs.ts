/*
multiContribs.js
- allows viewing contributions of multiple users in one page: [[Special:BlankPage/MultiContribs]];
- adds a link to "multiContribs" tool in SPI pages;
*/

interface Namespace {
  id: string;
  name: string;
}

interface Contribution {
  revid: number;
  title: string;
  timestamp: string;
  comment?: string;
  size: number;
  sizediff: number;
  tags?: string[];
  user: string;
  new?: boolean;
  top?: boolean;
}

interface UserContribsParams {
  action: string;
  list: string;
  ucuser: string;
  uclimit: number;
  ucprop: string;
  ucnamespace?: string;
  uctag?: string;
  ucshow?: string;
}

interface ApiResponse {
  query: {
    usercontribs: Contribution[];
  };
}

mw.loader.using(["mediawiki.api", "mediawiki.util"]).then(() => {
  const RUN_PAGE = "Special:BlankPage/MultiContribs";
  const RUN_NS = -1;

  class MultiContribs {
    content_div;
    namespaces: Namespace[] = [
      { id: "", name: "All namespaces" },
      { id: "0", name: "Main (articles)" },
      { id: "1", name: "Talk" },
      { id: "2", name: "User" },
      { id: "3", name: "User talk" },
      { id: "4", name: "Wikipedia" },
      { id: "5", name: "Wikipedia talk" },
      { id: "6", name: "File" },
      { id: "7", name: "File talk" },
      { id: "8", name: "MediaWiki" },
      { id: "9", name: "MediaWiki talk" },
      { id: "10", name: "Template" },
      { id: "11", name: "Template talk" },
      { id: "12", name: "Help" },
      { id: "13", name: "Help talk" },
      { id: "14", name: "Category" },
      { id: "15", name: "Category talk" },
      { id: "100", name: "Portal" },
      { id: "101", name: "Portal talk" },
      { id: "118", name: "Draft" },
      { id: "119", name: "Draft talk" },
      { id: "828", name: "Module" },
      { id: "829", name: "Module talk" },
    ];
    number_of_users_limit = 50;
    limits = [10, 25, 50, 100, 250, 500];
    available_tags = [
      "mobile edit",
      "mobile web edit",
      "possible vandalism",
      "twinkle",
      "visualeditor",
      "mw-reverted",
      "mw-undo",
      "advanced mobile edit",
      "mw-replace",
      "visualeditor-wikitext",
      "mw-rollback",
      "mw-new-redirect",
      "mobile app edit",
      "mw-manual-revert",
      "mw-blank",
      "huggle",
      "mw-changed-redirect-target",
      "mw-removed-redirect",
    ];

    constructor() {
      if (
        mw.config.get("wgNamespaceNumber") !== RUN_NS ||
        mw.config.get("wgPageName").toLowerCase() !== RUN_PAGE.toLowerCase()
      ) {
        return;
      }

      this.content_div = document.getElementById("content");
      this.init();
    }

    init(): void {
      document.title = "Contributions of multiple users";
      this.load_styles();
      this.render_header();
      this.bind_events();
      this.load_from_url();
    }

    load_styles(): void {
      mw.loader.load(["mediawiki.interface.helpers.styles", "codex-styles"]);

      const style = document.createElement("style");
      style.textContent = `
  #mctb-form {
    flex-direction: column;
    padding: 15px;
    background-color: #f8f9fa;
  }

  .mctb-card {
    display: flex;
    align-items: center;
    width: 100%;
    margin: 10px 0;
  }

  .mctb-card .input-col1 {
    flex: 1;
  }

  .mctb-option {
    margin: 10px 0;
  }

  #users-input {
    min-height: inherit;
    padding: 8px;
    background-color: #fff;
    font-size: 14px;
    border-radius: 4px;
    resize: vertical;
  }

  #users-input:focus {
    outline: none;
    border-color: #0645ad;
  }

  .users-input-container {
    max-width: 600px;
    min-height: 200px;
  }

  #mctb-form select {
    width: auto;
    min-width: 50px;
    max-width: 300px;
  }

  .mw-uctop {
    font-weight: bold;
  }

  .mw-tag-markers {
    margin-right: 5px;
    color: #0645ad;
    font-size: 0.8em;
  }

  .mw-tag-markers abbr {
    border-bottom: 1px dotted;
    cursor: help;
  }

  .mw-tag {
    padding: 0 4px;
    border: 1px solid #a2a9b1;
    margin-left: 5px;
    background-color: #eef2ff;
    color: #0645ad;
    font-size: 0.85em;
    border-radius: 2px;
  }
      `;
      document.head.appendChild(style);
    }

    render_header(): void {
      if (!this.content_div) {
        console.error("Couldn't find the content div.");
        return;
      }
      this.content_div.innerHTML = `
<div class="vector-body">
  <details class="cdx-accordion" open>
    <summary>
      <h3 class="cdx-accordion__header">Contributions of multiple users</h3>
    </summary>
    <div id="mctb-form" class="cdx-card">
      <div class="cdx-card__text__description mctb-card">
        <div class="input-col1">
          <label for="users-input">Users/IPs (one per line):</label><br />
          <div class="cdx-text-area users-input-container">
            <textarea
              id="users-input"
              class="cdx-text-area__textarea"
              rows="5"
              cols="50"
              placeholder="Enter usernames or IP addresses, one per line"
            ></textarea>
          </div>
        </div>
        <div class="input-col2">
          <div class="mctb-option">
            <label for="limit-input">Results per user:</label>
            <select id="limit-input" class="cdx-select">
              ${this.limits
                .map(
                  (limit) => `
              <option value="${limit}">${limit}</option>
              `
                )
                .join("")}
            </select>
          </div>

          <div class="mctb-option">
            <label for="namespace-input">Namespace:</label>
            <select id="namespace-input" class="cdx-select">
              ${this.namespaces
                .map(
                  (ns) => `
              <option value="${ns.id}">${ns.name}</option>
              `
                )
                .join("")}
            </select>
          </div>

          <div class="mctb-option">
            <label for="tag-input">Filter by tag:</label>
            <select id="tag-input" class="cdx-select">
              <option value="">All tags</option>
              ${this.available_tags
                .map(
                  (tag) => `
              <option value="${tag}">${tag}</option>
              `
                )
                .join("")}
            </select>
          </div>

          <div class="mctb-option">
            <div class="cdx-checkbox">
              <div class="cdx-checkbox__wrapper">
                <input
                  id="show-new-only"
                  class="cdx-checkbox__input"
                  type="checkbox"
                />
                <span class="cdx-checkbox__icon"></span>
                <div class="cdx-checkbox__label cdx-label">
                  <label for="show-new-only" class="cdx-label__label">
                    <span class="cdx-label__label__text">
                      Show only page creations
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <button
        id="load-contribs"
        class="cdx-button cdx-button--action-progressive cdx-button--weight-primary"
      >
        Load Contributions
      </button>
    </div>
  </details>
  <div id="mctb-results" class="mctb-option"></div>
</div>
      `;
    }

    bind_events(): void {
      document
        .getElementById("load-contribs")
        ?.addEventListener("click", () => {
          this.load_contributions();
        });
    }

    get_input_by_id(id: string): HTMLInputElement {
      return document.getElementById(id) as HTMLInputElement;
    }

    load_from_url(): void {
      const params = new URLSearchParams(window.location.search);

      this.get_input_by_id("limit-input").value = "50";

      if (params.has("limit")) {
        const limit = params.get("limit");
        const is_valid_limit = limit && this.limits.includes(parseInt(limit));

        this.get_input_by_id("limit-input").value = is_valid_limit
          ? limit
          : "50";
      }

      if (params.has("namespace")) {
        const ns = params.get("namespace");
        const valid_namespaces = this.namespaces.map((ns) => ns.id);
        const is_valid_namespace = ns && valid_namespaces.includes(ns);

        this.get_input_by_id("namespace-input").value = is_valid_namespace
          ? ns
          : "";
      }

      if (params.has("tag")) {
        const tag = params.get("tag");
        if (tag) this.get_input_by_id("tag-input").value = tag;
      }

      if (params.has("new")) {
        const new_param = params.get("new");
        this.get_input_by_id("show-new-only").checked =
          new_param === "1" || new_param === "true";
      }

      if (params.has("users")) {
        const users = params.get("users");
        if (users)
          this.get_input_by_id("users-input").value = users
            .split(",")
            .join("\n");
        this.load_contributions();
      }
    }

    update_url(): void {
      const users = this.get_input_by_id("users-input")
        .value.trim()
        .split("\n")
        .filter((u) => u.trim());
      const limit = this.get_input_by_id("limit-input").value;
      const namespace = this.get_input_by_id("namespace-input").value;
      const tag = this.get_input_by_id("tag-input").value;
      const show_new_only = this.get_input_by_id("show-new-only").checked;

      const params = new URLSearchParams();

      if (users.length > 0) {
        params.set("users", users.join(","));
      }

      if (limit !== "50") {
        params.set("limit", limit);
      }

      if (namespace !== "") {
        params.set("namespace", namespace);
      }

      if (tag !== "") {
        params.set("tag", tag);
      }

      if (show_new_only) {
        params.set("new", "1");
      }

      const new_url =
        window.location.pathname +
        (params.toString() ? "?" + params.toString() : "");
      window.history.replaceState({}, "", new_url);
    }

    async load_contributions(): Promise<void> {
      const raw_users = this.get_input_by_id("users-input")
        .value.trim()
        .split("\n")
        .map((u) => {
          if (!u.trim()) return null;
          const parse_title = mw.Title.newFromText(u, 2);
          return parse_title ? parse_title.getPrefixedText() : null;
        })
        .filter((u): u is string => u !== null);

      const users = [...new Set(raw_users)];
      const results_div = document.getElementById("mctb-results");
      const load_button = this.get_input_by_id("load-contribs");

      if (!results_div || !load_button) {
        console.error("Cannot find the result div and/or the `load` button");
        return;
      }
      if (users.length === 0) {
        results_div.innerHTML =
          "<p>Please enter at least one username or IP address.</p>";
        return;
      }

      if (users.length > this.number_of_users_limit) {
        results_div.innerHTML = `<p>Exceeded the ${this.number_of_users_limit} users limit.</p>`;
        return;
      }

      load_button.disabled = true;
      const original_text = load_button.textContent;
      load_button.textContent = "Loading...";

      this.update_url();

      const limit = parseInt(this.get_input_by_id("limit-input").value);
      const namespace = this.get_input_by_id("namespace-input").value;
      const tag = this.get_input_by_id("tag-input").value;
      const show_new_only = this.get_input_by_id("show-new-only").checked;

      results_div.innerHTML = "<p>Loading contributions...</p>";

      try {
        const all_contribs: Contribution[] = [];

        for (const user of users) {
          const api = new mw.Api();
          const params: UserContribsParams = {
            action: "query",
            list: "usercontribs",
            ucuser: user.trim(),
            uclimit: limit,
            ucprop: "ids|title|timestamp|comment|size|flags|sizediff|tags",
          };

          if (namespace !== "") {
            params.ucnamespace = namespace;
          }

          if (tag !== "") {
            params.uctag = tag;
          }

          if (show_new_only) {
            params.ucshow = "new";
          }

          const result = (await api.get(params)) as ApiResponse;

          if (result.query.usercontribs) {
            result.query.usercontribs.forEach((contrib) => {
              contrib.user = user.trim();
              all_contribs.push(contrib);
            });
          }
        }

        all_contribs.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        this.render_results(all_contribs, results_div);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results_div.innerHTML =
          "<p>Error loading contributions: " + errorMessage + "</p>";
      } finally {
        load_button.disabled = false;
        load_button.textContent = original_text;
      }
    }

    render_results(contribs: Contribution[], results_div: HTMLElement): void {
      if (contribs.length === 0) {
        results_div.innerHTML =
          "<p>No contributions found with the selected filters.</p>";
        return;
      }

      let html = `<p>Found ${contribs.length} contributions</p>
      <ul class="mw-contributions-list">`;

      contribs.forEach((contrib) => {
        const full_date_time = this.format_timestamp(contrib.timestamp);

        const flags: string[] = [];
        if ("new" in contrib)
          flags.push('<abbr title="This edit created a new page">N</abbr>');

        const flags_html =
          flags.length > 0
            ? `<span class="mw-tag-markers">${flags.join(" ")}</span> `
            : "";

        let tags_html = "";
        if (contrib.tags && contrib.tags.length > 0) {
          const tag_spans = contrib.tags.map(
            (tag) => `<span class="mw-tag" title="${tag}">${tag}</span>`
          );
          tags_html = tag_spans.join("");
        }

        html += `<li data-mw-revid="${contrib.revid}">`;

        html += `
            <span class="mw-changeslist-links">
            <span><a href="/w/index.php?title=${contrib.title}&diff=prev&oldid=${contrib.revid}" 
                     class="mw-changeslist-diff" title="${contrib.title}">diff</a></span>
            <span><a href="/w/index.php?title=${contrib.title}&action=history" 
                     class="mw-changeslist-history" title="${contrib.title}">hist</a></span>
          </span>
        
        `;

        html += `[<a href="/wiki/Special:Contributions/${contrib.user}" style="font-weight: bold;">${contrib.user}</a>]`;

        html += `
        <bdi>
            <a href="/w/index.php?title=${contrib.title}&oldid=${contrib.revid}" 
               class="mw-changeslist-date" title="${contrib.title}">${full_date_time}</a>
        </bdi>
        `;

        html += `<span class="mw-changeslist-separator"></span>${flags_html}`;

        const intensity = Math.min(Math.abs(contrib.sizediff) / 1000, 1);
        const green_intensity = Math.floor(200 - intensity * 100);
        const red_intensity = Math.floor(200 - intensity * 100);

        const fnt_color =
          contrib.sizediff > 0
            ? `rgb(0, ${green_intensity}, 0)`
            : `rgb(${red_intensity}, 0, 0)`;

        const fnt_weight =
          contrib.sizediff >= 500
            ? "bold"
            : contrib.sizediff <= -500
            ? "bold"
            : "";

        const plus_sign = contrib.sizediff > 0 ? "+" : "";

        html += `
    <span dir="ltr" class="mw-plusminus-pos mw-diff-bytes" title="${
      contrib.size
    } bytes after change" style="color: ${fnt_color}; font-weight: ${fnt_weight}">${
          plus_sign + (contrib.sizediff || 0)
        }</span>
    <span class="mw-changeslist-separator"></span>`;

        html += `
        <bdi>
            <a href="/wiki/${contrib.title}" 
               class="mw-contributions-title" title="${contrib.title}">${
          contrib.title
        }</a>
          </bdi>
          <span class="comment comment--without-parentheses">${
            contrib.comment || ""
          }</span>
        `;

        if (tags_html) {
          html += tags_html;
        }

        if ("top" in contrib) {
          html += `
            <span class="mw-changeslist-separator"></span>
            <span class="mw-uctop">current</span>
            `;
        }

        html += `</li>`;
      });

      html += "</ul>";
      results_div.innerHTML = html;
      mw.hook("wikipage.content").fire($(results_div));
    }

    format_timestamp(timestamp: string): string {
      const date = new Date(timestamp);
      const hours = date.getUTCHours().toString().padStart(2, "0");
      const minutes = date.getUTCMinutes().toString().padStart(2, "0");
      const day = date.getUTCDate();
      const month = date.toLocaleDateString("en-US", {
        month: "long",
        timeZone: "UTC",
      });
      const year = date.getUTCFullYear();
      return `${hours}:${minutes}, ${day} ${month} ${year}`;
    }
  }

  new MultiContribs();

  // multiContribs on suspected sockpuppets' lists
  if (
    mw.config
      .get("wgPageName")
      .startsWith("Wikipedia:Sockpuppet_investigations/")
  ) {
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
        .before(
          `<a href="/wiki/${RUN_PAGE}?users=${encodeURIComponent(
            users.join(",")
          )}" style="font-style: italic;">multiContribs</a> <b>·</b> `
        );
    });
  }

  mw.util.addPortletLink(
    "p-tb",
    "/wiki/" + RUN_PAGE,
    "multiContribs",
    "t-multicontribs",
    "View contributions of multiple users"
  );
});
