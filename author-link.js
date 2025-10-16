// {{Wikipedia:USync |repo=https://github.com/DVRTed/enwiki-userscripts |ref=refs/heads/prod |path=author-link.js}}
/* global mw, $ */
$(() => {
  const TEXTBOX_ID = "#wpTextbox1";

  class AuthorLink {
    constructor() {
      this.api = new mw.Api();
      this.wikitext = "";
      this.citation_data = [];
      this.completion_stats = {
        total_authors: 0,
        completed_authors: 0,

        total_citations: 0,
        skipped_citations: 0,
        completed_citations: 0,
        modified_citations: 0,
      };

      this.add_styles();
      this.add_portlet_link();
    }

    start() {
      this.wikitext = $(TEXTBOX_ID).val();
      this.process_citations();
    }

    process_citations() {
      const citation_regex = /{{(?:cite\s+\w+|citation)\s*\|[^}].*?}}/gi;
      const citations = this.wikitext.match(citation_regex) || [];

      this.citation_data = citations
        .map((citation) => ({
          citation,
          authors: this.extract_authors(citation),
          processed_authors: 0,
          is_modified: false,
        }))
        .filter((item) => item.authors.length > 0);

      if (!this.citation_data.length) {
        mw.notify("No citations with linkable authors found.", {
          type: "info",
        });
        return;
      }

      this.completion_stats.total_citations = this.citation_data.length;
      this.completion_stats.total_authors = this.citation_data.reduce(
        (sum, item) => sum + item.authors.length,
        0
      );
      this.completion_stats.completed_authors = 0;
      this.completion_stats.completed_citations = 0;
      this.completion_stats.skipped_citations = 0;

      this.show_panel();
    }

    extract_authors(citation) {
      const param_regex = /\|\s*(author|last|first)(\d*)\s*=\s*([^|}]+)/gi;
      const names = [...citation.matchAll(param_regex)].reduce((acc, match) => {
        const [, type, num_str, value] = match;
        if (value.trim().startsWith("{{")) return acc;
        const index = num_str || "1";
        acc[index] = acc[index] || {};
        acc[index][type] = value.trim();
        return acc;
      }, {});

      return Object.entries(names)
        .map(([num_str, parts]) => {
          const num = num_str === "1" ? "" : num_str;
          if (num_str === "1") {
            const regex = /\|\s*(author-?link1?|author1-?link)\s*=\s*/i;

            if (regex.test(citation)) {
              return null;
            }
          } else {
            const regex = new RegExp(
              `\\|\\s*(author-?link${num_str}|author${num_str}-?link)\\s*=\\s*`,
              "i"
            );

            if (regex.test(citation)) {
              return null;
            }
          }

          const name = (
            parts.author || `${parts.first || ""} ${parts.last || ""}`
          ).trim();
          return name.length > 2 ? { name, num } : null;
        })
        .filter(Boolean);
    }

    update_title_count() {
      const {
        completed_authors,
        total_authors,
        completed_citations,
        skipped_citations,
        total_citations,
      } = this.completion_stats;

      const status_text = `Authors: ${completed_authors}/${total_authors} | Citations: ${
        completed_citations + skipped_citations
      }/${total_citations} (✓ ${completed_citations} — ⚠ ${skipped_citations})`;

      $(".panel-header .completion-counter").remove();
      $(".panel-header").append(
        `<span class="completion-counter">${status_text}</span>`
      );

      if (completed_citations + skipped_citations >= total_citations) {
        $(".panel-content").html(
          "<div class='empty-list'>You're all done! <div><button class='generic-button close'>Close</button></div>"
        );
      }
    }

    make_moveable(panel) {
      panel.find(".panel-header").on("mousedown", function (e) {
        if ($(e.target).hasClass("close-btn")) return;
        e.preventDefault();
        let offset = panel.offset();
        let x = e.pageX - offset.left;
        let y = e.pageY - offset.top;

        $("body").css("user-select", "none");

        $(document).on("mousemove.drag", function (e) {
          e.preventDefault();
          let new_left = e.pageX - x;
          let new_top = e.pageY - y;

          const pw = panel.outerWidth();
          const ph = panel.outerHeight();
          const ww = $(window).width();
          const wh = $(window).height();

          new_left = Math.max(-(pw * 0.6), Math.min(ww - pw * 0.4, new_left));
          new_top = Math.max(0, Math.min(wh - ph * 0.4, new_top));

          panel.css({ left: new_left, top: new_top });
        });

        $(document).on("mouseup.drag", function () {
          $("body").css("user-select", "");
          $(document).off(".drag");
        });
      });
    }

    show_panel() {
      $(".author-link-panel").remove();
      const panel = $(`
      <div class="author-link-panel">
        <div class="panel-header">Author Links<span class="close close-btn">&times;</span></div>
        <div class="panel-content">
         <div class="status">Found ${this.completion_stats.total_authors} author(s) across ${this.citation_data.length} citation(s) missing author-link</div>
          <div class="citations"></div>
        </div>
       </div>`).appendTo("body");

      this.update_title_count();
      this.make_moveable(panel);
      panel.on("click", ".close", () => panel.remove());
      panel.on("click", ".select_button", (e) => this.handle_select_click(e));
      panel.on("click", ".skip-button", (e) => this.handle_skip_click(e));
      panel.on("click", ".manual-select-button", (e) =>
        this.handle_manual_click(e)
      );

      this.populate_panel(panel);
    }

    handle_select_click(e) {
      e.preventDefault();
      const select_button = $(e.currentTarget);
      const candidate_div = select_button.closest(".candidate");
      const author_div = candidate_div.closest(".author");
      const citation_div = author_div.closest(".citation");

      const title = candidate_div.data("title");
      const citation_item = this.citation_data[citation_div.data("index")];
      const author_item = citation_item.authors.find(
        (a) => a.num == author_div.data("num")
      );

      if (citation_item && author_item) {
        this.apply_link(title, citation_item, author_item);
      }

      author_div.remove();
      citation_item.processed_authors++;
      this.completion_stats.completed_authors++;

      if (!citation_item.is_modified) {
        citation_item.is_modified = true;
        this.completion_stats.modified_citations++;
        this.update_edit_summary();
      }

      if (citation_item.processed_authors >= citation_item.authors.length) {
        this.completion_stats.completed_citations++;
      }

      if (!citation_div.find(".author").length) {
        citation_div.remove();
      }
      this.update_title_count();
    }

    handle_skip_click(e) {
      e.preventDefault();
      const citation_div = $(e.currentTarget).closest(".citation");

      this.completion_stats.skipped_citations++;
      this.update_title_count();

      $(citation_div).html("");
    }

    handle_manual_click(e) {
      e.preventDefault();
      const manual_button = $(e.currentTarget);
      const manual_input = manual_button.siblings(".manual-title-input");
      const title = manual_input.val().trim();

      if (!title) {
        mw.notify("Please enter an article title", { type: "error" });
        return;
      }

      const author_div = manual_button.closest(".author");
      const citation_div = author_div.closest(".citation");

      const citation_item = this.citation_data[citation_div.data("index")];
      const author_item = citation_item.authors.find(
        (a) => a.num == author_div.data("num")
      );

      if (citation_item && author_item) {
        this.apply_link(title, citation_item, author_item);
      }

      author_div.remove();

      citation_item.processed_authors++;
      this.completion_stats.completed_authors++;

      if (!citation_item.is_modified) {
        citation_item.is_modified = true;
        this.completion_stats.modified_citations++;
        this.update_edit_summary();
      }

      if (citation_item.processed_authors >= citation_item.authors.length) {
        this.completion_stats.completed_citations++;
      }

      if (!citation_div.find(".author").length) {
        citation_div.remove();
      }
      this.update_title_count();
    }

    get_color(number) {
      const hue = (number - 1) * (360 / 20);
      const saturation = 70;
      const lightness = 50;
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    highlight_wikitext(wikitext) {
      let html = mw.html.escape(wikitext);

      html = html.replace(
        /{{(.*?)\|/,
        '{{<span class="token-template">$1</span>|'
      );

      html = html.replace(/\|\s*([^=]+)\s*=\s*([^|}]+)/g, (_, param, value) => {
        let token_param = `<span class="token-param">${param}</span>`;
        const reg_match = param.match(
          /(?:author|authorlink|author-link|first|last)(\d*)/
        );
        if (reg_match) {
          const number = parseInt(reg_match[1]);
          const style_str = `color: ${this.get_color(number ? number : 0)}`;
          token_param = `<span class="token-param-special" style="${style_str}">${param}</span>`;
        }
        const token_equals = `<span class="token-equals">=</span>`;
        const token_param_value = `<span class="token-param-value">${value.trim()}</span>`;

        return `| ${token_param}${token_equals}${token_param_value}`;
      });

      return html;
    }

    populate_panel(panel) {
      const container = panel.find(".citations");
      const total_citations = this.citation_data.length;
      this.citation_data.forEach((data, i) => {
        const citation_number = i + 1;
        const citation_div = $(`
        <div class="citation" data-index="${i}">
          <div class="citation-actions">
            <span class="citation-counter">${citation_number} of ${total_citations}</span>
            <button class="skip-button">Skip</button>
          </div>
          <div class="citation-preview">${this.highlight_wikitext(
            data.citation
          )}</div>
        </div>
      `).appendTo(container);
        data.authors.forEach((author) =>
          this.process_author(author, citation_div)
        );
      });
    }

    async process_author(author, container) {
      const author_label =
        author.num === "" ? "author 1" : `author ${author.num}`;

      const author_div = $(`
      <div class="author" data-num="${author.num}">
        <div class="author-name">${mw.html.escape(
          author.name
        )}  <span class="author-number">(${author_label})</span></div>
        <div class="loading">Searching...</div>
      </div>
    `).appendTo(container);
      try {
        const candidates = await this.search_author(author.name);
        author_div.find(".loading").remove();
        const candidates_html = candidates
          .map(
            (c) => `
            <div class="candidate" data-title="${mw.html.escape(c.title)}">
              <a href="${mw.util.getUrl(c.title)}" target="_blank">
                ${mw.html.escape(c.title)}
              </a>
              <button class="generic-button select_button">Select</button>
            </div>
          `
          )
          .join("");

        const manual_input = `
      <div class="manual-input">
        <input type="text" class="manual-title-input" placeholder="Or type the article name..." />
        <button class="generic-button manual-select-button">Apply</button>
      </div>
    `;

        author_div.append(
          candidates_html || '<div class="no-results">No matches found</div>',
          manual_input
        );
      } catch (error) {
        author_div.find(".loading").text("Search failed");
        console.error("Author search failed:", error);
      }
    }

    async search_author(name) {
      const response = await this.api.get({
        action: "query",
        list: "search",
        formatversion: 2,
        srsearch: name,
        srlimit: 5,
        srnamespace: 0,
      });
      const current_page = mw.config.get("wgTitle");
      const results = (response.query?.search || []).filter(
        (result) => result.title !== current_page
      );

      return results;
    }

    apply_link(title, citation_item, author) {
      const textbox = $(TEXTBOX_ID);
      const current_text = textbox.val();
      const param_name = `author-link${author.num}`;
      const updated_citation = citation_item.citation.replace(
        /(\s*}})$/,
        ` |${param_name}=${title}$1`
      );
      if (current_text.includes(citation_item.citation)) {
        const new_text = current_text.replace(
          citation_item.citation,
          updated_citation
        );
        textbox.val(new_text);
        this.wikitext = new_text;
        citation_item.citation = updated_citation;

        mw.notify(`Added link for ${author.name}`, { type: "success" });
      } else {
        mw.notify("Citation may have changed; link not applied.", {
          type: "error",
        });
      }
    }

    update_edit_summary() {
      const summary_input = $("#wpSummary");
      const current_summary = summary_input.val().trim();

      const link = "using [[User:DVRTed/author-link|author-link]].";
      const changes = `Modified ${this.completion_stats.modified_citations} ${
        this.completion_stats.modified_citations === 1
          ? "citation"
          : "citations"
      } ${link}`;

      let new_summary;

      if (!current_summary) {
        new_summary = changes;
      } else if (current_summary.includes(link)) {
        new_summary = current_summary.replace(
          /Modified \d+ citations?/,
          `Modified ${this.completion_stats.modified_citations} ${
            this.completion_stats.modified_citations === 1
              ? "citation"
              : "citations"
          }`
        );
      } else {
        new_summary = `${current_summary}; ${changes}`;
      }

      summary_input.val(new_summary);
    }

    add_portlet_link() {
      $(
        mw.util.addPortletLink(
          "p-cactions",
          "#",
          "Author links",
          "ca-author-links"
        )
      ).on("click", (e) => {
        e.preventDefault();
        this.start();
      });
    }

    add_styles() {
      mw.util.addCSS(`
.token-template { color: #028D02; font-weight: bold; }
.token-param { color: #5a5a5a; }
.token-param-special { font-weight: bold; text-decoration: underline; }
.token-equals { color: #7e7e7e; }
.token-param-value { color: #000000; }

.author-link-panel {
  position: fixed;
  top: 130px;
  right: 50px;
  width: 550px;
  max-height: 700px;
  background: #fff;
  border: 2px solid #a2a9b1;
  border-radius: 5px;
  z-index: 1000;
  overflow-y: auto;
}

.author-link-panel .panel-header {
  background: #eaecf0;
  cursor: move;
  padding: 10px;
  border-bottom: 1px solid #a2a9b1;
  font-weight: bold;
  position: relative;
}

.author-link-panel .completion-counter {
  font-size: 12px;
  font-weight: bold;
  background: #ffffffb3;
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid #a2a9b1;
  margin-left: 10px;
}

.author-link-panel .close-btn {
  position: absolute;
  right: 10px;
  cursor: pointer;
  font-size: 18px;
  color: #000;
}

.author-link-panel .panel-content {
  padding: 10px;
  max-height: 400px;
  overflow-y: auto;
}

.author-link-panel .manual-input {
  margin: 5px 0;
  background: #f9f9f9;
  display: flex;
  gap: 5px;
}

.author-link-panel .manual-title-input {
  flex-grow: 1;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 2px;
  font-size:12pt;
}

.author-link-panel .empty-list {
  display: flex;
  padding: 20px;
  flex-direction: column;
  text-align: center;
  font-size: 15pt;
}

.author-link-panel .empty-list button {
  font-size: 13pt;
  margin: 30px 0;
}

.author-link-panel .status {
  color: #666;
  margin-bottom: 10px;
}

.author-link-panel .citation {
  margin-bottom: 15px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 3px;
  background: #ededed;
}

.author-link-panel .citation-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding: 5px 8px;
  background: #f0f0f0;
}

.author-link-panel .citation-counter {
  font-weight: bold;
  color: #000;
  font-size: 13px;
}

.author-link-panel .skip-button {
  background: #ff6b35;
  color: white;
  border: none;
  padding: 4px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}

.author-link-panel .skip-button:hover {
  background: #ff7e4fff;
}

.author-link-panel .citation-preview {
  font-size: 13px;
  color: #666;
  font-family: monospace;
  background: #f8f9fa;
  padding: 3px;
  border-radius: 2px;
  margin-bottom: 8px;
  max-height: 80px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.author-link-panel .author-name {
  font-weight: bold;
  color: #000000;
  margin-bottom: 5px;
}

.author-link-panel .author-number {
  font-weight: normal;
  color: #666;
  font-size: 11px;
}

.author-link-panel .candidate {
  margin: 3px 0;
  padding: 5px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 2px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.author-link-panel .candidate:hover {
  background: #f5f5f5;
}

.author-link-panel .candidate a {
  color: #0645ad;
  text-decoration: none;
  flex-grow: 1;
}

.author-link-panel .candidate a:hover {
  text-decoration: underline;
}

.author-link-panel .generic-button {
  background: #0645ad;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 12px;
  margin-left: 10px;
}

.author-link-panel .generic-button:hover {
  background: #0856d3ff;
}
  
.author-link-panel .loading,
.author-link-panel .no-results {
  text-align: center;
  padding: 10px;
  color: #666;
  font-size: 12px;
}

    `);
    }
  }

  if ($(TEXTBOX_ID).length) {
    new AuthorLink();
  }
});
