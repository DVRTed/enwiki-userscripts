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
      CdxCheckbox,
      CdxProgressBar,
      CdxMenuButton,
    } = require("@wikimedia/codex");

    create_app({
      template: generate_main_template(),
      components: {
        CdxButton,
        CdxTextInput,
        CdxDialog,
        CdxCheckbox,
        CdxProgressBar,
        CdxMenuButton,
      },

      data() {
        return {
          is_open: true,
          step: 1,
          username: "",
          normalized_username: "",
          anchor_date: "2022-12-01",
          end_date: "",
          loading: false,
          progress: 0,
          edit_count: 0,
          error: "",
          article_groups: [],
          article_search: "",
          sort_mode: "recent",
          selected_article_title: "",
          creating: false,
          create_error: "",
          generated_wikitext: "",
          target_page_title: "",
          target_page_url: "",
          viewing_diff_edit: null,
          filter_menu_selected: null,
          available_tags: [],
          selected_tags_map: {},
          tag_dialog_open: false,
          tag_counts: {},
        };
      },

      computed: {
        dialog_title() {
          if (this.step === 1) return "Generate tracking subpage for AINB";
          if (this.step === 2) return "Select diffs to include";
          return "Page Created";
        },
        total_selected_diffs() {
          return this.article_groups.reduce(
            (sum, group) => sum + group.selected_count,
            0,
          );
        },
        total_selected() {
          return this.article_groups.filter((group) => group.selected_count > 0)
            .length;
        },
        total_groups() {
          return this.article_groups.length;
        },
        all_selected() {
          return (
            this.article_groups.length > 0 &&
            this.article_groups.every((group) => group.all_selected)
          );
        },
        some_selected() {
          return this.article_groups.some(
            (group) => group.some_selected || group.all_selected,
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
        filtered_sorted_groups() {
          let groups = this.article_groups;
          const query = this.article_search.trim().toLowerCase();

          if (query) {
            groups = groups.filter((g) =>
              g.title.toLowerCase().includes(query),
            );
          }

          groups = [...groups];

          if (this.sort_mode === "edits") {
            groups.sort((a, b) => b.edits.length - a.edits.length);
          } else if (this.sort_mode === "alpha") {
            groups.sort((a, b) => a.title.localeCompare(b.title));
          } else if (this.sort_mode === "recent") {
            groups.sort(
              (a, b) =>
                new Date(b.edits[0].timestamp) - new Date(a.edits[0].timestamp),
            );
          }

          return groups;
        },
        selected_group() {
          return (
            this.article_groups.find(
              (g) => g.title === this.selected_article_title,
            ) || null
          );
        },
        filter_menu_items() {
          return [
            { value: "smaller", label: "Unselect smaller edits" },
            { value: "tag", label: "Unselect edits by tag" },
          ];
        },
        selected_tag_list() {
          return this.available_tags.filter(
            (tag) => this.selected_tags_map[tag],
          );
        },
        tags_in_selection() {
          return this.available_tags.filter(
            (tag) => (this.tag_counts[tag] || 0) > 0,
          );
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

        fire_hook() {
          nextTick(() => {
            const $content = $(".ainb-revisions-table");
            if ($content.length) {
              mw.hook("wikipage.content").fire($content);
            }
          });
        },

        select_article(title) {
          this.selected_article_title = title;
          this.fire_hook();
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
        unselect_smaller_edits() {
          const input = prompt("Unselect edits smaller than (bytes):", "35");
          if (input === null) return;
          const threshold = parseInt(input, 10);
          if (isNaN(threshold)) return;

          this.article_groups.forEach((group) => {
            group.edits.forEach((edit) => {
              if (edit.selected && Math.abs(edit.sizediff) < threshold) {
                edit.selected = false;
              }
            });
            this.update_group_selection(group);
          });
        },
        handle_filter_menu_select(value) {
          this.filter_menu_selected = null;
          if (value === "smaller") {
            this.unselect_smaller_edits();
          } else if (value === "tag") {
            this.open_tag_dialog();
          }
        },
        open_tag_dialog() {
          this.selected_tags_map = Object.fromEntries(
            this.available_tags.map((tag) => [tag, false]),
          );

          const counts = {};
          this.article_groups.forEach((group) => {
            group.edits.forEach((edit) => {
              if (!edit.selected) return;
              (edit.tags || []).forEach((tag) => {
                counts[tag] = (counts[tag] || 0) + 1;
              });
            });
          });
          this.tag_counts = counts;

          this.tag_dialog_open = true;
        },
        unselect_by_tag() {
          const tags_to_unselect = new Set(this.selected_tag_list);

          this.article_groups.forEach((group) => {
            group.edits.forEach((edit) => {
              if (
                edit.selected &&
                edit.tags?.some((tag) => tags_to_unselect.has(tag))
              ) {
                edit.selected = false;
              }
            });
            this.update_group_selection(group);
          });

          this.tag_dialog_open = false;
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
                  `User has over 20k edits (${edit_count}). Are you sure you want to continue?`,
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

            const ucend_timestamp = this.anchor_date
              ? `${this.anchor_date}T00:00:00Z`
              : undefined;
            const ucstart_timestamp = this.end_date
              ? `${this.end_date}T00:00:00Z`
              : undefined;

            do {
              const params = {
                action: "query",
                list: "usercontribs",
                ucnamespace: 0,
                ucuser: this.normalized_username,
                ...(ucend_timestamp ? { ucend: ucend_timestamp } : {}),
                ...(ucstart_timestamp ? { ucstart: ucstart_timestamp } : {}),
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
              (edit) => !edit.tags?.includes("mw-reverted"),
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

            const tag_set = new Set();
            valid_edits.forEach((edit) => {
              (edit.tags || []).forEach((tag) => tag_set.add(tag));
            });
            this.available_tags = Array.from(tag_set).sort();

            this.article_groups = Object.values(groups);

            this.article_groups.forEach((group) =>
              this.update_group_selection(group),
            );

            if (this.article_groups.length === 0) {
              this.error = "No contributions found in the specified period.";
            } else {
              this.step = 2;
              const top_article = this.filtered_sorted_groups[0];
              if (top_article) this.select_article(top_article.title);

              const page_title = DEBUG_MODE
                ? DEBUG_PAGE
                : `Wikipedia:AI noticeboard/${this.current_date} ${this.normalized_username}`;
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
          const wikitext = this.build_wikitext();
          this.generated_wikitext = wikitext;
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
        build_wikitext() {
          const selected_groups = this.article_groups
            .map((group) => ({
              ...group,
              edits: group.edits.filter((edit) => edit.selected),
            }))
            .filter((group) => group.edits.length > 0);

          let wikitext = `{{NOINDEX|visible=yes}}\nRelevant report and discussion may be viewable on the talk page.\n\n== Tracking list ==\n{{AIC article list|\n`;

          selected_groups.forEach((group) => {
            const links = group.edits
              .map(
                (edit) =>
                  `[[Special:Diff/${edit.revid}|(${this.format_bytes(
                    edit.sizediff,
                  )})]]`,
              )
              .join(" ");
            const edit_count = group.edits.length;
            const edit_str = edit_count > 1 ? "edits" : "edit";
            wikitext += `{{AIC article row|article=${group.title}|status=requested|notes=${edit_count} ${edit_str}: ${links}}}\n`;
          });

          wikitext += `}}\n`;
          return wikitext;
        },
        async copy_wikitext() {
          try {
            await navigator.clipboard.writeText(this.build_wikitext());
            mw.notify('Wikitext copied to clipboard.', { type: 'success' });
          } catch (err) {
            mw.notify('Failed to copy to clipboard.', { type: 'error' });
          }
        },
        get_diff_url(revid) {
          return mw.util.getUrl(`Special:Diff/${revid}`);
        },
        get_article_url(title) {
          return mw.util.getUrl(title);
        },
        get_history_url(title) {
          return mw.util.getUrl(title, { action: "history" });
        },
        get_user_url(username) {
          return mw.util.getUrl(`User:${username}`);
        },
        get_contribs_url(username) {
          return mw.util.getUrl(`Special:Contributions/${username}`);
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
              option.aliases?.includes(value.toLowerCase()),
          );
          return status?.value || "";
        },

        get_article_row_regex(escaped_article) {
          return new RegExp(
            `\\{\\{AIC article row\\s*\\|\\s*(?:article=)?\\s*${escaped_article}\\s*(?:\\|\\s*(?:status=)?\\s*([^|}]*))?(?:\\s*\\|\\s*(?:notes=)?\\s*([^}]*))?\\s*\\}\\}`,
            "i",
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

            location.reload();
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
    "Generate tracking subpage for AINB",
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
        <p>Enter the username</p>
        <cdx-text-input v-model="username" autocomplete="off" 
          data-bwignore="true" data-lpignore="true" data-1p-ignore 
          placeholder="User:ExampleUser or ExampleUser"
          @keydown.enter="fetch_contributions" />

        <div class="ainb-date-field">
          <label for="ainb-anchor-date">Only fetch edits made after:</label>
          <input id="ainb-anchor-date" type="date" v-model="anchor_date" class="ainb-date-input" />
          <p class="ainb-date-hint">Defaults to December 2022, the public release date of ChatGPT.</p>
        </div>

        <div class="ainb-date-field">
          <label for="ainb-end-date">Only fetch edits made before:</label>
          <input id="ainb-end-date" type="date" v-model="end_date" class="ainb-date-input" />
          <p class="ainb-date-hint">Leave blank to fetch up to the most recent edit.</p>
        </div>
      </div>
      
      <div v-if="error" class="ainb-error">{{ error }}</div>
      
      <div v-if="loading" class="ainb-loading">
        <p>Fetching contributions... {{ progress > 0 ? progress + ' found' : '' }}</p>
        <cdx-progress-bar inline></cdx-progress-bar>
      </div>
    </div>
  `;

    const step2 = `
<div v-if="step === 2" class="ainb-step2">
    <div class="ainb-step2-subtitle">
        <a :href="get_user_url(normalized_username)" target="_blank">User:{{ normalized_username }}</a>
        &middot; <a :href="get_contribs_url(normalized_username)" target="_blank">(contrib)</a>
        &middot; {{ edit_count }} edit(s) across {{ article_groups.length }} article(s)
    </div>
    <div class="ainb-step2-toolbar">
        <cdx-checkbox :model-value="all_selected" :indeterminate="some_selected && !all_selected"
            @update:model-value="toggle_all">Select all</cdx-checkbox>
        <cdx-menu-button
            v-model:selected="filter_menu_selected"
            weight="normal"
            :menu-items="filter_menu_items"
            :disabled="!some_selected"
            @update:selected="handle_filter_menu_select"
        >Filter selected</cdx-menu-button>
        <span class="ainb-total-badge"><b>{{ total_selected }}</b> of {{ total_groups }} articles selected</span>
    </div>

    <div class="ainb-step2-layout">
        <div class="ainb-article-list">
            <div class="ainb-article-list-controls">
                <cdx-text-input v-model="article_search" placeholder="Filter articles..."
                    class="ainb-article-search"></cdx-text-input>
                <div class="ainb-sort-toggle">
                    <button type="button" :class="{ active: sort_mode === 'edits' }" @click="sort_mode = 'edits'">Most
                        edits</button>
                    <button type="button" :class="{ active: sort_mode === 'alpha' }"
                        @click="sort_mode = 'alpha'">A-Z</button>
                    <button type="button" :class="{ active: sort_mode === 'recent' }"
                        @click="sort_mode = 'recent'">Recent</button>
                </div>
            </div>

            <ul class="ainb-article-items">
                <li v-for="group in filtered_sorted_groups" :key="group.title" class="ainb-article-item"
                    :class="{ 'ainb-article-item-active': group.title === selected_article_title, 'ainb-article-item-picked': group.selected_count > 0 }"
                    @click="select_article(group.title)">
                    <cdx-checkbox :model-value="group.all_selected"
                        :indeterminate="group.some_selected && !group.all_selected"
                        @update:model-value="toggle_article(group)" @click.stop></cdx-checkbox>
                    <div class="ainb-article-item-info">
                        <div class="ainb-article-item-title">{{ group.title }}</div>
                        <div class="ainb-article-item-meta">
                            <span>{{ group.edits.length }} edit(s)</span>
                            <span v-if="group.selected_count > 0" class="ainb-article-item-badge">&middot; selected {{
                                group.selected_count }}/{{ group.edits.length }}</span>
                        </div>
                    </div>
                </li>
                <li v-if="filtered_sorted_groups.length === 0" class="ainb-article-empty">No articles match "{{
                    article_search }}"</li>
            </ul>
        </div>

        <div class="ainb-revisions-panel">
            <template v-if="selected_group">
                <div class="ainb-revisions-header">
                    <div>
                        <div class="ainb-revisions-title">
                            <a :href="get_article_url(selected_group.title)" target="_blank">{{ selected_group.title
                                }}</a>
                            <a :href="get_history_url(selected_group.title)" target="_blank" class="ainb-history-link">(hist)</a>
                        </div>

                        <div class="ainb-revisions-subtitle">
                            {{ selected_group.edits.length }} edit(s) by {{normalized_username}} 
                        </div>
                    </div>
                </div>

                <table class="ainb-revisions-table">
                    <thead>
                        <tr>
                            <th class="ainb-col-cb"></th>
                            <th class="ainb-col-actions">Diff</th>
                            <th class="ainb-col-time">Date</th>
                            <th class="ainb-col-size">Size</th>
                            <th class="ainb-col-summary">Summary</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="edit in selected_group.edits" :key="edit.revid" class="ainb-diff-row"
                            :class="{ 'ainb-diff-row-selected': edit.selected }">
                            <td class="ainb-col-cb">
                                <cdx-checkbox v-model="edit.selected"
                                    @update:model-value="update_group_selection(selected_group)"></cdx-checkbox>
                            </td>
                            <td class="ainb-col-actions">
                                <cdx-button @click="show_diff_popup(edit)" size="small">View</cdx-button>
                                <a :href="get_diff_url(edit.revid)" target="_blank">↗</a>
                            </td>
                            <td class="ainb-col-time">{{ edit.timestamp }}</td>
                            <td :class="['ainb-col-size', get_size_class(edit.sizediff)]">{{ format_bytes(edit.sizediff)
                                }}</td>
                            <td class="ainb-col-summary" :title="edit.comment">{{ edit.comment ? truncate(edit.comment,
                                80) : 'No edit summary' }}</td>
                        </tr>
                    </tbody>
                </table>
            </template>
            <div v-else class="ainb-revisions-empty">Select an article on the left to view its revisions.</div>
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

    const tag_dialog = `
      <cdx-dialog v-model:open="tag_dialog_open"
        title="Unselect edits by tag"
        :use-close-button="true"
        class="ainb-tag-dialog"
      >
        <p v-if="tags_in_selection.length === 0">No tags found on the selected edits.</p>
        <div v-else>
          <cdx-checkbox v-for="tag in tags_in_selection" :key="tag" v-model="selected_tags_map[tag]">
            {{ tag }} ({{ tag_counts[tag] }} edit{{ tag_counts[tag] === 1 ? '' : 's' }})
          </cdx-checkbox>
        </div>
        <template #footer>
          <div class="ainb-dialog-footer">
            <div></div>
            <div>
              <cdx-button @click="tag_dialog_open = false">Cancel</cdx-button>
              <cdx-button action="progressive" weight="primary"
                @click="unselect_by_tag" :disabled="selected_tag_list.length === 0">
                Unselect
              </cdx-button>
            </div>
          </div>
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
            <cdx-button @click="copy_wikitext"
              :disabled="total_selected_diffs === 0">Copy wikitext
            </cdx-button>
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
:title="dialog_title" :use-close-button="true"
@update:open="handle_dialog_close">
  ${step1}
  ${step2}
  ${step3}
  ${footer}
</cdx-dialog>
${diff_dialog}
${tag_dialog}
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
  mw.util.addCSS(`
.ainb-helper .cdx-checkbox,.ainb-helper .cdx-label{margin:0!important}.ainb-helper.cdx-dialog__window,.ainb-helper .cdx-dialog__window,.ainb-helper,.ainb-diff-dialog.cdx-dialog__window,.ainb-diff-dialog .cdx-dialog__window,.ainb-diff-dialog{width:960px!important;max-width:92vw!important}.ainb-dialog-footer .cdx-button{margin:0 4px}.ainb-dialog-footer{display:flex;align-items:center;justify-content:space-between}.ainb-step{padding:1em 0;max-height:65vh;overflow-y:auto}.ainb-error{color:#d33;margin-top:.5em;padding:.5em;background:#fee;border-radius:2px}.ainb-loading{text-align:center}.ainb-date-field{margin-top:1em}.ainb-date-field label{display:block;font-weight:600;margin-bottom:4px}.ainb-date-input{padding:4px 6px;border:1px solid #a2a9b1;border-radius:2px;font-size:1em}.ainb-date-hint{color:#72777d;font-size:.85em;margin:4px 0 0 0}.ainb-step2{padding:.75em 0}.ainb-step2-subtitle{font-size:.875em;color:#54595d;margin-bottom:12px}.ainb-step2-toolbar{display:flex;align-items:center;justify-content:space-between;padding:.6em .75em;background:#fbfbfb;border:1px solid #eaecf0;border-radius:4px 4px 0 0}.ainb-total-badge{color:#54595d;font-size:.92em}.ainb-total-badge b{color:#202122}.ainb-step2-layout{display:flex;height:55vh;border:1px solid #eaecf0;border-top:none;border-radius:0 0 4px 4px}.ainb-article-list{width:280px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid #eaecf0;background:#fbfbfb}.ainb-article-list-controls{padding:.6em;border-bottom:1px solid #eaecf0}.ainb-article-search{width:100%}.ainb-sort-toggle{display:flex;gap:4px;margin-top:6px}.ainb-sort-toggle button{flex:1;font-size:.78em;padding:3px 4px;border:1px solid #c8ccd1;background:#fff;border-radius:2px;cursor:pointer;color:#54595d}.ainb-sort-toggle button:hover{background:#f0f0f0}.ainb-sort-toggle button.active{background:#36c;border-color:#36c;color:#fff}.ainb-article-items{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1}.ainb-article-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;cursor:pointer;border-bottom:1px solid #f0f0f0;border-left:3px solid #fff0}.ainb-article-item:hover{background:#f0f4fb}.ainb-article-item-active{background:#eaf1fc;border-left-color:#36c}.ainb-article-item-picked .ainb-article-item-title{font-weight:600}.ainb-article-item-info{min-width:0;flex:1}.ainb-article-item-title{font-size:.92em;color:#202122;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ainb-article-item-meta{display:flex;align-items:center;gap:6px;font-size:.78em;color:#72777d;margin-top:2px}.ainb-article-empty{padding:1.5em 1em;text-align:center;color:#72777d;font-size:.9em}.ainb-revisions-panel{flex:1;min-width:0;display:flex;flex-direction:column;overflow:auto}.ainb-revisions-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1em;padding:.75em 1em;border-bottom:1px solid #eaecf0;background:#fff}.ainb-revisions-title{font-weight:700;font-size:1.05em;color:#202122}.ainb-revisions-subtitle{font-size:.85em;color:#72777d;margin-top:2px}.ainb-history-link{font-size:.75em;font-weight:400;margin-left:8px}.ainb-revisions-empty{flex:1;display:flex;align-items:center;justify-content:center;color:#72777d;font-style:italic;padding:2em;text-align:center}.ainb-revisions-table{width:100%;border-collapse:collapse;font-size:.88em}.ainb-revisions-table thead{position:sticky;top:0;background:#fff;z-index:1}.ainb-revisions-table thead th{text-align:left;font-weight:700;padding:8px;border-bottom:1px solid #ccc}.ainb-diff-row{border-bottom:1px solid #eaecf0}.ainb-diff-row:last-child{border-bottom:none}.ainb-diff-row td{padding:8px;vertical-align:middle}.ainb-diff-row:hover{background-color:#f8f9fa}.ainb-diff-row-selected{background-color:#f8fbff}.ainb-col-cb,.ainb-col-actions,.ainb-col-time{width:1%;white-space:nowrap}.ainb-col-actions .cdx-button{margin-right:6px}.ainb-col-size{font-weight:600;font-family:monospace;font-size:.95em;white-space:nowrap;width:1%;text-align:right}.ainb-pos{color:#027202}.ainb-neg{color:#830101}.ainb-neu{color:#4b4f53}.ainb-col-summary{color:#202122;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:1px}.ainb-col-time{color:#72777d;font-size:.9em}.ainb-diff-loading{padding:1em;color:#72777d;font-style:italic;text-align:center}.ainb-diff-content{padding:.5em;background:#fff;overflow-x:auto;display:flex;justify-content:center}.ainb-diff-content .diff{max-width:100%;border-collapse:collapse;font-size:.85em;font-family:monospace;table-layout:fixed}.ainb-diff-content .diff td{padding:2px 6px;vertical-align:top;word-wrap:break-word;overflow-wrap:anywhere}.ainb-diff-content .diff-marker{width:2%;padding:0 2px;text-align:right}.ainb-diff-content .diff-context,.ainb-diff-content .diff-addedline,.ainb-diff-content .diff-deletedline{width:48%}.ainb-diff-content .diff-addedline{background:#7ef09c}.ainb-diff-content .diff-deletedline{background:#faa1ac}.ainb-diff-content .diff-context{background:#f8f9fa;color:#72777d}.ainb-subpage-info{padding:.75em;background:#f8f9fa;border-left:3px solid #36c;overflow:hidden}.ainb-subpage-info strong{font-family:monospace}.ainb-footer-buttons{min-width:200px}.ainb-edit-table .cdx-dialog__window{width:700px!important;max-width:90vw!important}.ainb-edit-btn{font-size:14px;line-height:1;cursor:pointer;border:1px solid #ccc;background:#f8f9fa;padding:2px 6px;border-radius:3px}.ainb-edit-btn:hover{background:#e8e9ea;border-color:#999}.skin-theme-clientpref-night .ainb-edit-btn{border-color:#4a4a4a;background:#363636;color:#fff}.skin-theme-clientpref-night .ainb-edit-btn:hover{background:#4a4a4a;border-color:#7aa7f0}.ainb-form-field{margin:5px 0}.skin-theme-clientpref-night .ainb-date-input,.skin-theme-clientpref-night .ainb-step2-toolbar,.skin-theme-clientpref-night .ainb-article-list,.skin-theme-clientpref-night .ainb-article-list-controls,.skin-theme-clientpref-night .ainb-revisions-header,.skin-theme-clientpref-night .ainb-revisions-table thead,.skin-theme-clientpref-night .ainb-subpage-info{background:#2a2a2a;border-color:#4a4a4a}.skin-theme-clientpref-night .ainb-date-input,.skin-theme-clientpref-night .ainb-total-badge,.skin-theme-clientpref-night .ainb-total-badge b,.skin-theme-clientpref-night .ainb-article-item-title,.skin-theme-clientpref-night .ainb-revisions-title,.skin-theme-clientpref-night .ainb-col-summary{color:#fff}.skin-theme-clientpref-night .ainb-step2-subtitle,.skin-theme-clientpref-night .ainb-article-empty,.skin-theme-clientpref-night .ainb-revisions-empty,.skin-theme-clientpref-night .ainb-revisions-subtitle,.skin-theme-clientpref-night .ainb-col-time{color:#ccc}.skin-theme-clientpref-night .ainb-step2-layout,.skin-theme-clientpref-night .ainb-diff-row{border-color:#4a4a4a}.skin-theme-clientpref-night .ainb-article-item{border-bottom-color:#3a3a3a}.skin-theme-clientpref-night .ainb-sort-toggle button{background:#363636;border-color:#4a4a4a;color:#ddd}.skin-theme-clientpref-night .ainb-sort-toggle button.active{background:#36c;border-color:#36c;color:#fff}.skin-theme-clientpref-night .ainb-article-item:hover,.skin-theme-clientpref-night .ainb-diff-row:hover{background:#363636}.skin-theme-clientpref-night .ainb-article-item-active,.skin-theme-clientpref-night .ainb-diff-row-selected{background:#1a2635}.skin-theme-clientpref-night .ainb-article-item-active{border-left-color:#7aa7f0}.skin-theme-clientpref-night .ainb-diff-content .diff-context{background:#363636;color:#fff}.skin-theme-clientpref-night .ainb-diff-content .diff-deletedline{background:#a51729;color:#fff}.skin-theme-clientpref-night .ainb-diff-content .diff-addedline{background:#087c26;color:#fff}.ainb-progress-wrap{margin-bottom:1em;padding:8px 12px;border:1px solid var(--border-color-base,#a2a9b1);border-radius:4px}.ainb-progress-top{display:flex;align-items:center;gap:10px;margin-bottom:8px}.ainb-progress-percent{font-size:1.8em;font-weight:700;line-height:1;color:var(--color-base,#202122)}.ainb-progress-top-text{display:flex;flex-direction:column}.ainb-progress-title{font-weight:600;font-size:.9em}.ainb-progress-stats{font-size:.85em;color:var(--color-subtle,#54595d)}.ainb-progress-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:#eaecf0}.ainb-seg{height:100%}.ainb-seg-completed{background:var(--background-color-success,#14866d)}.ainb-seg-unnecessary{background:var(--background-color-disabled,#c8ccd1)}.ainb-seg-ongoing{background:var(--background-color-progressive,#36c)}.ainb-seg-todo{background:var(--background-color-notice,#fc3)}.ainb-progress-legend{display:flex;gap:10px;margin-top:6px;font-size:.8em;color:var(--color-subtle,#54595d);text-transform:capitalize}.ainb-progress-legend i.ainb-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:3px}.ainb-progress-credit{font-size:.75em;color:var(--color-subtle,#54595d);font-weight:400;text-align:right}.ainb-hide-resolved .ainb-row-resolved{display:none}.ainb-seg-unknown{background:var(--background-color-disabled,#c8ccd1)}
`);

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
        .on("click", (e) => {
          e.preventDefault();
          create_edit_table_app($link.text().trim());
        });

      $edit_td.append($edit_button);
    });
  }

  function get_row_status($row) {
    const match = $row.attr("class")?.match(/\baic-row-(\S+)/);
    return match ? match[1] : "unknown";
  }

  function init_progress_bar() {
    const STATUS_KEYS = [
      "completed",
      "unnecessary",
      "ongoing",
      "todo",
      "unknown",
    ];

    $("table")
      .has('tr[class*="aic-row-"]')
      .each(function () {
        const $table = $(this);
        const stats = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));

        const $rows = $table.find('tr[class*="aic-row-"]');

        $rows.each(function () {
          const status = get_row_status($(this));
          const key = status in stats ? status : "unknown";
          stats[key]++;
          if (key === "completed" || key === "unnecessary") {
            $(this).addClass("ainb-row-resolved");
          }
        });

        const total = Object.values(stats).reduce((a, b) => a + b, 0);
        if (!total) return;

        const resolved = stats.completed + stats.unnecessary;
        const percent = Math.round((resolved / total) * 100);
        const active = STATUS_KEYS.filter((key) => stats[key] > 0);

        const segments = active
          .map(
            (key) =>
              `<div class="ainb-seg ainb-seg-${key}" style="width:${(stats[key] / total) * 100}%" title="${stats[key]} ${key}"></div>`,
          )
          .join("");

        const legend = active
          .map(
            (key) =>
              `<span><i class="ainb-dot ainb-seg-${key}"></i>${key} (${stats[key]})</span>`,
          )
          .join("");

        const $bar = $(`
      <div class="ainb-progress-wrap">
        <div class="ainb-progress-top">
          <span class="ainb-progress-percent">${percent}%</span>
          <div class="ainb-progress-top-text">
            <div class="ainb-progress-title">Progress</div>
            <div class="ainb-progress-stats">${resolved} / ${total} resolved</div>
          </div>
        </div>
        <div class="ainb-progress-bar">${segments}</div>
        <div class="ainb-progress-legend">${legend}</div>
        <div class="ainb-progress-credit">Generated by <a href="${mw.util.getUrl("User:DVRTed/AINB-helper")}">AINB-helper</a></div>
        <div class="ainb-progress-hide-row">
          <label><input type="checkbox" class="ainb-hide-resolved-cb"> Hide resolved entries</label>
        </div>
      </div>
    `);

        $bar.find(".ainb-hide-resolved-cb").on("change", function () {
          $table.toggleClass("ainb-hide-resolved", $(this).is(":checked"));
        });

        $table.before($bar);
      });
  }
  const wgPageName = mw.config.get("wgPageName");

  // if we're on an AINB tracking subpage, or the debug page,
  // enable editing rows
  if (
    wgPageName.startsWith("Wikipedia:AI_noticeboard/") ||
    wgPageName === DEBUG_PAGE
  ) {
    init_row_editing();
    init_progress_bar();
  }

  // </nowiki>
});
