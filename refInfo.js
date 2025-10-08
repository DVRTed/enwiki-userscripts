// {{Wikipedia:USync |repo=https://github.com/DVRTed/enwiki-userscripts |ref=refs/heads/prod |path=refInfo.js}}
"use strict";
/*
Shows {{Ref info}} of the current page in a dialog box
when "Show ref info" is clicked in the Tools section.
*/
/* global mw, $ */
(async () => {
    await mw.loader.using([
        "oojs-ui-core",
        "oojs-ui-windows",
        "mediawiki.api",
        "jquery.makeCollapsible",
    ]);
    async function show_page_refinfo() {
        const current_page = mw.config.get("wgPageName");
        try {
            const data = await new mw.Api().get({
                action: "parse",
                text: `{{Ref info|${current_page}}}`,
                contentmodel: "wikitext",
                formatversion: 2,
            });
            const $html = $("<div>").html(data.parse.text);
            $html.find(".mw-collapsible").makeCollapsible();
            await OO.ui.alert($html);
        }
        catch (err) {
            OO.ui.alert("Failed to fetch ref info.");
            console.error(err);
        }
    }
    window.document.getElementById("kek");
    if (mw.config.get("wgCanonicalNamespace") !== "Special") {
        mw.util
            .addPortletLink("p-tb", "#", "Show ref info", "pt-refinfo", "Shows ref info of a page")
            ?.addEventListener("click", function (e) {
            e.preventDefault();
            show_page_refinfo();
        });
    }
})();
