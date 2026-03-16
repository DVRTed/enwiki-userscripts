// {{Wikipedia:USync |repo=https://github.com/DVRTed/enwiki-userscripts |ref=refs/heads/prod |path=ArchiveBuster.js}}
/* 
ArchiveBuster (archb) (author [[User:DVRTed]])

Helps you remove archive.today |archive-url= params from citation templates interactively. 
Why? See [[Wikipedia:archive.today guidance]]. 


Contributing:
- a tip to work with the vue template variables below (because vue support for userscripts is... awful):
  if you're using VS Code/Code – OSS or any of its bazillion clones, 
  after making changes to the template strings, copy the string to a new blank file,
  set language to HTML and format the document with default formatter "HTML Language Features"
*/

/* global mw, $ */

mw.loader.using(["vue", "@wikimedia/codex"]).then((require) => {
  const { createMwApp } = require("vue");
  const { CdxDialog, CdxButton, CdxTextInput } = require("@wikimedia/codex");

  const APP_ID = "archb";
  const SCRIPT_AD = `(using [[User:DVRTed/ArchiveBuster|ArchiveBuster]])`;
  const WAYBACK_CDX_API = "https://web.archive.org/cdx/search/cdx?url=";

  // cloudflare worker proxy;
  // thx to [[User:Polygnotus]]; source code here: [[e:User:Polygnotus/Data/CloudflareWorker]]
  const PROXY_URL = `https://archive-proxy.snowmine.workers.dev/?url=${WAYBACK_CDX_API}`;

  const textarea = $("#wpTextbox1");
  if (!textarea.length) return;

  const DEBUG = true;
  const debug = (...args) => {
    if (!DEBUG) return;
    console.log(`[DEBUG] [${APP_ID}]`, ...args);
  };

  const ARCHIVE_TODAY_RE = /\barchive\.(is|ph|today|fo|li|md|vn)\b/i;
  const CITE_RE = /{{(?:cite\s+\w+|citation)\s*\|[^}]*(?:}(?!})[^}]*)*}}/gi;

  const progress_template = /*html*/ `
<div class="archb-progress">
    <span v-if="current">
        Citation
        <strong>{{ done_count + 1 }}</strong> of
        <strong>{{ relevant_citations.length }}</strong>
    </span>
    ({{ modified }} modified, {{ skipped }} skipped)
</div>
`;

  const status_template = /*html*/ `
<div class="archb-skip-row">
    ${progress_template}
    <cdx-button class="archb-skip-button" @click="handle_skip">Skip</cdx-button>

</div>
<pre class="archb-citation-preview" v-html="highlighted_wikitext"></pre>
`;

  const search_archives_template = /*html*/ `
<div v-if="search_archive_links.length" class="archb-info-row">
    <span class="archb-key">Find archive</span>

    <a v-for="[label, href] in search_archive_links" :key="label" :href="href" target="_blank" rel="noopener noreferrer"
        class="archb-search-link">
        {{ label }}
    </a>
</div>
`;

  const citation_details_template = /*html*/ `
<div class="archb-info-grid">
    <div class="archb-info-row">
        <span class="archb-key">URL status</span>
        <span> {{ current.url_status }} </span>
    </div>
    <div v-if="current.url" class="archb-info-row">
        <span class="archb-key">Original URL</span>
        <a :href="current.url" target="_blank" rel="noopener noreferrer">
            {{ current.url}}</a>
    </div>
    <div v-if="current.archive_url" class="archb-info-row">
        <span class="archb-key">Archive URL</span>
        <a :href="current.archive_url" target="_blank" rel="noopener noreferrer" class="archb-archive-link">{{ current.archive_url }}</a>
    </div>
    ${search_archives_template}
</div>
`;

  const citation_actions_template = /*html*/ `
<section class="archb-section">
    <div class="archb-options">
        <div class="archb-option archb-option-remove"
            :class="{ 'archb-option-recommended': current.url_status === 'live' }">
            <div class="archb-option-title">
                Remove archive link
                <div v-if="current.url_status === 'live'" class="archb-tag">Recommended (URL seems live)</div>
            </div>
            <div class="archb-option-desc">Use if the original URL is confirmed live.</div>
            <cdx-button :action="current.url_status === 'live' ? 'progressive' : 'default'"
                @click="handle_remove">Remove archive link</cdx-button>
        </div>

        <div class="archb-option archb-option-replace"
            :class="{ 'archb-option-recommended': current.url_status !== 'live' }">
            <div class="archb-option-title">
                Replace with a different archive
                <div v-if="current.url_status !== 'live'" class="archb-tag">Recommended (URL is {{ current.url_status
                    }})</div>
            </div>
            <div class="archb-option-desc">Paste a URL from the Wayback Machine, Ghostarchive, or Megalodon to replace
                the archive.today link.</div>
            <cdx-text-input v-model="new_url" input-type="url"
                placeholder="https://web.archive.org/web/20230101120000/https://example.com/" />
            <cdx-text-input v-model="new_date" placeholder="e.g. 15 January 2023  (leave blank to keep existing)" />
            <div style="display: flex; gap: 8px; margin-top: 4px;">
                <cdx-button weight="primary" action="progressive" :disabled="!new_url.trim()"
                    @click="handle_replace">Replace archive link</cdx-button>
                <cdx-button @click="open_auto_wayback" :disabled="!current || !current.url">Try automatic wayback</cdx-button>
            </div>
        </div>
    </div>
</section>
`;

  const auto_wayback_template = /*html*/ `
<cdx-dialog v-model:open="auto_wayback_open" title="Automatic Wayback Machine" subtitle="Find recent archives"
    :close-button-label="'Close'" class="archb-dialog archb-wayback-dialog">
    <div v-if="auto_wayback_status === 'idle'">
        <p>
            This will query the Wayback Machine CDX API via a third-party proxy to
            find available archives for:
        </p>
        <p style="word-break: break-all">
            <strong>{{ current && current.url }}</strong>
        </p>
        <p class="archb-muted">
            Using proxy: <code>${PROXY_URL.split("?")[0]}</code>
        </p>

        <div style="margin-top: 15px; display: flex; gap: 8px">
            <cdx-button action="progressive" weight="primary" @click="fetch_auto_wayback">Confirm & Fetch</cdx-button>
            <cdx-button @click="close_auto_wayback">Cancel</cdx-button>
        </div>
    </div>
    <div v-else-if="auto_wayback_status === 'loading'">
        <p>Querying CDX API...</p>
    </div>
    <div v-else-if="auto_wayback_status === 'error'">
        <p style="color: #d33">Error: {{ auto_wayback_error_msg }}</p>
        <div style="margin-top: 15px">
            <cdx-button @click="close_auto_wayback">Close</cdx-button>
        </div>
    </div>
    <div v-else-if="auto_wayback_status === 'success'">
        <div v-if="current && (current.archive_date || current.archive_url)" style="margin-bottom: 10px">
            <div v-if="current.archive_date">
                <span class="archb-key">Original archive date:</span>
                <strong>{{ current.archive_date }}</strong>
            </div>
            <div v-if="current.archive_url" style="margin-top: 4px">
                <span class="archb-key">Original archive link:</span>
                <a :href="current.archive_url" target="_blank" rel="noopener noreferrer" class="archb-archive-link">{{
                    current.archive_url }}</a>
            </div>
        </div>
        <p v-if="auto_wayback_results.length > 0">
            Found {{ auto_wayback_results.length }} archive(s). Select one to apply:
        </p>
        <p v-else>
            No archives found.
        </p>
        <div class="archb-wayback-results-list">
            <div v-for="res in auto_wayback_results" :key="res.timestamp" class="archb-wayback-result-item">
                <div class="archb-wayback-result-info">
                    <div class="archb-wayback-time">
                        {{ format_timestamp(res.timestamp, true) }}
                    </div>
                    <div class="archb-wayback-status archb-muted">
                        {{res.length}} &middot; HTTP {{ res.statuscode }}
                    </div>
                </div>
                <div class="archb-wayback-result-actions">
                    <a :href="res.url" target="_blank" rel="noopener noreferrer">Visit</a>
                    <cdx-button @click="apply_auto_wayback(res)">Apply</cdx-button>
                </div>
            </div>
        </div>
        <div style="margin-top: 15px">
            <cdx-button @click="close_auto_wayback">Close</cdx-button>
        </div>
    </div>
</cdx-dialog>
`;

  const dialog_template = /*html*/ `
<div class="archb-app">
    <cdx-dialog v-model:open="open" title="ArchiveBuster" subtitle="Manage archive.today links in this article"
        :close-button-label="'Close'" class="archb-dialog">
        <template v-if="current">
            ${status_template}
            ${citation_details_template}
            ${citation_actions_template}
        </template>
        <template v-else>
            <h3>All done!</h3>
            <h4>Please preview the changes before submitting the edit.</h4>
            ${progress_template}
        </template>
    </cdx-dialog>
    ${auto_wayback_template}
</div>
`;

  const app = createMwApp({
    components: { CdxDialog, CdxButton, CdxTextInput },

    data() {
      return {
        relevant_citations: [],
        skipped: 0,
        removed: 0,
        replaced: 0,
        new_url: "",
        new_date: "",
        open: false,
        auto_wayback_open: false,
        auto_wayback_status: "idle",
        auto_wayback_results: [],
        auto_wayback_error_msg: "",
      };
    },

    computed: {
      modified() {
        return this.removed + this.replaced;
      },
      search_archive_links() {
        if (!this.current) return [];
        const url = this.current.url;
        const links = [];
        if (url) {
          const enc = encodeURIComponent(url);
          links.push(
            ["Wayback Machine", `https://web.archive.org/web/*/${url}`],
            ["Ghostarchive", `https://ghostarchive.org/search?term=${enc}`],
            ["Megalodon", `https://megalodon.jp/?url=${enc}`],
          );
        }
        return links;
      },
      current() {
        const current = this.relevant_citations.find((c) => !c.done);
        debug("Selected current citation:", current);
        return current;
      },

      highlighted_wikitext() {
        if (!this.current) return "";

        const text = this.current.original_text;

        const escaped = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        const archive_params = [
          "archive-url",
          "archiveurl",
          "url-status",
          "url_status",
          "archive-date",
          "archivedate",
        ];

        return escaped.replace(/\|([^=|]+)=([^|}]*)/g, (_, param, value) => {
          const trimmed_param = param.trim();
          const trimmed_value = value.trim();
          const is_archive = archive_params.includes(
            trimmed_param.toLowerCase(),
          );

          if (is_archive) {
            return `|<span class="archb-archive">${trimmed_param}=${trimmed_value}</span>`;
          } else {
            return `|<span class="archb-param">${trimmed_param}</span>=<span class="archb-value">${trimmed_value}</span>`;
          }
        });
      },

      done_count() {
        return this.relevant_citations.filter((c) => c.done).length;
      },
    },
    methods: {
      find_relevant_citations(wikitext) {
        const citations = wikitext.match(CITE_RE) || [];
        debug(`Found ${citations.length} citations.`);

        const archive_today_citations = citations
          .map((text) => {
            if (!text.startsWith("{{") || !text.endsWith("}}")) return null;
            const parts = text.slice(2, -2).split("|");
            parts.shift();
            const params = {};
            for (const part of parts) {
              const eq = part.indexOf("=");
              if (eq !== -1)
                params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
            }
            const get = (...keys) =>
              keys.map((k) => params[k]).find(Boolean) ?? null;
            const archive_url = get("archive-url", "archiveurl");
            const url_status = get("url-status", "url_status") || "dead";

            return {
              done: false,
              original_text: text,
              url: get("url"),
              url_status: url_status.toLowerCase(),
              archive_url,
              archive_date: get("archive-date", "archivedate"),
              title: get("title"),
              has_archive_today:
                !!archive_url && ARCHIVE_TODAY_RE.test(archive_url),
            };
          })
          .filter((c) => c && c.has_archive_today);

        debug(
          `Found ${archive_today_citations.length} citations with archive.today link.`,
        );

        return archive_today_citations;
      },

      apply_change(old_text, new_text) {
        const val = textarea.val();
        if (!val.includes(old_text)) return false;
        textarea.val(val.replace(old_text, new_text));
        return true;
      },

      handle_remove() {
        debug("Removing archive link from current citation", this.current);
        const new_text = this.current.original_text
          .replace(
            /\|\s*(?:archive[-_]?url|archive[-_]?date|url[-_]?status)\s*=[^|}]*/gi,
            "",
          )
          .replace(/\|\s*\|\s*/g, "|")
          .replace(/\|\s*}}/g, "}}");
        debug("New text after removal:", new_text);

        if (this.apply_change(this.current.original_text, new_text)) {
          this.current.done = true;
          mw.notify("Archive link removed.", { type: "success" });
          this.removed++;
          this.update_edit_summary();
        } else {
          mw.notify(
            "Failed to apply change. The relevant wikitext may have been modified externally. Please refresh the page.",
            {
              type: "error",
            },
          );
        }
      },

      handle_skip() {
        debug("Skipping current citation", this.current);
        this.current.done = true;
        this.skipped++;
        this.new_url = "";
        this.new_date = "";
      },

      handle_replace() {
        debug("Replacing archive link from current citation", this.current);
        const url = this.new_url.trim();
        if (!url) return;

        const archive_url_regex =
          /(\|\s*(?:archive-?url|archiveurl)\s*=)[^|}]*/gi;

        const archive_date_regex =
          /(\|\s*(?:archive-?date|archivedate)\s*=)[^|}]*/gi;

        let new_text = this.current.original_text.replace(
          archive_url_regex,
          `$1 ${url}`,
        );

        if (this.new_date) {
          if (new RegExp(archive_date_regex).test(new_text)) {
            // if there's already an archive date, replace it
            new_text = new_text.replace(
              archive_date_regex,
              `$1 ${this.new_date}`,
            );
          } else {
            // otherwise, add the archive data param at the end of the template
            new_text = new_text.replace(
              /(\s*}})$/,
              ` | archive-date=${this.new_date}$1`,
            );
          }
        }

        debug("New text after replacement:", new_text);

        if (this.apply_change(this.current.original_text, new_text)) {
          this.current.done = true;
          mw.notify("Archive link replaced.", { type: "success" });
          this.replaced++;
          this.new_url = "";
          this.new_date = "";
          this.update_edit_summary();
        } else {
          mw.notify(
            "Failed to apply change. The relevant wikitext may have been modified externally. Please refresh the page.",
            {
              type: "error",
            },
          );
        }
      },

      update_edit_summary() {
        if (this.removed === 0 && this.replaced === 0) return;
        const stats = [];
        if (this.removed > 0) stats.push(`removed ${this.removed}`);
        if (this.replaced > 0) stats.push(`replaced ${this.replaced}`);

        const new_summary = `${stats.join(", ")} archive.today link(s) ${SCRIPT_AD}`;
        debug("Updating edit summary to: ", new_summary);
        $("#wpSummary").val(new_summary);
      },

      open_auto_wayback() {
        this.auto_wayback_open = true;
        this.auto_wayback_status = "idle";
        this.auto_wayback_results = [];
        this.auto_wayback_error_msg = "";
      },

      close_auto_wayback() {
        this.auto_wayback_open = false;
      },

      async fetch_auto_wayback() {
        if (!this.current || !this.current.url) return;
        this.auto_wayback_status = "loading";

        try {
          const target_url = encodeURIComponent(this.current.url);
          const cdx_args = `${target_url}&limit=50&output=json&fl=timestamp,statuscode,length`;

          let from_arg = "";
          let to_arg = "";

          if (this.current.archive_date) {
            const raw_date = this.current.archive_date.trim();
            const d = new Date(raw_date);

            if (!isNaN(d.valueOf())) {
              const from_date = new Date(d);
              from_date.setDate(from_date.getDate() - 30);
              const to_date = new Date(d);
              to_date.setDate(to_date.getDate() + 90);

              const format_wayback_date = (date) => {
                return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
              };

              from_arg = format_wayback_date(from_date);
              to_arg = format_wayback_date(to_date);
              debug("Calculated target date window", { from: from_arg, to: to_arg, original_parsed_date: d });
            } else {
              debug("Could not parse archive_date:", raw_date);
            }
          }

          let data = null;
          let valid_rows = 0;

          if (from_arg && to_arg) {
            const window_args = `${cdx_args}&from=${from_arg}&to=${to_arg}`;
            const proxy_target = `${PROXY_URL}${encodeURIComponent(window_args)}`;
            debug("Querying wayback API for snapshots around archive date:", proxy_target);

            try {
              const response = await fetch(proxy_target);
              if (response.ok) {
                data = await response.json();
                if (Array.isArray(data) && data.length > 1) {
                  valid_rows = data.slice(1).filter(row => row[1] && row[1].startsWith("2")).length;
                }
              } else {
                debug("Date window request failed with status:", response.status);
              }
            } catch (e) {
              debug("Date window fetch failed:", e);
            }
          }

          if (valid_rows === 0) {
            if (from_arg && to_arg) {
              debug("No valid 2xx archives found in date window. Falling back to recent archives...");
            }
            const proxy_target = `${PROXY_URL}${encodeURIComponent(cdx_args)}`;
            debug("Querying wayback API for recent snapshots:", proxy_target);
            const response = await fetch(proxy_target);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            data = await response.json();
          }

          if (Array.isArray(data) && data.length > 1) {
            // rm header
            data.shift();
            this.auto_wayback_results = data
              // only 2xx responses
              .filter(row => row[1] && row[1].startsWith("2"))
              .map(row => {
                const [timestamp, statuscode, length] = row;

                const formatted_length = new Intl.NumberFormat("en", {
                  style: "unit",
                  unit: "kilobyte",
                  unitDisplay: "short",
                  maximumFractionDigits: 2
                }).format(length / 1024);

                const wb_url = `https://web.archive.org/web/${timestamp}/${this.current.url}`;
                return { timestamp, statuscode, url: wb_url, length: formatted_length };
              }).reverse();
            this.auto_wayback_status = "success";
          } else {
            this.auto_wayback_status = "error";
            this.auto_wayback_error_msg = "No archives found.";
          }
        } catch (err) {
          console.error("Auto wayback error:", err);
          this.auto_wayback_status = "error";
          this.auto_wayback_error_msg = err.message || "Request failed.";
        }
      },

      apply_auto_wayback(res) {
        this.new_url = res.url;
        const parsed = this.parse_timestamp(res.timestamp);
        if (parsed) {
          const formatted = this.format_timestamp(res.timestamp);
          this.new_date = formatted;
        }
        this.close_auto_wayback();
      },

      parse_timestamp(ts) {
        if (!ts || ts.length < 8) return null;

        const year = ts.slice(0, 4);
        const month = ts.slice(4, 6);
        const day = ts.slice(6, 8);
        const hour = ts.slice(8, 10);
        const minute = ts.slice(10, 12);
        const second = ts.slice(12, 14);

        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
      },

      format_timestamp(ts, with_time = false) {
        const parsed = this.parse_timestamp(ts);
        if (!parsed) return ts;

        return new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          ...(with_time && {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }),
          timeZone: "UTC"
        }).format(parsed);
      },

      launch() {
        debug("Running the app...");
        const wikitext = textarea.val();
        const found = this.find_relevant_citations(wikitext);

        if (!found.length) {
          mw.notify("No archive.today family links found in this article.", {
            type: "info",
          });
          return;
        }

        this.relevant_citations = found;
        this.skipped = 0;
        this.new_url = "";
        this.new_date = "";
        this.open = true;
        this.removed = 0;
        this.replaced = 0;
        debug(`this.open = ${this.open} `);
      },
    },

    template: dialog_template,
  });

  const mount_point = document.createElement("div");
  mount_point.id = APP_ID;
  document.body.appendChild(mount_point);

  const vm = app.mount(mount_point);

  const portlet_link = mw.util.addPortletLink(
    "p-cactions",
    "#",
    "Manage archive.today links",
    "ca-manage-archive-today",
  );
  if (portlet_link)
    $(portlet_link).on("click", (e) => {
      e.preventDefault();
      vm.launch();
    });

  mw.util.addCSS(`
.archb-dialog {
  width: 900px !important;
  max-width: 90vw !important;
}
.archb-dialog .archb-muted {
  color: #72777d;
}
.archb-dialog .archb-section {
  margin: 10px 0;
}
.archb-dialog .archb-info-grid {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.archb-dialog .archb-info-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.9em;
  flex-wrap: wrap;
}
.archb-dialog .archb-key {
  min-width: 90px;
  color: #494949;
  font-size: 0.85em;
  flex-shrink: 0;
}
.archb-dialog .archb-archive-link {
  color: #e45a0b;
}
.archb-dialog .archb-search-link {
  display: inline-block;
  padding: 2px 9px;
  background: #e4e8f3;
  border: 1px solid #c0d1f1;
  border-radius: 10px;
  color: #3165cc;
  text-decoration: none;
}
.archb-dialog .archb-search-link:hover {
  background: #dce8fb;
}
.archb-dialog .archb-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 10px;
  font-size: 0.82em;
  font-weight: 600;
}
.archb-dialog .archb-badge-live {
  background: #d5fde5;
  color: #14532d;
}
.archb-dialog .archb-param {
  color: #7105b4;
  font-weight: 600;
}
.archb-dialog .archb-value {
  color: #026e47;
}
.archb-dialog .archb-archive {
  background-color: #fff9a0;
  border-radius: 2px;
  padding: 0 2px;
}
.archb-dialog .archb-options {
  display: flex;
  gap: 8px;
}
.archb-dialog .archb-option-remove {
  flex: 1;
}
.archb-dialog .archb-option-replace {
  flex: 2;
}
.archb-dialog .archb-option {
  border: 1px solid #eaecf0;
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.archb-dialog .archb-option-recommended {
  border-color: #3366cc;
  background: #f6f9ff;
}
.archb-dialog .archb-option-title {
  font-weight: 600;
}
.archb-dialog .archb-option-desc {
  font-size: 0.85em;
  color: #53575a;
}
.archb-dialog .archb-tag {
  display: inline-block;
  font-size: 0.78em;
  font-weight: normal;
  background: #3366cc;
  color: #fff;
  border-radius: 3px;
  padding: 1px 8px;
}
.archb-dialog .archb-skip-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.archb-wayback-dialog .cdx-dialog__body {
  max-height: 50vh;
  overflow-y: auto;
}
.archb-wayback-dialog .archb-wayback-results-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}
.archb-wayback-dialog .archb-wayback-result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #eaecf0;
  padding: 8px 12px;
  border-radius: 4px;
}
.archb-wayback-dialog .archb-wayback-result-info {
  display: flex;
  flex-direction: column;
}
.archb-wayback-dialog .archb-wayback-time {
  font-weight: bold;
}
.archb-wayback-dialog .archb-wayback-result-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.archb-wayback-dialog .archb-wayback-result-actions a {
  text-decoration: none;
  font-weight: 600;
  color: #2d61ca;
}

.skin-theme-clientpref-night .archb-dialog .archb-archive {
  background: #686532;
}
.skin-theme-clientpref-night .archb-dialog .archb-param {
  color: #be7ae8;
}
.skin-theme-clientpref-night .archb-dialog .archb-value {
  color: #07c47f;
}
.skin-theme-clientpref-night .archb-dialog .archb-option-desc {
  color: #9aa3aa;
}
.skin-theme-clientpref-night .archb-dialog .archb-option-recommended {
  background: #090e17;
}
.skin-theme-clientpref-night .archb-wayback-dialog .archb-wayback-result-item {
  border-color: #333;
}`);
});
