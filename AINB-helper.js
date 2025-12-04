// {{Wikipedia:USync |repo=https://github.com/DVRTed/enwiki-userscripts |ref=refs/heads/prod |path=AINB-helper.js}}
// Userscript to help generating tracking subpages at [[WP:AINB]]

/* globals mw, $ */
// <nowiki>
$(async () => {
  const APP_ID = "ainb-helper";
  const APP_AD = "(using [[User:DVRTed/AINB-helper|AINB-helper]])";

  const DEBUG_MODE = true;
  const DEBUG_PAGE = "User:DVRTed/sandbox2";

  const require = mw.loader.require;
  await mw.loader.using([
    "vue",
    "@wikimedia/codex",
    "mediawiki.api",
    "mediawiki.util",
  ]);
  const api = new mw.Api();
  const Vue = require("vue");

  let current_app = null;

  // reuseable function to create and mount the app
  // that handles dups
  function create_app(App) {
    const { createMwApp } = Vue;

    if (current_app) {
      current_app.unmount();
    }
    current_app = null;
    document.getElementById(APP_ID)?.remove();

    const mount_point = document.createElement("div");
    mount_point.id = APP_ID;
    document.body.appendChild(mount_point);

    const app = createMwApp(App);
    app.mount(mount_point);
    current_app = app;
  }

  function create_main_app() {
    const { nextTick } = Vue;
    const {
      CdxButton,
      CdxTextInput,
      CdxDialog,
      CdxAccordion,
      CdxCheckbox,
      CdxProgressBar,
    } = require("@wikimedia/codex");

    create_app({
      template: generate_main_template(),
      components: {
        CdxButton,
        CdxTextInput,
        CdxDialog,
        CdxAccordion,
        CdxCheckbox,
        CdxProgressBar,
      },

      data() {
        return {
          is_open: true,
          step: 1,
          username: "",
          normalized_username: "",
          loading: false,
          progress: 0,
          edit_count: 0,
          error: "",
          article_groups: [],
          creating: false,
          create_error: "",
          target_page_title: "",
          target_page_url: "",
          viewing_diff_edit: null,
        };
      },

      computed: {
        dialog_title() {
          if (this.step === 1) return "Generate tracking subpage for AINB";
          if (this.step === 2) return "Select diffs to include";
          return "Page Created";
        },
        dialog_subtitle() {
          if (this.step === 2) {
            return `User:${this.normalized_username} · ${this.edit_count} edits (${this.article_groups.length} articles)`;
          }
          return "";
        },
        total_selected_diffs() {
          return this.article_groups.reduce(
            (sum, group) => sum + group.selected_count,
            0
          );
        },
        all_selected() {
          return (
            this.article_groups.length > 0 &&
            this.article_groups.every((group) => group.all_selected)
          );
        },
        some_selected() {
          return this.article_groups.some(
            (group) => group.some_selected || group.all_selected
          );
        },
        current_date() {
          return new Date().toISOString().split("T")[0];
        },
        diff_dialog_open: {
          get() {
            return !!this.viewing_diff_edit;
          },
          set(val) {
            if (!val) this.viewing_diff_edit = null;
          },
        },
      },
      methods: {
        handle_accordion_expand(group, index) {
          if (group.expanded) {
            nextTick(() => {
              const $content = $(`.ainb-article-card:eq(${index}) .ainb-diffs`);
              if ($content.length) {
                mw.hook("wikipage.content").fire($content);
              }
            });
          }
        },
        handle_dialog_close() {
          if (current_app) {
            current_app.unmount();
            current_app = null;
            document.getElementById(APP_ID)?.remove();
          }
        },

        update_group_selection(group) {
          const selected = group.edits.filter((edit) => edit.selected).length;
          group.selected_count = selected;
          group.all_selected = selected === group.edits.length;
          group.some_selected = selected > 0 && selected < group.edits.length;
        },
        toggle_article(group) {
          const new_value = !group.all_selected;
          group.edits.forEach((edit) => (edit.selected = new_value));
          this.update_group_selection(group);
        },
        toggle_all() {
          const new_value = !this.all_selected;
          this.article_groups.forEach((group) => {
            group.edits.forEach((edit) => (edit.selected = new_value));
            this.update_group_selection(group);
          });
        },
        async fetch_contributions() {
          this.loading = true;
          this.error = "";
          this.progress = 0;

          try {
            const edits = [];
            let continuation = null;

            // check for users w/ too many edits
            const user_info = await api.get({
              action: "query",
              list: "users",
              ususers: this.username,
              usprop: "editcount",
            });
            const edit_count = user_info.query.users[0].editcount;

            if (edit_count > 20000) {
              if (
                !confirm(
                  `User has over 20k edits (${edit_count}). Are you sure you want to continue?`
                )
              ) {
                this.error = "Manually cancelled: User has too many edits.";
                return;
              }
            } else if (!edit_count) {
              this.error =
                "No edits found in the timeframe. Note: the username is case-sensitive.";
              return;
            }

            this.normalized_username = user_info.query.users[0].name;

            do {
              const params = {
                action: "query",
                list: "usercontribs",
                ucnamespace: 0,
                ucuser: this.normalized_username,
                ucend: "2022-12-01T00:00:00Z", // release of ChatGPT
                uclimit: "max",
                ucprop: "ids|title|timestamp|comment|sizediff|tags",
                ucdir: "older",
                ...continuation,
              };

              const response = await api.get(params);
              if (response.error) throw new Error(response.error.info);

              edits.push(...response.query.usercontribs);
              this.progress = edits.length;
              continuation = response.continue;
            } while (continuation);

            const valid_edits = edits.filter(
              (edit) => !edit.tags?.includes("mw-reverted")
            );
            const groups = {};

            valid_edits.forEach((edit) => {
              if (!groups[edit.title]) {
                groups[edit.title] = {
                  title: edit.title,
                  edits: [],
                  all_selected: false,
                  some_selected: false,
                  selected_count: 0,
                  expanded: false,
                };
              }
              groups[edit.title].edits.push({
                ...edit,
                selected: false,
                diff_loading: false,
                diff_content: "",
              });
            });

            this.edit_count = valid_edits.length;

            this.article_groups = Object.values(groups);

            this.article_groups.forEach((group) =>
              this.update_group_selection(group)
            );

            if (this.article_groups.length === 0) {
              this.error = "No contributions found in the specified period.";
            } else {
              this.step = 2;
              const page_title = DEBUG_MODE
                ? DEBUG_PAGE
                : `Wikipedia:WikiProject AI Cleanup/Noticeboard/${this.current_date} ${this.normalized_username}`;
              this.target_page_title = page_title;
              this.target_page_url = mw.util.getUrl(page_title);
            }
          } catch (error) {
            this.error = "Error fetching contributions: " + error.message;
            console.error(error);
          } finally {
            this.loading = false;
          }
        },
        show_diff_popup(edit) {
          this.viewing_diff_edit = edit;
          this.load_diff(edit);
        },
        close_diff_popup() {
          this.viewing_diff_edit = null;
        },
        async load_diff(edit) {
          if (edit.diff_content || edit.diff_loading) return;

          edit.diff_loading = true;
          try {
            const response = await api.get({
              action: "compare",
              fromrev: edit.revid,
              torelative: "prev",
              prop: "diff",
            });
            if (response.compare?.["*"]) {
              edit.diff_content = `<table class="diff">${response.compare["*"]}</table>`;
            } else {
              edit.diff_content = "<p>Could not load diff.</p>";
            }
          } catch (error) {
            console.error("Error loading diff:", error);
            edit.diff_content =
              "<p>Error loading diff: " + error.message + "</p>";
          } finally {
            edit.diff_loading = false;
          }
        },
        async generate_report() {
          const selected_groups = this.article_groups
            .map((group) => ({
              ...group,
              edits: group.edits.filter((edit) => edit.selected),
            }))
            .filter((group) => group.edits.length > 0);

          let wikitext = `Relevant report and discussion may be viewable on the talk page.\n\n== Tracking list ==\n{{AIC article list|\n`;

          selected_groups.forEach((group) => {
            const links = group.edits
              .map(
                (edit) =>
                  `[[Special:Diff/${edit.revid}|(${this.format_bytes(
                    edit.sizediff
                  )})]]`
              )
              .join(" ");
            const edit_count = group.edits.length;
            const edit_str = edit_count > 1 ? "edits" : "edit";
            wikitext += `{{AIC article row|article=${group.title}|status=requested|notes=${edit_count} ${edit_str}: ${links}}}\n`;
          });

          wikitext += `}}\n`;
          this.creating = true;
          this.create_error = "";
          this.step = 3;

          try {
            await api.postWithEditToken({
              action: "edit",
              title: this.target_page_title,
              text: wikitext,
              summary: `Creating tracking subpage ${APP_AD}`,
            });
          } catch (error) {
            this.create_error = "Error creating page: " + error.message;
            console.error(error);
          } finally {
            this.creating = false;
          }
        },
        get_diff_url(revid) {
          return mw.util.getUrl(`Special:Diff/${revid}`);
        },
        format_bytes(bytes) {
          return (bytes > 0 ? "+" : "") + (bytes || 0);
        },
        get_size_class(bytes) {
          return bytes > 0 ? "ainb-pos" : bytes < 0 ? "ainb-neg" : "ainb-neu";
        },
        truncate(string, max_length) {
          return string?.length > max_length
            ? string.slice(0, max_length - 1) + "..."
            : string || "";
        },
      },
    });
  }

  function create_edit_table_app(article) {
    const {
      CdxButton,
      CdxDialog,
      CdxSelect,
      CdxTextArea,
      CdxProgressBar,
    } = require("@wikimedia/codex");

    create_app({
      template: generate_edit_table_template(),
      components: {
        CdxButton,
        CdxDialog,
        CdxSelect,
        CdxTextArea,
        CdxProgressBar,
      },

      data() {
        return {
          is_open: true,
          article: article,
          status: "",
          raw_status: "",
          notes: "",
          loading: false,
          saving: false,
          error: "",
          wikitext: "",
          status_options: [
            { value: "completed", label: "Completed", aliases: ["c"] },
            { value: "ongoing", label: "Ongoing", aliases: ["o"] },
            {
              value: "unnecessary",
              label: "Unnecessary",
              aliases: ["u", "unneeded"],
            },
            {
              value: "requested",
              label: "Requested/To-do",
              aliases: ["r", "td", "todo", "to do", "t"],
            },
          ],
        };
      },

      computed: {
        dialog_title() {
          return `Editing row`;
        },
        can_save() {
          return !this.saving && !this.loading && this.status;
        },
      },

      methods: {
        handle_dialog_close() {
          if (current_app) {
            current_app.unmount();
            current_app = null;
            document.getElementById(APP_ID)?.remove();
          }
        },

        map_params(value) {
          if (!value) return "";
          const status = this.status_options.find(
            (option) =>
              option.value === value ||
              option.aliases?.includes(value.toLowerCase())
          );
          return status.value || "";
        },

        get_article_row_regex(escaped_article) {
          return new RegExp(
            `\\{\\{AIC article row\\s*\\|\\s*(?:article=)?\\s*${escaped_article}\\s*(?:\\|\\s*(?:status=)?\\s*([^|}]*))?(?:\\s*\\|\\s*(?:notes=)?\\s*([^}]*))?\\s*\\}\\}`,
            "i"
          );
        },

        async load_row_data() {
          this.loading = true;
          this.error = "";

          try {
            const page_name = mw.config.get("wgPageName");
            const result = await api.get({
              action: "parse",
              page: page_name,
              prop: "wikitext",
            });

            const wikitext = result.parse.wikitext["*"];
            const escaped_article = mw.util.escapeRegExp(this.article);
            const regex = this.get_article_row_regex(escaped_article);

            const match = wikitext.match(regex);

            if (match) {
              this.raw_status = match[1]?.trim() || "requested";
              this.notes = match[2]?.trim() || "";
              this.wikitext = wikitext;
            } else {
              this.error = "Could not find row data for this article.";
            }
          } catch (e) {
            this.error = "Error loading row data: " + e.message;
            console.error(e);
          } finally {
            this.loading = false;
          }
        },

        async save_changes() {
          this.saving = true;
          this.error = "";

          try {
            const page_name = mw.config.get("wgPageName");
            const escaped_article = mw.util.escapeRegExp(this.article);
            const regex = this.get_article_row_regex(escaped_article);

            const new_row = `{{AIC article row|article=${this.article}|status=${this.status}|notes=${this.notes}}}`;
            const new_wikitext = this.wikitext.replace(regex, new_row);

            await api.postWithEditToken({
              action: "edit",
              title: page_name,
              text: new_wikitext,
              summary: `Updated row for [[${this.article}]] ${APP_AD}`,
            });

            mw.notify("Saved successfully!", { type: "success" });
            setTimeout(() => location.reload(), 1000);
            this.handle_dialog_close();
          } catch (e) {
            this.error = "Error saving changes: " + e.message;
            console.error(e);
          } finally {
            this.saving = false;
          }
        },
      },

      async mounted() {
        await this.load_row_data();
        this.status = this.map_params(this.raw_status);
      },
    });
  }

  const portlet_link = mw.util.addPortletLink(
    "p-tb",
    "#",
    "New AINB tracking",
    "t-ainb-tracking",
    "Generate tracking subpage for AINB"
  );

  $(portlet_link).on("click", function (e) {
    e.preventDefault();
    create_main_app();
  });

  // template generators
  function generate_main_template() {
    const step1 = `
    <div v-if="step === 1" class="ainb-step">
      <div v-if="!loading">
        <p>Enter the username (contribs since Dec 1, 2022)</p>
        <cdx-text-input v-model="username" autocomplete="off" 
          data-bwignore="true" data-lpignore="true" data-1p-ignore 
          placeholder="User:ExampleUser or ExampleUser"
          @keydown.enter="fetch_contributions" />
      </div>
      
      <div v-if="error" class="ainb-error">{{ error }}</div>
      
      <div v-if="loading" class="ainb-loading">
        <p>Fetching contributions... {{ progress > 0 ? progress + ' found' : '' }}</p>
        <cdx-progress-bar inline></cdx-progress-bar>
      </div>
    </div>
  `;

    const step2 = `
    <div v-if="step === 2" class="ainb-step">
      <div class="ainb-controls">
        <cdx-checkbox :model-value="all_selected" :indeterminate="some_selected && !all_selected"
          @update:model-value="toggle_all">Select All</cdx-checkbox>
        <span><b>{{ total_selected_diffs }} diff(s)</b> selected</span>
      </div>

      <div class="ainb-list">
        <div v-for="group in article_groups" :key="group.title" class="ainb-article-card">
          <div class="ainb-article-header">
            <cdx-checkbox :model-value="group.all_selected" 
            :indeterminate="group.some_selected && !group.all_selected" 
            @update:model-value="toggle_article(group)">
              <strong>{{ group.title }}</strong>
              <span class="ainb-count">({{ group.selected_count }}/{{ group.edits.length }} selected)</span>
            </cdx-checkbox>
          </div>

          <cdx-accordion v-model="group.expanded" @update:model-value="handle_accordion_expand(group, article_groups.indexOf(group))">
            <template #title><span>See revisions</span></template>
            <div class="ainb-diffs" v-if="group.expanded">
              <div v-for="edit in group.edits" :key="edit.revid" class="ainb-diff-item" :class="{ 'ainb-diff-item-selected': edit.selected }">
                <div class="ainb-diff-actions">
                  <cdx-checkbox 
                    v-model="edit.selected" 
                    @update:model-value="update_group_selection(group)"
                    class="ainb-diff-checkbox"
                  ></cdx-checkbox>
                  <cdx-button @click="show_diff_popup(edit)" size="small">Diff popup</cdx-button>
                  <a :href="get_diff_url(edit.revid)" target="_blank">diff link</a>
                </div>
                <div class="ainb-diff-metadata">
                    <span class="ainb-comment" :title="edit.comment">
                      ({{ edit.comment ? truncate(edit.comment, 60) : 'No edit summary' }})
                    </span>
                    <span :class="['ainb-diff-size', get_size_class(edit.sizediff)]">
                      {{ format_bytes(edit.sizediff) }}
                    </span>
                    <span class="ainb-time">{{ edit.timestamp }}</span>
                  
                </div>
              </div>
            </div>
          </cdx-accordion>
        </div>
      </div>
    </div>
  `;

    const diff_dialog = `
      <cdx-dialog v-model:open="diff_dialog_open" 
        :title="viewing_diff_edit ? 'Diff for ' + viewing_diff_edit.title : ''"
        :use-close-button="true"
        class="ainb-diff-dialog"
        @keyup.enter="close_diff_popup"
      >
        <div v-if="viewing_diff_edit">
           <div v-if="viewing_diff_edit.diff_loading" class="ainb-diff-loading">Loading...</div>
           <div v-else-if="viewing_diff_edit.diff_content" class="ainb-diff-content" v-html="viewing_diff_edit.diff_content"></div>
           <div v-else class="ainb-diff-loading">No content loaded.</div>
        </div>
        <template #footer>
          <cdx-button @click="close_diff_popup">Close</cdx-button>
        </template>
      </cdx-dialog>
    `;

    const step3 = `
    <div v-if="step === 3" class="ainb-step">
      <div v-if="creating" class="ainb-loading">
        <p>Creating page...</p>
        <cdx-progress-bar inline></cdx-progress-bar>
      </div>
      
      <div v-else-if="create_error" class="ainb-error">{{ create_error }}</div>
      
      <div v-else>
        <p>Page created successfully!</p>
        <p><a :href="target_page_url" target="_blank">{{ target_page_title }}</a></p>
      </div>
    </div>
  `;

    const footer = `
    <template #footer>
      <div class="ainb-dialog-footer">
        <div v-if="step === 1"></div>
        
        <cdx-button v-if="step === 1" 
          action="progressive" weight="primary" 
          @click="fetch_contributions" :disabled="loading || !username">
          {{ loading ? 'Fetching...' : 'Fetch contributions' }}</cdx-button>
        
        <template v-if="step === 2">
          <div class="ainb-subpage-info">Target: <strong>{{ target_page_title }}</strong></div>
          <div class="ainb-footer-buttons">
            <cdx-button @click="step = 1">Back</cdx-button>
            <cdx-button action="progressive" 
              weight="primary" @click="generate_report"
              :disabled="total_selected_diffs === 0">Create Page
            </cdx-button>
          </div>
        </template>
        
        <template v-if="step === 3">
          <div></div>
          <div>
            <cdx-button @click="handle_dialog_close">Close</cdx-button>
          </div>
        </template>
      </div>
    </template>
  `;

    return `
<div>
<cdx-dialog class="ainb-helper" v-model:open="is_open" 
:title="dialog_title" :use-close-button="true" :subtitle="dialog_subtitle"
@update:open="handle_dialog_close">
  ${step1}
  ${step2}
  ${step3}
  ${footer}
</cdx-dialog>
${diff_dialog}
</div>
  `;
  }

  function generate_edit_table_template() {
    const footer = `    
    <template #footer>
      <div class="ainb-dialog-footer">
        <div></div>
        <div>
          <cdx-button @click="handle_dialog_close">Cancel</cdx-button>
          <cdx-button action="progressive" weight="primary" 
            @click="save_changes" :disabled="!can_save">
            {{ saving ? 'Saving...' : 'Save' }}
          </cdx-button>
        </div>
      </div>
    </template>`;

    return `
<div>
  <cdx-dialog class="ainb-edit-table" v-model:open="is_open" 
    :title="dialog_title" :use-close-button="true"
    @update:open="handle_dialog_close">
    
    <div class="ainb-edit-step">
      <div v-if="loading" class="ainb-loading">
        <p>Loading row data...</p>
        <cdx-progress-bar inline></cdx-progress-bar>
      </div>
      
      <div v-else-if="error" class="ainb-error">{{ error }}</div>
      
      <div v-else>
        <div class="ainb-form-field">
          Article: <strong>{{ article }}</strong>
        </div>
        
        <div class="ainb-form-field">
          <div class="ainb-form-label">Status:</div>
          <div><cdx-select v-model:selected="status" :menu-items="status_options"></cdx-select></div>
        </div>
        
        <div class="ainb-form-field">
          <div class="ainb-form-label">Notes:</div>
          <cdx-text-area v-model="notes" rows="4"></cdx-text-area>
        </div>
      </div>
    </div>
    ${footer}
  </cdx-dialog>
</div>
    `;
  }
  // end template gen-

  // for nicely formatted CSS, see [[User:DVRTed/AINB-helper.css]]
  mw.util.addCSS(
    ` .ainb-helper .cdx-checkbox, .ainb-helper .cdx-label {margin: 0 !important;}.ainb-helper.cdx-dialog__window, .ainb-helper .cdx-dialog__window, .ainb-helper, .ainb-diff-dialog.cdx-dialog__window, .ainb-diff-dialog .cdx-dialog__window, .ainb-diff-dialog {width: 800px !important;max-width: 90vw !important;}.ainb-dialog-footer .cdx-button {margin: 0 4px;}.ainb-dialog-footer {display: flex;align-items: center;justify-content: space-between;}.ainb-step {padding: 1em 0;max-height: 65vh;overflow-y: auto;}.ainb-subpage-info {padding: 0.75em;background: #f8f9fa;border-left: 3px solid #36c;overflow: hidden;}.ainb-subpage-info strong {font-family: monospace;}.ainb-footer-buttons {min-width: 200px;}.ainb-error {color: #d33;margin-top: 0.5em;padding: 0.5em;background: #fee;border-radius: 2px;}.ainb-loading {text-align: center;}.ainb-controls {display: flex;justify-content: space-between;align-items: center;padding: 0.75em;background: #fbfbfb;margin-bottom: 1em;}.ainb-article-card {border: 2px solid #f7f7f7;border-radius: 4px;margin: 20px 0;overflow: hidden;}.ainb-article-header {padding: 0.75em 1em;background: #fbfbfb;border-bottom: 2px solid #d3d3d3;}.ainb-article-title-row {display: flex;align-items: center;justify-content: space-between;}.ainb-count {color: #858585;font-size: 0.9em;margin: 0 4px;font-weight: normal;}.ainb-diffs {padding: 1em;}.ainb-diff-item {border: 1px solid #eaecf0;border-radius: 8px;padding: 12px;margin-bottom: 12px;background: #fff;transition: all 0.2s ease;box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);}.ainb-diff-item-selected {border-color: #a4c4f0;box-shadow: 0 2px 4px rgba(51, 102, 204, 0.15);background-color: #f8fbff;}.ainb-diff-metadata {display: flex;align-items: center;}.ainb-diff-actions {display: flex;align-items: center;gap: 12px;margin-bottom: 8px;padding-bottom: 8px;border-bottom: 1px solid #f0f0f0;font-size: 0.9em;}.ainb-diff-size {font-weight: 600;margin: 0 8px;font-family: monospace;font-size: 1.1em;padding: 2px 6px;border-radius: 4px;background: #f8f9fa;}.ainb-pos {color: #027202;}.ainb-neg {color: #830101;}.ainb-neu {color: #4b4f53;}.ainb-time {color: #72777d;font-size: 0.85em;margin-left: auto;white-space: nowrap;}.ainb-comment {color: #202122;font-weight: 500;margin-left: 8px;margin-right: 8px;overflow: hidden;text-overflow: ellipsis;white-space: nowrap;display: inline-block;max-width: 60%;vertical-align: middle;}.ainb-diff-popup-overlay {position: fixed;top: 0;left: 0;width: 100vw;height: 100vh;background: rgba(0, 0, 0, 0.5);display: flex;justify-content: center;align-items: center;z-index: 1000;}.ainb-diff-popup-content {background: #fff;width: 85vw;max-width: 1000px;height: 80vh;display: flex;flex-direction: column;border-radius: 8px;box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);overflow: hidden;}.skin-theme-clientpref-night .ainb-diff-popup-content, .skin-theme-clientpref-night {background: #2a2a2a;color: #fff;}.ainb-diff-loading {padding: 1em;color: #72777d;font-style: italic;text-align: center;}.ainb-diff-content {padding: 0.5em;background: #fff;overflow-x: auto;display: flex;justify-content: center;}.ainb-diff-content .diff {max-width: 100%;border-collapse: collapse;font-size: 0.85em;font-family: monospace;table-layout: fixed;}.ainb-diff-content .diff td {padding: 2px 6px;vertical-align: top;word-wrap: break-word;overflow-wrap: anywhere;}.ainb-diff-content .diff-marker {width: 2%;padding: 0 2px;text-align: right;}.ainb-diff-content .diff-context, .ainb-diff-content .diff-addedline, .ainb-diff-content .diff-deletedline {width: 48%;}.ainb-diff-content .diff-addedline {background: #7ef09c;}.ainb-diff-content .diff-deletedline {background: #faa1ac;}.ainb-diff-content .diff-context {background: #f8f9fa;color: #72777d;}.ainb-preview {background: #f8f9fa;padding: 1em;border: 1px solid #eaecf0;border-radius: 2px;max-height: 300px;overflow: auto;font-size: 0.85em;white-space: pre-wrap;}.skin-theme-clientpref-night .ainb-controls, .skin-theme-clientpref-night .ainb-article-header, .skin-theme-clientpref-night .ainb-accordion-header, .skin-theme-clientpref-night .ainb-diff-content, .skin-theme-clientpref-night .ainb-subpage-info, .skin-theme-clientpref-night .ainb-diff-item {background: #2a2a2a;color: #fff;border-color: #4a4a4a;}.skin-theme-clientpref-night .ainb-diff-size {background: #363636;color: #fff;}.skin-theme-clientpref-night .ainb-diff-actions {border-bottom-color: #4a4a4a;}.skin-theme-clientpref-night .ainb-diff-item-selected {border-color: #36c;background-color: #1a2635;}.skin-theme-clientpref-night .ainb-diff-content .diff-context {background: #363636;color: #fff;}.skin-theme-clientpref-night .ainb-diff-content .diff-deletedline {background: #a51729;color: #fff;}.skin-theme-clientpref-night .ainb-diff-content .diff-addedline {background: #087c26;color: #fff;}.skin-theme-clientpref-night .ainb-accordion-header:hover {background: #606060;}.skin-theme-clientpref-night .ainb-comment {color: #ffffff;font-style: italic;}.ainb-edit-table.cdx-dialog__window, .ainb-edit-table .cdx-dialog__window, .ainb-edit-table {width: 700px !important;max-width: 90vw !important;}.ainb-edit-btn {font-size: 14px;line-height: 1;}.ainb-edit-btn:hover {background: #e8e9ea;border-color: #999;}.ainb-form-field {margin: 5px 0;}`
  );

  function init_row_editing() {
    $('tr[class*="aic-row-"]').each(function () {
      const $thead = $(this).closest("table").find("thead");

      if ($thead.find("th.ainb-action-header").length === 0) {
        $thead.find("tr").prepend('<th class="ainb-action-header">Action</th>');
      }

      const $row = $(this);
      if ($row.find(".ainb-edit-btn").length) return;

      const $first_cell = $row.find("td").first();
      const $link = $first_cell.find("a").first();
      if (!$link.length) return;

      const $edit_td = $("<td>").addClass("ainb-action-cell");
      $first_cell.before($edit_td);

      const $edit_button = $("<button>")
        .addClass("ainb-edit-btn")
        .text("✎")
        .attr("title", "Edit this row")
        .css({
          marginLeft: "8px",
          cursor: "pointer",
          border: "1px solid #ccc",
          background: "#f8f9fa",
          padding: "2px 6px",
          borderRadius: "3px",
        })
        .on("click", (e) => {
          e.preventDefault();
          create_edit_table_app($link.text().trim());
        });

      $edit_td.append($edit_button);
    });
  }

  const wgPageName = mw.config.get("wgPageName");

  // if we're on an AINB tracking subpage, or the debug page,
  // enable editing rows
  if (
    wgPageName.startsWith("Wikipedia:WikiProject_AI_Cleanup/Noticeboard/") ||
    wgPageName === DEBUG_PAGE
  ) {
    init_row_editing();
  }

  // </nowiki>
});
