/* 
ArchiveBuster (archb) (author [[User:DVRTed]])

Helps you remove archive.today |archive-url= params from citation templates interactively. 
Why? See [[Wikipedia:archive.today guidance]]. 


Contributing:
- a tip to work with the vue template variables below (because vue support for userscripts is... awful):
  if you're using vscode or any of its bazzilion clones, 
  after making changes to the template strings, copy the string to a new blank file,
  set language to HTML and format the document with default formatter "HTML Language Features"
*/

/* global mw, $ */

mw.loader.using(["vue", "@wikimedia/codex"]).then((require) => {
  const { createMwApp } = require("vue");
  const { CdxDialog, CdxButton, CdxTextInput } = require("@wikimedia/codex");

  const APP_ID = "archb";
  const SCRIPT_AD = `(using [[User:DVRTed/ArchiveBuster|ArchiveBuster]])`;

  const textarea = $("#wpTextbox1");
  if (!textarea.length) return;

  const DEBUG = false;
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
        <a href="#" class="archb-archive-link">{{ current.archive_url }}</a>
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
            <cdx-button weight="primary" action="progressive" :disabled="!new_url.trim()"
                @click="handle_replace">Replace archive link</cdx-button>
        </div>
    </div>
</section>
`;

  const dialog_template = /*html*/ `
<cdx-dialog v-model:open="open" title="ArchiveBuster" subtitle="Manage archive.today links in this article" :close-button-label="'Close'"
    class="archb-dialog">
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
            /\|\s*(?:archive-?url|archive-?date|archiveurl|archivedate|url-?status)\s*=[^|}]*/gi,
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
          this.replaced++;
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
        const new_summary = `Removed ${this.removed}, replaced ${this.replaced} archive.today link(s) ${SCRIPT_AD}`;
        debug("Updating edit summary to: ", new_summary);
        $("#wpSummary").val(new_summary);
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
        debug(`this.open = ${this.open}`);
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
}`);
});
