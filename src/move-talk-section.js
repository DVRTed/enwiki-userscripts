/*
    Script to automate moving sections of discussions from a page to another, 
    using both [[:Template:Moved discussion to]] and [[:Template:Moved discussion from]],
     and notifying the OP (optionally).
    <nowiki>
*/

/* global mw, OO, $ */

(async () => {
  const title = mw.config.get("wgPageName").replace(/_/g, " ");

  const is_valid_page = (page_title, namespace_number) => {
    // talk namespaces are odd numbered
    const is_a_talk_page = namespace_number % 2 === 1;

    // matches: noticeboards, (specific) village pump pages,  Teahouse, Help desk,
    //  and subpages of Reference desk
    const is_discussion_board =
      /^Wikipedia:(Village pump \([^)/]+\)|Teahouse|Help desk|[^/\n]*\bnoticeboard\b(?:\/[^/\n]+)?|Reference desk\/.+)$/i.test(
        page_title
      );

    return is_a_talk_page || is_discussion_board;
  };

  if (!is_valid_page(title, mw.config.get("wgNamespaceNumber"))) {
    return;
  }

  await mw.loader.using([
    "oojs-ui-core",
    "oojs-ui-windows",
    "oojs-ui-widgets",
    "mediawiki.widgets",
  ]);

  const SCRIPT_TAG =
    "(using [[User:DVRTed/move-talk-section|move-talk-section]])";
  const USER_SIGNATURE = "~~" + "~~";

  const SECTION_AUTHOR_REGEX =
    /\[\[(?:User|User talk):([^\]|]+)(?:[^\]])*\]\][^\n]*\d{1,2}:\d{2}, \d{1,2} [A-Za-z]+ \d{4} \(UTC\)/i;

  const add_links = () => {
    // loop through level 2 headings, ie, == yello ==
    $(".mw-heading2").each((_, heading) => {
      const $h2 = $(heading).find("h2").first();
      const $edit_link = $(heading)
        .find(".mw-editsection a[href*='section=']")
        .first();

      const section_title = $h2.text().trim();

      // gets section id from the "edit section" link;
      // at the moment, I can't think of a better way that doesn't involve making
      // multiple API calls on page load just to get section ids
      const section_id = $edit_link.attr("href")?.match(/section=(\d+)/)?.[1];

      if (!section_title || !section_id) {
        console.error("Could not get section title or id.", {
          section_title,
          section_id,
        });
        return;
      }

      const $move_link = $("<a>", {
        href: "#",
        class: "move-section-link",
        text: " [move section] ",
      }).on("click", function (e) {
        e.preventDefault();
        show_move_dialog(section_title, section_id);
      });

      $(heading).find(".mw-editsection").first().append($move_link);
    });
  };

  const show_move_dialog = async (section_title, section_id) => {
    const dialog = generate_move_dialog(section_title, section_id, null, true);

    const current_section = await get_current_section(section_id);
    if (!current_section) {
      dialog.close();
      alert("Could not retrieve current section content.");
      return;
    }

    const author_match = current_section.match(SECTION_AUTHOR_REGEX);
    const op_user = author_match
      ? $("<div>").html(author_match[1]).text().trim()
      : null;
    // update dialog w/ content ie author username and disable loading state
    dialog.update_content(op_user, current_section, false);
  };

  const generate_move_dialog = (
    section_title,
    section_id,
    op_user,
    is_loading = false
  ) => {
    class MoveDialog extends OO.ui.ProcessDialog {
      initialize() {
        super.initialize();
        this.is_loading = is_loading;
        this.loading_text = "Loading...";
        this.section_title = section_title;
        this.section_id = section_id;
        this.render_content(op_user);
      }

      render_content(op_user) {
        this.$body.empty();

        if (this.is_loading) {
          this.$body.append(
            $("<div>")
              .css({ padding: "20px", textAlign: "center" })
              .html(this.loading_text)
          );
          return;
        }

        this.new_section_input = new OO.ui.TextInputWidget({
          value: this.section_title,
        });
        this.target_input = new mw.widgets.TitleInputWidget({
          placeholder:
            "Target page (e.g. Wikipedia:Reference desk/Science or WP:TH)",
          showDescriptions: true,
          required: true,
        });
        this.follow_redirect = new OO.ui.CheckboxInputWidget({
          selected: true,
        });
        this.notify_op = new OO.ui.CheckboxInputWidget({ selected: false });

        const input_items = [
          new OO.ui.FieldLayout(this.new_section_input, {
            label: "New section title:",
            align: "top",
          }),
          new OO.ui.FieldLayout(this.target_input, {
            label: "Move to:",
            align: "top",
          }),
          new OO.ui.FieldLayout(this.follow_redirect, {
            label: "Follow redirects",
            align: "inline",
          }),
        ];

        if (op_user) {
          input_items.push(
            new OO.ui.FieldLayout(this.notify_op, {
              label: `Notify OP (User:${op_user})`,
              align: "inline",
            })
          );
          this.op_user = op_user;
        }

        this.$body.append(
          new OO.ui.PanelLayout({
            padded: true,
            expanded: false,
          }).$element.append(
            new OO.ui.FieldsetLayout({
              items: input_items,
            }).$element
          )
        );
      }

      update_content(
        op_user,
        section_content = null,
        is_loading = false,
        loading_text = null
      ) {
        this.is_loading = is_loading;
        if (loading_text) this.loading_text = loading_text;
        if (section_content) this.section_content = section_content;
        this.render_content(op_user);
        this.updateSize();
      }

      getActionProcess(action) {
        if (action === "move") {
          return new OO.ui.Process(async () => {
            const target = this.target_input.getValue();
            if (!target) {
              return;
            }

            move_section({
              dialog: this,
              target_page: target,
              section_content: this.section_content,
              new_section_title: this.new_section_input.getValue(),
              old_section_title: this.section_title,
              notify_op: this.notify_op.isSelected(),
              op_user: this.op_user,
              follow_redirect: this.follow_redirect.isSelected(),
              section_id: this.section_id,
            });
          });
        }
        return super.getActionProcess(action);
      }
    }

    MoveDialog.static.name = "moveDialog";
    MoveDialog.static.title = "Move section";
    MoveDialog.static.actions = [
      { action: "move", label: "Move", flags: ["primary", "progressive"] },
      { label: "Cancel", flags: "safe" },
    ];

    const wm = new OO.ui.WindowManager();
    $(document.body).append(wm.$element);
    const move_dialog = new MoveDialog({ size: "medium" });
    wm.addWindows([move_dialog]);
    wm.openWindow("moveDialog");

    return move_dialog;
  };

  const move_section = async ({
    dialog,
    target_page,
    section_content,
    section_id,
    new_section_title,
    old_section_title,
    notify_op,
    op_user,
    follow_redirect,
  }) => {
    try {
      dialog.actions.get({ actions: ["move"] }).forEach((action) => {
        action.setDisabled(true);
      });
      let progress_text = `Moving section to "${target_page}"...`;

      const api = new mw.Api();
      const current_page = mw.config.get("wgPageName");

      // resolve redirs
      let final_target = target_page;
      let target_namespace = null;
      if (follow_redirect) {
        const redirect_data = await api.get({
          action: "query",
          titles: target_page,
          redirects: true,
        });

        if (
          redirect_data.query.redirects &&
          redirect_data.query.redirects.length > 0
        ) {
          final_target = redirect_data.query.redirects[0].to;
          progress_text += `<br>Resolved redirect to "${final_target}")`;
        }

        const pages = redirect_data.query.pages;
        const page_id = Object.keys(pages)[0];
        target_namespace = pages[page_id].ns;
      } else {
        const page_data = await api.get({
          action: "query",
          titles: target_page,
        });
        const pages = page_data.query.pages;
        const page_id = Object.keys(pages)[0];
        target_namespace = pages[page_id].ns;
      }

      if (!is_valid_page(final_target, target_namespace)) {
        mw.notify(
          `The destination page "${final_target}" is not a valid talk page or discussion board.`,
          { type: "error" }
        );
        dialog.actions.get({ actions: ["move"] }).forEach((action) => {
          action.setDisabled(false);
        });
        return;
      }

      progress_text += `<br>Appending section to target page: "${final_target}"...`;
      dialog.update_content(null, null, true, progress_text);

      // append to target page
      await api.postWithEditToken({
        action: "edit",
        title: final_target,
        appendtext: `\n\n== ${new_section_title} ==\n{{Moved discussion from|${current_page}#${old_section_title}|2=${USER_SIGNATURE}}}\n\n${section_content}`,
        summary: `Moved discussion from [[${current_page}]] ${SCRIPT_TAG}`,
      });

      progress_text += `<br>Removing section from current page...`;
      dialog.update_content(null, null, true, progress_text);

      // replace current section content w/ template
      await api.postWithEditToken({
        action: "edit",
        title: current_page,
        section: section_id,
        text: `== ${old_section_title} ==\n{{Moved discussion to|${final_target}#${new_section_title}|2=${USER_SIGNATURE}}}`,
        summary: `Moved discussion to [[${final_target}]] ${SCRIPT_TAG}`,
      });

      // notify OP if selected
      if (notify_op && op_user) {
        progress_text += `<br>Notifying OP: User:${op_user}...`;
        dialog.update_content(null, null, true, progress_text);

        const user_talk_page = `User talk:${op_user}`;
        let user_talk_namespace = null;
        try {
          const user_talk_data = await api.get({
            action: "query",
            titles: user_talk_page,
          });
          const user_talk_pages = user_talk_data.query.pages;
          const user_talk_page_id = Object.keys(user_talk_pages)[0];
          user_talk_namespace = user_talk_pages[user_talk_page_id].ns;
        } catch (e) {
          console.error("Error fetching user talk page data:", e);
        }

        if (user_talk_namespace !== 3) {
          mw.notify(
            `Cannot notify: User talk:${op_user} is not a valid user talk page.`,
            { type: "warn" }
          );
        } else {
          const notification_text =
            `Hi ${op_user}, I have moved the discussion you started` +
            ` at {{Section link|${current_page}|${old_section_title}}} to '''{{Section link|${final_target}|${new_section_title}}}'''` +
            ` as the latter seemed more appropriate; please check the new location for any responses. ${USER_SIGNATURE}`;
          await api.postWithEditToken({
            action: "edit",
            title: user_talk_page,
            appendtext: `\n\n== Discussion moved ==\n${notification_text}`,
            summary: "Notifying about moved discussion section " + SCRIPT_TAG,
          });
        }
      }
      progress_text += `<br>Moved! Reloading page...`;

      dialog.update_content(null, null, true, progress_text);
      setTimeout(() => {
        location.reload();
      }, 3000);
    } catch (error) {
      console.error("Error moving section:", error);
      dialog.update_content(
        null,
        null,
        true,
        `<span style="color: red;">Error: Failed to move section. ${
          error.message || "Unknown error occurred."
        }</span>`
      );
      dialog.actions.get({ actions: ["move"] }).forEach((action) => {
        action.setDisabled(false);
      });
    }
  };

  const get_current_section = async (section_id) => {
    const api = new mw.Api();
    const current_page = mw.config.get("wgPageName");

    const page_data = await api.get({
      action: "parse",
      page: current_page,
      prop: "wikitext",
      section: section_id,
    });

    const wikitext = page_data.parse.wikitext["*"];
    const section_without_heading = wikitext.replace(/^==[^=]+==\s*\n?/, "");

    return section_without_heading;
  };

  // init the script
  add_links();
})();
