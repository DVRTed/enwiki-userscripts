// WikiWho for CCI*
// (* currently only works on GLL's sandboxes)

// reuses "check affected %" feature from [[en:User:DVRTed/AINB-helper]]
// <nowiki>
(() => {
  const title = mw.config.get("wgPageName");

  const WIKIWHO_API =
    "https://wikiwho.wmcloud.org/en/api/v1.0.0-beta/latest_rev_content/";

  let checking = false;

  if (
    !title.startsWith("User:GreenLipstickLesbian/CCI_dashboard") ||
    !title.match(/sandbox/i)
  ) {
    return;
  }

  // loop through all <section>s that contain a lv2 heading
  $("section:has(.mw-heading2)").each(function () {
    const section = $(this);

    // infers username from the first user link
    const user_link = section.find("a[href*='/wiki/User:']").first();
    const href = user_link?.attr("href") || "";
    if (!href) {
      // section doesn't have a link to a user, do nothing
      return;
    }

    const match = href.match(/\/wiki\/User:([^/?#]+)/i);
    if (!match) return;

    const username = decodeURIComponent(match[1].replace(/_/g, " "));

    const lis = section.find("ul li");
    lis.each(function () {
      const li = $(this);

      // first link is a link to the article
      const $a = li.find("a").first();
      // skip red links
      if ($a.hasClass("new")) return;
      const article = $a.text();

      check_affected(li, username, article);
    });
  });

  // reused functions from [[user:DVRTed/AINB-helper.js]]
  function check_affected(li, username, article) {
    const $link = $("<a>")
      .attr("href", "#")
      .text("check affected % (beta)")
      .on("click", async function (e) {
        e.preventDefault();
        if (checking) return;
        checking = true;

        const $span = $("<span>").text("checking...");
        $link.replaceWith($span);

        try {
          let userid;
          if (mw.util.isIPAddress(username, true)) {
            userid = `0|${username}`;
          } else {
            const uq = new URLSearchParams({
              action: "query",
              list: "users",
              ususers: username,
              format: "json",
              origin: "*",
            });
            const udata = await (await fetch(`/w/api.php?${uq}`)).json();
            userid = String(udata.query.users[0]?.userid || "");
            if (!userid) {
              $span.text(`user "${username}" not found`);
              return;
            }
          }

          const wq = new URLSearchParams({
            o_rev_id: false,
            editor: true,
            token_id: false,
            out: false,
            in: false,
          });
          const wdata = await (
            await fetch(`${WIKIWHO_API}${encodeURIComponent(article)}/?${wq}`)
          ).json();
          if (!wdata.success) {
            $span.text("WikiWho API error");
            return;
          }

          const rev_obj = wdata.revisions[0];
          const tokens = rev_obj[Object.keys(rev_obj)[0]].tokens;
          const rel_user_tokens = tokens.filter(
            (t) => t.editor === userid,
          ).length;

          const pct = tokens.length
            ? ((rel_user_tokens / tokens.length) * 100).toFixed(1)
            : "0";
          $span
            .html(
              `<b>${pct}%</b> (${rel_user_tokens}/${tokens.length} tokens) of the current revision's content was authored by <b class="ww-uname"></b>` +
                ` (using WikiWho API)`,
            )
            .find(".ww-uname")
            .text(username); // to prevent (impossible) xss through username
        } catch (err) {
          $span.text("lookup failed");
        } finally {
          checking = false;
        }
      });
    const $wrap = $("<span>").append("· ", $link);

    li.append(" ", $wrap);
  }
})();

// </nowiki>
