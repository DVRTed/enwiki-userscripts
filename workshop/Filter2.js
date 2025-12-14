// Adds advanced filters to Contribution and Page History pages
// ([[Special:Contributions]], [[Special:History]])

/* global mw, OO, $ */

(function () {
  "use strict";

  const CONFIG = {
    DEBOUNCE_TIME: 300,
    STORAGE_KEY: "advancedFiltersExpanded",
    PAGES: {
      CONTRIB: {
        listSelector: ".mw-contributions-list:first",
        itemSelector: ".mw-contributions-list li",
        titleSelector: ".mw-contributions-title",
      },
      HISTORY: {
        listSelector: "#pagehistory",
        itemSelector: "#pagehistory li",
        titleSelector: "N/A",
      },
    },
  };

  const NAMESPACES = mw.config.get("wgFormattedNamespaces");

  const pageType = $(CONFIG.PAGES.HISTORY.listSelector).length
    ? "HISTORY"
    : $(CONFIG.PAGES.CONTRIB.listSelector).length
    ? "CONTRIB"
    : null;
  if (!pageType) return;

  const isContrib = pageType === "CONTRIB";

  const selectors = CONFIG.PAGES[pageType];
  let items = [];
  let namespaces = new Set();
  let tags = new Set();
  let users = new Set();
  let widgets = {};

  // this is used for debouncing summary filtering to
  // avoid re-filtering on every keystroke
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function getNamespace(title) {
    const titleObj = new mw.Title(title);
    return NAMESPACES[titleObj.getNamespaceId()] || "Main";
  }

  function extractTags($item) {
    return $item
      .find(".mw-tag-marker")
      .map((_, tag) => $(tag).text().trim())
      .get();
  }

  function getItemData($item) {
    const $title = isContrib ? $item.find(selectors.titleSelector) : "";
    const $summary = $item.find(".comment");
    const $userLink = $item.find(".mw-userlink");

    const title = $title.length ? $title.text().trim() : "";
    const summary = $summary.text().trim();
    const itemTags = extractTags($item);
    const namespace = title ? getNamespace(title) : "";
    const user = $userLink.length ? $userLink.text().trim() : "";

    return { title, summary, tags: itemTags, namespace, user };
  }

  function initializeData() {
    $(selectors.itemSelector).each((_, item) => {
      const $item = $(item);
      const data = getItemData($item);

      namespaces.add(data.namespace);
      data.tags.forEach((tag) => tags.add(tag));
      if (data.user) users.add(data.user);

      items.push({ element: item, data });
    });
  }

  function createMultiSelectFilter(label, placeholder, optionsArray, onChange) {
    const selector = new OO.ui.MenuTagMultiselectWidget({
      placeholder,
      options: optionsArray.map((item) =>
        typeof item === "string" ? { data: item, label: item } : item
      ),
      input: { autocomplete: "off" },
    });

    selector.on("change", onChange);

    return new OO.ui.FieldLayout(selector, { label, align: "top" });
  }

  function createNamespaceFilter() {
    const sortedNs = Array.from(namespaces).sort((a, b) =>
      a === "Main" ? -1 : b === "Main" ? 1 : a.localeCompare(b)
    );

    return createMultiSelectFilter(
      "Namespaces",
      "Select namespaces...",
      sortedNs,
      applyFilters
    );
  }

  function createTagFilter() {
    if (tags.size === 0) return null;

    const options = [
      { data: "none", label: "None (untagged)" },
      ...Array.from(tags).sort(),
    ];

    return createMultiSelectFilter(
      "Tags",
      "Select tags...",
      options,
      applyFilters
    );
  }

  function createUserFilter() {
    if (users.size === 0) return null;

    const sortedUsers = Array.from(users).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    return createMultiSelectFilter(
      "Users",
      "Select users...",
      sortedUsers,
      applyFilters
    );
  }

  function createSummaryFilter() {
    const input = new OO.ui.TextInputWidget({
      placeholder: "Filter by edit summary...",
      icon: "search",
    });

    const regexToggle = new OO.ui.ToggleSwitchWidget();

    const errorMessage = new OO.ui.MessageWidget({
      type: "error",
      inline: true,
    });
    errorMessage.$element.css({
      display: "none",
      marginTop: "1em",
    });

    input.on("change", debounce(applyFilters, CONFIG.DEBOUNCE_TIME));
    regexToggle.on("change", applyFilters);

    const $container = $("<div>")
      .append(
        $("<div>")
          .css("marginTop", "1em")
          .append(
            new OO.ui.FieldLayout(input, {
              label: "Edit summary",
              align: "top",
            }).$element
          )
          .append(errorMessage.$element)
      )
      .append(
        $("<div>")
          .css("marginTop", "1em")
          .append(
            new OO.ui.FieldLayout(regexToggle, {
              label: "Use regex",
              align: "inline",
            }).$element
          )
      );

    return { container: $container, input, regexToggle, errorMessage };
  }

  function saveCollapsedState(isExpanded) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, isExpanded ? "true" : "false");
    } catch (e) {
      console.error("Failed to save filter panel state:", e);
    }
  }

  function getCollapsedState() {
    try {
      const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  }

  function createUI() {
    const nsFilter = isContrib ? createNamespaceFilter() : null;
    const tagFilter = createTagFilter();
    const userFilter = !isContrib ? createUserFilter() : null;
    const summaryFilter = createSummaryFilter();

    widgets = {
      nsSelector: nsFilter?.fieldWidget,
      tagSelector: tagFilter?.fieldWidget,
      userSelector: userFilter?.fieldWidget,
      summaryInput: summaryFilter.input,
      regexToggle: summaryFilter.regexToggle,
      regexError: summaryFilter.errorMessage,
      statsLabel: new OO.ui.LabelWidget({ label: "" }),
    };

    const resetButton = new OO.ui.ButtonWidget({
      label: "Reset all filters",
      flags: ["progressive", "secondary"],
    });

    resetButton.on("click", resetFilters);

    const $footer = $("<div>")
      .css({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: "1em",
        paddingTop: "1em",
      })
      .append(widgets.statsLabel.$element, resetButton.$element);

    const innerFieldset = new OO.ui.FieldsetLayout();

    if (nsFilter) innerFieldset.addItems([nsFilter]);
    if (tagFilter) innerFieldset.addItems([tagFilter]);
    if (userFilter) innerFieldset.addItems([userFilter]);
    innerFieldset.$element.append(summaryFilter.container);
    innerFieldset.$element.append($footer);

    const fieldset = new OO.ui.FieldsetLayout({
      label: "Advanced filters",
    });

    const isExpanded = getCollapsedState();

    fieldset.$element
      .addClass("mw-collapsibleFieldsetLayout")
      .addClass("mw-collapsible");

    if (!isExpanded) {
      fieldset.$element.addClass("mw-collapsed");
    }

    // make the header itself the toggle button
    fieldset.$header.addClass("mw-collapsible-toggle").attr({
      role: "button",
      tabindex: "0",
      "aria-expanded": isExpanded ? "true" : "false",
    });

    if (!isExpanded) {
      fieldset.$header.addClass("mw-collapsible-toggle-collapsed");
    } else {
      fieldset.$header.addClass("mw-collapsible-toggle-expanded");
    }

    const expandIcon = new OO.ui.IconWidget({
      icon: "expand",
      label: "show",
    });
    const collapseIcon = new OO.ui.IconWidget({
      icon: "collapse",
      label: "hide",
    });

    fieldset.$header.append(expandIcon.$element, collapseIcon.$element);

    // rm the default group w/ our
    // content wrapped in .mw-collapsible-content
    fieldset.$group.remove();
    const $content = $("<div>")
      .addClass("oo-ui-fieldsetLayout-group")
      .addClass("mw-collapsible-content")
      .append(innerFieldset.$element);

    if (!isExpanded) {
      $content.attr("hidden", "until-found");
    }

    fieldset.$element.append($content);

    const panel = new OO.ui.PanelLayout({
      expanded: false,
      framed: true,
      padded: true,
    });

    panel.$element.append(fieldset.$element);
    $(selectors.listSelector).before(panel.$element);

    mw.loader.using("jquery.makeCollapsible", function () {
      fieldset.$element.makeCollapsible({
        collapsed: !isExpanded,
      });

      fieldset.$element.on("beforeExpand.mw-collapsible", function () {
        saveCollapsedState(true);
      });

      fieldset.$element.on("beforeCollapse.mw-collapsible", function () {
        saveCollapsedState(false);
      });
    });
  }

  // summary match with regex support;
  // throws "REGEX_ERROR" error if invalid regex
  function matchesSummary(summary, filter, useRegex) {
    if (!filter) return true;
    try {
      return useRegex
        ? new RegExp(filter, "i").test(summary)
        : summary.toLowerCase().includes(filter.toLowerCase());
    } catch (e) {
      const err = new Error(e.message);
      err.code = "REGEX_ERROR";
      throw err;
    }
  }

  function itemPassesFilters(data, filters) {
    const { selectedNs, selectedTags, selectedUsers, summaryFilter, useRegex } =
      filters;

    // namespace filter
    if (selectedNs.length > 0 && !selectedNs.includes(data.namespace)) {
      return false;
    }

    // tag filter
    if (selectedTags.length > 0) {
      const hasNoTags = data.tags.length === 0;
      const matchesTag = data.tags.some((tag) => selectedTags.includes(tag));

      if (hasNoTags ? !selectedTags.includes("none") : !matchesTag) {
        return false;
      }
    }

    // user filter
    if (selectedUsers.length > 0 && !selectedUsers.includes(data.user)) {
      return false;
    }

    // summary filter w/out regex
    if (
      summaryFilter &&
      !matchesSummary(data.summary, summaryFilter, useRegex)
    ) {
      return false;
    }

    return true;
  }

  function applyFilters() {
    const filters = {
      selectedNs: widgets.nsSelector?.getValue() || [],
      selectedTags: widgets.tagSelector?.getValue() || [],
      selectedUsers: widgets.userSelector?.getValue() || [],
      summaryFilter: widgets.summaryInput.getValue() || "",
      useRegex: widgets.regexToggle.getValue(),
    };

    let visibleCount = 0;
    let hasRegexError = false;

    for (const { element, data } of items) {
      try {
        const show = itemPassesFilters(data, filters);
        element.style.display = show ? "" : "none";
        if (show) visibleCount++;
      } catch (e) {
        if (e.code === "REGEX_ERROR") {
          hasRegexError = true;
          // hide all elements if regex is invalid
          for (const { element: el } of items) {
            el.style.display = "none";
          }
          widgets.regexError.setLabel(
            `Invalid regular expression: ${e.message}`
          );
          console.log("Regex error in filter:", e.message);
          break;
        } else {
          throw e;
        }
      }
    }

    widgets.regexError.$element.css("display", hasRegexError ? "" : "none");

    let text;
    if (visibleCount === items.length) {
      text = `Showing all ${items.length} items`;
    } else {
      text = `Showing ${visibleCount} of ${items.length} items`;
    }
    widgets.statsLabel.setLabel(text);
  }

  function resetFilters() {
    widgets.nsSelector?.setValue([]);
    widgets.tagSelector?.setValue([]);
    widgets.userSelector?.setValue([]);
    widgets.summaryInput.setValue("");
    widgets.regexToggle.setValue(false);
    applyFilters();
  }

  function init() {
    mw.loader.using(["oojs-ui-core", "oojs-ui-widgets"], () => {
      initializeData();
      createUI();
      applyFilters();
    });
  }

  $(init);
})();
