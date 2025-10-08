// {{Wikipedia:USync |repo=https://github.com/DVRTed/enwiki-userscripts |ref=refs/heads/prod |path=lintHelper.js}}
"use strict";
/* global mw, $ */
(async () => {
    if (mw.config.get("wgCanonicalNamespace") === "Special")
        return;
    const api = new mw.Api();
    const page_name = mw.config.get("wgPageName");
    async function check_lint_errors() {
        const $indicator = $("<div>")
            .addClass("mw-indicator")
            .attr("id", "lint-error-indicator")
            .html('<span style="color: #666;">Checking lint...</span>');
        $(".mw-indicators").append($indicator);
        const error_categories = [
            "deletable-table-tag",
            "html5-misnesting",
            "misc-tidy-replacement-issues",
            "multiline-html-table-in-list",
            "multiple-unclosed-formatting-tags",
            "pwrap-bug-workaround",
            "self-closed-tag",
            "tidy-font-bug",
            "tidy-whitespace-bug",
            "unclosed-quotes-in-heading",
            "bogus-image-options",
            "fostered",
            "misnested-tag",
            "multi-colon-escape",
            "wikilink-in-extlink",
            "empty-heading",
            "missing-end-tag",
            "missing-end-tag-in-heading",
            "obsolete-tag",
            "stripped-tag",
        ];
        const [lint_data, section_data] = await Promise.all([
            api.get({
                action: "query",
                list: "linterrors",
                lnttitle: page_name,
                lntcategories: error_categories.join("|"),
                format: "json",
                formatversion: 2,
            }),
            api.get({
                action: "parse",
                page: page_name,
                prop: "sections",
                format: "json",
                formatversion: 2,
            }),
        ]);
        const errors = lint_data.query?.linterrors;
        const sections = section_data.parse.sections;
        if (!errors || errors.length === 0) {
            $indicator.html(`<span style="color: green; font-weight: bold;">No lint errors</span>`);
            return;
        }
        const error_text = `Found ${errors.length} lint error${errors.length > 1 ? "s" : ""}`;
        $indicator
            .html(`<span style="color: red; font-weight: bold; cursor: pointer;" 
               id="open_linterror_dialog" title="Click to see detailed lint errors">${error_text}</span>`)
            .on("click", () => show_modal(errors, sections));
    }
    function show_modal(errors, sections) {
        $("#lint-modal").remove();
        const $overlay = $("<div>").attr("id", "lint-modal").css(STYLES.overlay);
        const $modal = $("<div>").css(STYLES.modal);
        const $close_button = $("<button>")
            .text("Close")
            .addClass("mw-ui-button mw-ui-quiet")
            .css(STYLES.close_button)
            .on("click", () => $overlay.remove());
        const $title = $("<h2>")
            .text(`Lint Errors (${errors.length})`)
            .css(STYLES.title);
        const $error_list = $("<div>");
        errors.forEach((error) => {
            const $item = create_error_item(error, sections);
            $error_list.append($item);
        });
        $modal.append($close_button, $title, $error_list);
        $overlay.append($modal);
        $("body").append($overlay);
        $overlay.on("click", (e) => {
            if (e.target === e.currentTarget)
                $overlay.remove();
        });
        $(document).on("keydown.lintModal", (e) => {
            if (e.key === "Escape") {
                $overlay.remove();
                $(document).off("keydown.lintModal");
            }
        });
    }
    function find_section_for_error(error, sections) {
        if (!error.location || !sections)
            return "0";
        const error_start_offset = error.location[0];
        let closest_section = { byteoffset: -1, index: "0" };
        for (const section of sections) {
            if (section.byteoffset > -1 &&
                section.byteoffset <= error_start_offset &&
                section.byteoffset > closest_section.byteoffset) {
                closest_section = section;
            }
        }
        return closest_section.index;
    }
    function create_error_item(error, sections) {
        const $item = $("<div>").css(STYLES.error_item);
        const $chevron = $("<span>").css(STYLES.chevron).html("▶");
        const $header = $("<div>").css(STYLES.header);
        const $category_link = $("<a>")
            .attr("href", `https://www.mediawiki.org/wiki/Help:Lint_errors/${error.category}`)
            .attr("target", "_blank")
            .css({
            color: "#d33",
            textDecoration: "none",
            fontWeight: "bold",
        })
            .text(error.category);
        const $title_section = $("<div>")
            .css(STYLES.title_section)
            .append($chevron, $category_link);
        const $hint = $("<span>").css(STYLES.hint).text("Click to expand");
        const $details = $("<div>").css(STYLES.details);
        const $expanded = $("<div>").css(STYLES.expanded);
        $item.hover(() => $item.css({
            backgroundColor: "#f0f8ff",
            borderColor: "#0645ad",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        }), () => $item.css({
            backgroundColor: "#fafafa",
            borderColor: "#ddd",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }));
        if (error.templateInfo?.name) {
            const template_name = error.templateInfo.name;
            const template_url = mw.util.getUrl(template_name);
            const $template_link = $("<a>")
                .attr("href", template_url)
                .attr("target", "_blank")
                .css({
                color: "#0645ad",
                textDecoration: "none",
                fontWeight: "bold",
            })
                .text(template_name);
            $details.append($("<div>").append("Through the template: ", $template_link));
        }
        if (error.params?.name)
            $details.append(`<div>Element: ${error.params.name}</div>`);
        const $context_area = $("<div>")
            .css(STYLES.context)
            .text("Loading context...");
        const $context_header = $("<div>").css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "5px",
        });
        const $context_label = $("<span>")
            .css({ fontWeight: "bold" })
            .text("Context:");
        const section_number = find_section_for_error(error, sections);
        const edit_url = mw.util.getUrl(page_name, {
            action: "edit",
            section: section_number,
        });
        const $edit_link = $("<a>")
            .attr("href", edit_url)
            .attr("target", "_blank")
            .text("[edit]")
            .css({
            fontWeight: "normal",
            fontSize: "12px",
            textDecoration: "none",
        });
        $context_header.append($context_label, $edit_link);
        $expanded.append($context_header, $context_area);
        $header.append($title_section, $hint);
        $item.append($header, $details, $expanded);
        $item
            .find("a")
            .on("mouseover", function () {
            $(this).css("textDecoration", "underline");
        })
            .on("mouseout", function () {
            $(this).css("textDecoration", "none");
        });
        let is_expanded = false;
        $item.on("click", async (e) => {
            if ($(e.target).is("button") ||
                $(e.target).is("a") ||
                $(e.target).closest("a").length > 0 ||
                window.getSelection().toString().length > 0) {
                return;
            }
            if ($(e.target).closest(".context-area").length > 0) {
                return;
            }
            if (!is_expanded) {
                $expanded.slideDown(200);
                $chevron.css("transform", "rotate(90deg)");
                $hint.text("Click to collapse");
                is_expanded = true;
                await load_context(error, $context_area);
            }
            else {
                $expanded.slideUp(200);
                $chevron.css("transform", "rotate(0deg)");
                $hint.text("Click to expand");
                is_expanded = false;
            }
        });
        return $item;
    }
    async function load_context(error, $context_area) {
        if (!error.location)
            return;
        try {
            const data = await api.get({
                action: "query",
                titles: page_name,
                prop: "revisions",
                rvprop: "content",
                format: "json",
            });
            const page_id = Object.keys(data.query.pages)[0];
            const wikitext = data.query.pages[page_id].revisions[0]["*"];
            const [start, end] = error.location;
            const context_start = Math.max(0, start - 100);
            const context_end = Math.min(wikitext.length, end + 100);
            const before = wikitext.slice(context_start, start);
            const error_text = wikitext.slice(start, end);
            const after = wikitext.slice(end, context_end);
            const $context = $("<span>")
                .append(document.createTextNode(before))
                .append($("<span>")
                .css({
                backgroundColor: "#ffcccc",
                color: "#d33",
                fontWeight: "bold",
            })
                .text(error_text))
                .append(document.createTextNode(after));
            $context_area.empty().append($context).addClass("context-area");
        }
        catch (err) {
            $context_area.text("Error loading context: " + err.message);
        }
    }
    const STYLES = {
        indicator: { color: "#666" },
        success: { color: "green", fontWeight: "bold" },
        error: { color: "red", fontWeight: "bold", cursor: "pointer" },
        overlay: {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: "9999",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        },
        modal: {
            background: "white",
            borderRadius: "8px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            maxWidth: "800px",
            maxHeight: "80vh",
            width: "90%",
            padding: "20px",
            overflowY: "auto",
            overscrollBehavior: "contain",
            position: "relative",
        },
        close_button: { position: "absolute", top: "15px", right: "20px" },
        title: {
            marginTop: "0",
            marginBottom: "20px",
            color: "#333",
            borderBottom: "2px solid #eee",
            paddingBottom: "10px",
        },
        error_item: {
            border: "1px solid #ddd",
            borderRadius: "4px",
            padding: "15px",
            marginBottom: "10px",
            backgroundColor: "#fafafa",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        },
        chevron: {
            display: "inline-block",
            marginRight: "8px",
            transition: "transform 0.2s ease",
            fontSize: "12px",
            color: "#666",
            fontWeight: "bold",
        },
        header: {
            color: "#d33",
            marginBottom: "8px",
            fontSize: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
        },
        title_section: { display: "flex", alignItems: "center" },
        hint: {
            color: "#666",
            fontSize: "12px",
            fontStyle: "italic",
            fontWeight: "normal",
        },
        details: {
            fontFamily: "monospace",
            fontSize: "14px",
            color: "#666",
            marginLeft: "20px",
        },
        expanded: {
            marginTop: "15px",
            paddingTop: "15px",
            borderTop: "1px solid #ddd",
            display: "none",
            marginLeft: "20px",
        },
        context: {
            background: "#f8f9fa",
            border: "1px solid #eee",
            borderRadius: "4px",
            padding: "10px",
            fontFamily: "monospace",
            fontSize: "13px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: "200px",
            overflowY: "auto",
            userSelect: "text",
            cursor: "text",
        },
    };
    await mw.loader.using(["mediawiki.api", "mediawiki.util"]);
    await check_lint_errors();
})();
