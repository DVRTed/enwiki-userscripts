//<nowiki>
// adds "move to subpage" buttons to the sections on the WP:AI noticeboard

// it's based on [[User:DVRTed/move-talk-section]]

(async () => {
  const current_page = mw.config.get("wgPageName")?.replace(/_/g, " ");
  if (!current_page.startsWith("Wikipedia:AI noticeboard")) return;

  await mw.loader.using(["mediawiki.api", "mediawiki.util"]);

  const SCRIPT_TAG =
    "(using [[User:DVRTed/sandbox/move_AINB_cases_to_subpages.js|a script]])";
  const BLANK_REPORT_PAGE = "Wikipedia:AI noticeboard/AINB/Blank report";

  const get_section_data = async (section_id, section_title) => {
    const api = new mw.Api();
    const page_data = await api.get({
      action: "parse",
      page: current_page,
      prop: "wikitext",
      section: section_id,
    });

    const wikitext = page_data?.parse?.wikitext?.["*"];
    if (!wikitext) return;

    const heading_match = wikitext.match(/^==[^=]+==\s*/);
    const heading_wikitext = heading_match
      ? heading_match[0].trim()
      : `== ${section_title} ==`;
    const raw_wikitext = heading_match
      ? wikitext.slice(heading_match[0].length).trim()
      : wikitext.trim();

    const content_wikitext = raw_wikitext.replace(
      /{{AIC status\|.+}}\n*/gim,
      "",
    );

    return { heading_wikitext, content_wikitext };
  };

  const handle_move = async ($link, section_title, section_id) => {
    const default_user = section_title.replace(/^User:/i, "").trim();
    // default is inferred from the section title
    const username = prompt(
      "Move section to subpage (Wikipedia:AI noticeboard/<Username>). Type the username here:",
      default_user,
    )?.trim();

    if (!username) {
      return;
    }

    const target_page = `Wikipedia:AI noticeboard/${username}`;

    $link.text(" [moving...] ").css("pointer-events", "none");
    mw.notify(`Moving section to "${target_page}"...`);

    try {
      const section_data = await get_section_data(section_id, section_title);
      if (!section_data) {
        throw new Error("Could not retrieve section content.");
      }

      const { heading_wikitext, content_wikitext } = section_data;
      const api = new mw.Api();

      // preload the blank report template
      const preload_data = await api.get({
        action: "parse",
        page: BLANK_REPORT_PAGE,
        prop: "wikitext",
      });
      const preload_text = preload_data?.parse?.wikitext?.["*"];
      if (!preload_text) {
        throw new Error("Could not retrieve the preload");
      }

      const links = `{{Userlinks|${username}}}\n\n`;
      const page_text = preload_text
        .replace("$1", () => "analysis")
        .replace("$2", () => "review")
        .replace("$3", () => "undetermined")
        .replace("$4", () => username)
        .replace("$6", () => "user")
        .replace("<noinclude/>", "")
        .replace(/<noinclude>.*<\/noinclude>/, "")

        .replace("$5", () => links + content_wikitext);

      await api.postWithEditToken({
        action: "edit",
        title: target_page,
        text: page_text,
        createonly: true,
        summary: `Moved discussion from [[${current_page}]] ${SCRIPT_TAG}`,
      });

      await api.postWithEditToken({
        action: "edit",
        title: current_page,
        section: section_id,
        text: `${heading_wikitext}\n{{Moved discussion to|${target_page}}}`,
        summary: `Moved discussion to [[${target_page}]] ${SCRIPT_TAG}`,
      });

      mw.notify(
        `Successfully moved section to "${target_page}". Reloading...`,
        {
          type: "success",
        },
      );

      setTimeout(() => {
        location.reload();
      }, 1500);
    } catch (error) {
      console.error("Error moving section:", error);
      mw.notify(`Failed to move section: ${error.message || error}`, {
        type: "error",
      });
      $link.text(" [move to subpage] ").css("pointer-events", "auto");
    }
  };

  const add_links = () => {
    const $headings = $(".mw-heading2").length ? $(".mw-heading2") : $("h2");

    $headings.each((_, heading) => {
      const $heading = $(heading);
      const $h2 = $heading.is("h2") ? $heading : $heading.find("h2").first();
      const $edit_link = $heading
        .find(".mw-editsection a[href*='section=']")
        .first();

      const section_title = $h2.text().trim();
      const section_id = $edit_link.attr("href")?.match(/section=(\d+)/)?.[1];

      if (!section_title || !section_id) {
        return;
      }

      const $move_link = $("<a>", {
        href: "#",
        class: "move-ainb-subpage-link",
        text: " [move to subpage] ",
      }).on("click", function (e) {
        e.preventDefault();
        handle_move($(this), section_title, section_id);
      });

      $heading.find(".mw-editsection").first().append($move_link);
    });
  };

  $(add_links);
})();

//</nowiki>
