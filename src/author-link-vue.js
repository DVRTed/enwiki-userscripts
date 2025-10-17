/*
author-link.js
| script author: [[:User:DVRTed]]
| A user script to assist in adding missing |author-link[N]= params
| to citation templates.
|
|<nowiki>
*/

/* global mw, $ */
mw.loader.using(["vue", "@wikimedia/codex"]).then((require) => {
  const TEXTBOX = $("#wpTextbox1");
  const APP_ID = "author_link_app";
  if (!TEXTBOX.length) return; // if we're not in editing mode, quit

  const { createApp } = require("vue");
  const { CdxButton, CdxTextInput, CdxDialog } = require("@wikimedia/codex");

  const VUE_APP = {
    components: { CdxButton, CdxTextInput, CdxDialog },
    data() {
      return {
        api: new mw.Api(),
        textbox: TEXTBOX,
        show_dialog: false,
        wikitext: "",
        citation_data: [],
        stats: {
          authors: {
            total: 0,
            completed: 0,
          },
          citations: {
            total: 0,
            completed: 0,
            skipped: 0,
            modified: 0,
          },
        },
      };
    },

    template: `
<cdx-dialog v-model:open="show_dialog" title="Author Links" :close-button-label="'Close'">
  <div v-if="is_all_completed" class="al-complete">
    You're all done!
    <div style="margin-top: 15px;">
      <cdx-button @click="show_dialog = false" action="destructive">Close</cdx-button>
    </div>
  </div>
  <div v-else>
    <p class="al-stats">{{ current_stat_text }}</p>

    <div>
      <div v-for="(citation, index) in citation_data" :key="index" v-show="!citation.skipped && !citation.completed"
        class="al-citation">
        <div class="al-citation-header">
          <strong>{{ index + 1 }} of {{ citation_data.length }}</strong>
          <cdx-button @click="skip_citation(citation)" action="destructive" size="small">Skip</cdx-button>
        </div>

        <div class="al-citation-preview" v-html="highlight_wikitext(citation)"></div>

        <div v-for="(author, index_2) in citation.authors" :key="index_2" class="al-author" v-show="!author.is_linked">
          <div class="al-author-name">
            {{ author.name }}
            <span class="al-author-num">(author {{ author.index || '1' }})</span>
          </div>

          <div v-if="author.loading !== false" class="al-loading">
            Searching...
          </div>
          <div v-else-if="author.error" class="al-error">Search failed</div>
          <div v-else>
            <div v-if="author.candidates && author.candidates.length">
              <div v-for="(candidate, index_3) in author.candidates" :key="index_3" class="al-candidate">
                <a :href="get_url(candidate.title)" target="_blank">{{ candidate.title }}</a>
                <cdx-button action="progressive" @click="select_candidate(citation, author, candidate.title)"
                  size="small">Select</cdx-button>
              </div>
            </div>
            <div v-else class="al-no-results">No matches found</div>

            <div class="al-manual">
              <cdx-text-input v-model="author.manual_input" placeholder="Or type the article name..."
                style="flex-grow: 1"></cdx-text-input>
              <cdx-button action="progressive" @click="author.manual_input && select_candidate(citation, author, author.manual_input)"
                :disabled="!author.manual_input" size="small">Apply</cdx-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</cdx-dialog>
      `,

    computed: {
      is_all_completed() {
        const { total, completed, skipped } = this.stats.citations;
        return completed + skipped >= total;
      },

      current_stat_text() {
        const { total, completed, skipped } = this.stats.citations;
        const processed_cites = completed + skipped;

        return (
          `Progress: ${processed_cites}/${total} citations ` +
          `(✓ ${completed} completed — ⚠ ${skipped} skipped)`
        );
      },
    },

    methods: {
      init() {
        console.log("we here!");
        this.wikitext = this.textbox.val();
        this.citation_data = this.parse_citations();

        if (!this.citation_data.length) {
          mw.notify("No citations with linkable authors found.", {
            type: "info",
          });
          return;
        }

        this.stats.citations.total = this.citation_data.length;
        this.stats.authors.total = this.citation_data.reduce(
          (sum, item) => sum + item.authors.length,
          0
        );

        this.citation_data.forEach((citation) => {
          citation.authors.forEach((author) => {
            author.loading = true;
            author.candidates = [];
            author.manual_input = "";
            this.search_author(author);
          });
        });

        this.show_dialog = true;
      },

      get_url(title) {
        return mw.util.getUrl(title);
      },
      /**
       * parse {{ citation ... }} templates
       *
       * @returns {Array<Object>} array of citation objects, each containing:
       *   - {string} text - raw citation text.
       *   - {Array<{ name: string, index: number }>} authors - array of authors with their names and index.
       *   - {number} processed_authors - number of processed authors.
       *
       *
       */
      parse_citations() {
        const regex = /{{(?:cite\s+\w+|citation)\s*\|[^}].*?}}/gi;
        const matches = this.wikitext.match(regex) || [];
        return matches
          .map((cite_text) => ({
            cite_text,
            authors: this.parse_authors(cite_text),
            processed_authors: 0,
            is_modified: false,
          }))
          .filter((item) => item.authors.length > 0);
      },

      /**
       * parse author-related params, filtering out authors with existing links
       * @param {string} cite_text
       * @returns    {Array<{ name: string, index: number }>}
       */
      parse_authors: (cite_text) => {
        // match params: author[N], last[N], and first[N]
        const regex = /\|\s*(author|last|first)(\d*)\s*=\s*([^|}]+)/gi;
        const matches = [...cite_text.matchAll(regex)];

        // create an object with authors' names w/ index
        const names_and_index = matches.reduce((acc, match) => {
          const [, type, num_str, value] = match;
          if (value.trim().startsWith("{{")) return acc;
          const index = num_str || "1";
          acc[index] = acc[index] || {};
          acc[index][type] = value.trim();
          return acc;
        }, {});

        // filter out authors that already have author-link[N] param
        const relevant_authors = Object.entries(names_and_index)
          .map(([num_str, parts]) => {
            const num = num_str === "1" ? "" : num_str;

            if (num_str === "1") {
              // try both variants with and without the number 1
              // e.g. match both `author-link=` and `author-link1=`
              const regex = /\|\s*(author-?link1?|author1-?link)\s*=\s*/i;

              if (regex.test(cite_text)) return null;
            } else {
              // match author's index against author-linkN= param
              const regex_str = `\\|\\s*(author-?link${num_str}|author${num_str}-?link)\\s*=\\s*`;

              const regex = new RegExp(regex_str, "i");
              if (regex.test(cite_text)) return null;
            }

            // author `name` to search articles for consists of:
            // the `author[N]=` param if it's set;
            // OTHERWISE
            // join `first[N]=` and `last[N]=` params
            const name = (
              parts.author || `${parts.first || ""} ${parts.last || ""}`
            ).trim();

            const author_data = {
              name,
              index: num,
              loading: false,
            };
            return name.length > 1 ? author_data : null;
          })
          .filter(Boolean);

        return relevant_authors;
      },

      async search_author(author) {
        try {
          const response = await this.api.get({
            action: "query",
            list: "search",
            formatversion: 2,
            srsearch: author.name,
            srlimit: 5,
            srnamespace: 0,
          });
          const current_page = mw.config.get("wgTitle");
          author.candidates = (response.query?.search || []).filter(
            (result) => result.title !== current_page
          );
          author.loading = false;
        } catch (error) {
          author.error = true;
          author.loading = false;
          console.error(error);
        }
      },

      select_candidate(citation, author, title) {
        const is_newly_linked = !author.is_linked;

        this.apply_link(title, citation, author);

        if (is_newly_linked) {
          citation.processed_authors++;
          this.stats.authors.completed++;
          author.is_linked = true;
        }

        if (!citation.is_modified) {
          citation.is_modified = true;
          this.stats.citations.modified++;
          this.update_edit_summary();
        }

        if (citation.processed_authors >= citation.authors.length) {
          this.stats.citations.completed++;
          citation.completed = true;
        }
      },

      skip_citation(citation) {
        this.stats.citations.skipped++;
        citation.skipped = true;
      },

      apply_link(title, citation, author) {
        const current_text = this.textbox.val();
        const param_name = `author-link${author.index}`;

        let regex_str = `\\|\\s*(author-?link${author.index}|author${author.index}-?link)\\s*=[^|}]+`;

        const replace_regex = new RegExp(regex_str, "i");
        let updated_citation;

        if (replace_regex.test(citation.cite_text)) {
          updated_citation = citation.cite_text.replace(
            replace_regex,
            `| ${param_name}=${title}`
          );
        } else {
          updated_citation = citation.cite_text.replace(
            /(\s*}})$/,
            ` |${param_name}=${title}$1`
          );
        }

        // ensure the textarea isn't modified externally after opening the dialog
        if (current_text.includes(citation.cite_text)) {
          const new_text = current_text.replace(
            citation.cite_text,
            updated_citation
          );
          this.textbox.val(new_text);
          this.wikitext = new_text;
          citation.cite_text = updated_citation;
          mw.notify(`Link for ${author.name} set to "${title}"`, {
            type: "success",
          });
        } else {
          mw.notify("Citation may have changed; link not applied.", {
            type: "error",
          });
        }
      },

      update_edit_summary() {
        const summary_input = $("#wpSummary");
        const current_summary = summary_input.val().trim();
        const link = "using [[User:DVRTed/author-link|author-link]].";
        const changes = `Modified ${this.stats.citations.modified} ${
          this.stats.citations.modified === 1 ? "citation" : "citations"
        } ${link}`;

        let new_summary;
        if (!current_summary) {
          new_summary = changes;
        } else if (current_summary.includes(link)) {
          new_summary = current_summary.replace(
            /Modified \d+ citations?/,
            `Modified ${this.stats.citations.modified} ${
              this.stats.citations.modified === 1 ? "citation" : "citations"
            }`
          );
        } else {
          new_summary = `${current_summary}; ${changes}`;
        }
        summary_input.val(new_summary);
      },

      get_color(number) {
        const hue = (number - 1) * (360 / 20);
        return `hsl(${hue}, 70%, 50%)`;
      },

      highlight_wikitext(citation) {
        const cleaned_text = mw.html.escape(citation.cite_text);
        let html = cleaned_text.replace(
          /{{(.*?)\|/,
          // bold the template name
          '{{<span style="color:#028D02;font-weight:bold">$1</span>|'
        );

        html = html.replace(
          /\|\s*([^=]+)\s*=\s*([^|}]+)/g,
          (_, param, value) => {
            const reg_match = param.match(/(?:author|first|last)([\s\d]*)$/);

            if (!reg_match) {
              return (
                `| <span style="color:#5a5a5a;font-weight:bold">${param}</span>` +
                `<span style="color:#7e7e7e">=</span>` +
                `<span>${value.trim()}</span>`
              );
            }

            const author_index = reg_match[1] || "1";
            const index_color = this.get_color(parseInt(author_index));
            const style = `color:${index_color};font-weight:bold`;

            return (
              `| <span style="${style}">${param}</span>` +
              `<span style="color:#7e7e7e">=</span>` +
              `<span>${value.trim()}</span>`
            );
          }
        );
        return html;
      },
    },
  };

  mw.util.addCSS(`
    .al-stats { color: #666; margin-bottom: 10px; }
    .al-citation { margin-bottom: 20px; padding: 10px; background: #F1F1F1; border-radius: 3px; }
    .al-citation-header { padding: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .al-citation-preview { background: #f8f9fa; padding: 8px; margin-bottom: 15px; font-family: monospace; font-size: 14px; max-height: 100px; overflow-y: auto; }
    .al-author { margin-bottom: 15px; padding: 10px;  background: #fff; }
    .al-author-name { font-weight: bold; margin-bottom: 8px; }
    .al-author-num { color: #666; font-weight: normal; font-size: 11px; }
    .al-loading, .al-error, .al-no-results { text-align: center; color: #666; padding: 10px; }
    .al-candidate { margin: 5px 0; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; }
    .al-candidate a { color: #0645ad; text-decoration: none; flex-grow: 1; }
    .al-manual { margin-top: 8px; display: flex; gap: 5px; }
    .al-manual input { flex-grow: 1; padding: 6px; border: 1px solid #ddd; border-radius: 2px; }
    .al-complete { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; font-size: 15pt; }
  `);

  let current_app;
  function mount_fresh_app() {
    if (current_app) {
      current_app.unmount();
    }

    document.getElementById(APP_ID)?.remove();

    const container = document.createElement("div");
    container.id = APP_ID;
    document.body.appendChild(container);
    const fresh_app = createApp(VUE_APP);
    current_app = fresh_app;

    const vm = fresh_app.mount("#" + APP_ID);
    vm.$watch("show_dialog", (open) => {
      if (!open) {
        current_app.unmount();
        current_app = null;
        document.getElementById(APP_ID)?.remove();
      }
    });
    vm.init();
  }

  const portlet_link = mw.util.addPortletLink(
    "p-cactions",
    "#",
    "Author links",
    "ca-author-links"
  );
  $(portlet_link).on("click", (e) => {
    e.preventDefault();
    mount_fresh_app();
  });
});
