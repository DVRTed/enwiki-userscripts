// Wikipedia History and Contributions Filter
// Filters by namespace, tags, and edit summary
// Add to Special:MyPage/common.js

(function () {
  "use strict";

  const CONFIG = {
    DEBOUNCE_TIME: 300,
    NAMESPACES: {
      "-2": "Media",
      "-1": "Special",
      0: "Main",
      1: "Talk",
      2: "User",
      3: "User talk",
      4: "Wikipedia",
      5: "Wikipedia talk",
      6: "File",
      7: "File talk",
      8: "MediaWiki",
      9: "MediaWiki talk",
      10: "Template",
      11: "Template talk",
      12: "Help",
      13: "Help talk",
      14: "Category",
      15: "Category talk",
      100: "Portal",
      101: "Portal talk",
      108: "Book",
      109: "Book talk",
      118: "Draft",
      119: "Draft talk",
      710: "TimedText",
      711: "TimedText talk",
      828: "Module",
      829: "Module talk",
      2300: "Gadget",
      2301: "Gadget talk",
      2302: "Gadget definition",
      2303: "Gadget definition talk",
    },
  };

  // Detect page type
  const isContribPage =
    document.querySelector(".mw-contributions-list") !== null;
  const isHistoryPage = document.querySelector("#pagehistory") !== null;

  if (!isContribPage && !isHistoryPage) return;

  let items = [];
  let namespaces = new Set();
  let tags = new Set();

  // Utility functions
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function getNamespace(title) {
    const colonIndex = title.indexOf(":");
    if (colonIndex === -1) return "Main";

    const prefix = title.substring(0, colonIndex);

    // Check if it's a timestamp (hh:mm format)
    if (/^\d{1,2}:\d{2}$/.test(prefix)) return "Main";

    // Check against known namespaces
    const knownNamespaces = new Set(Object.values(CONFIG.NAMESPACES));
    return knownNamespaces.has(prefix) ? prefix : "Main";
  }

  function getItemData(item) {
    let title = "";
    let summary = "";
    let itemTags = [];

    if (isContribPage) {
      const titleElem = item.querySelector(".mw-contributions-title");
      title = titleElem ? titleElem.textContent.trim() : "";

      const summaryElem = item.querySelector(".comment");
      summary = summaryElem ? summaryElem.textContent.trim() : "";

      itemTags = Array.from(item.querySelectorAll(".mw-tag-marker")).map(
        (tag) => tag.textContent.replace(/[[\]]/g, "").trim()
      );
    } else {
      const link = item.querySelector("a.mw-changeslist-title");
      title = link ? link.textContent.trim() : "";

      const summaryElem = item.querySelector(".comment");
      summary = summaryElem ? summaryElem.textContent.trim() : "";

      itemTags = Array.from(item.querySelectorAll(".mw-tag-marker")).map(
        (tag) => tag.textContent.replace(/[[\]]/g, "").trim()
      );
    }

    const namespace = getNamespace(title);

    return { title, summary, tags: itemTags, namespace };
  }

  function initializeData() {
    const selector = isContribPage
      ? ".mw-contributions-list li"
      : "#pagehistory li";
    items = Array.from(document.querySelectorAll(selector));

    items.forEach((item) => {
      const data = getItemData(item);
      namespaces.add(data.namespace);
      data.tags.forEach((tag) => tags.add(tag));
      item._filterData = data;
    });
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
            .wiki-filter-container {
                margin: 1em 0;
                background: #f8f9fa;
                border: 1px solid #a2a9b1;
                border-radius: 2px;
            }
            .wiki-filter-section {
                border-bottom: 1px solid #e3e6e8;
            }
            .wiki-filter-section:last-child {
                border-bottom: none;
            }
            .wiki-filter-header {
                padding: 0.6em 0.8em;
                background: #eaecf0;
                cursor: pointer;
                user-select: none;
                display: flex;
                align-items: center;
                font-weight: 500;
            }
            .wiki-filter-header:hover {
                background: #e3e6e8;
            }
            .wiki-filter-toggle {
                margin-right: 0.5em;
                transition: transform 0.2s;
                display: inline-block;
            }
            .wiki-filter-enable {
                cursor: pointer;
                margin: 0;
            }
            .wiki-filter-content {
                padding: 0.8em;
            }
            .wiki-filter-checkboxes {
                display: flex;
                flex-wrap: wrap;
                gap: 0.8em;
                margin: 0.5em 0;
            }
            .wiki-filter-checkbox {
                white-space: nowrap;
            }
            .wiki-filter-checkbox input {
                margin-right: 0.3em;
            }
            .wiki-filter-buttons {
                display: flex;
                gap: 0.5em;
                margin-bottom: 0.8em;
            }
            .wiki-filter-btn {
                padding: 0.4em 0.8em;
                background: #fff;
                border: 1px solid #a2a9b1;
                border-radius: 2px;
                cursor: pointer;
                font-size: 0.9em;
            }
            .wiki-filter-btn:hover {
                background: #f8f9fa;
            }
            .wiki-filter-input {
                width: 100%;
                padding: 0.5em;
                border: 1px solid #a2a9b1;
                border-radius: 2px;
                font-size: 0.95em;
                box-sizing: border-box;
            }
            .wiki-filter-regex-option {
                margin-top: 0.5em;
                font-size: 0.9em;
            }
            .wiki-filter-regex-option input {
                margin-right: 0.3em;
            }
            .wiki-filter-stats {
                margin-top: 0.8em;
                padding: 0.5em;
                background: #fff;
                border: 1px solid #e3e6e8;
                border-radius: 2px;
                font-size: 0.9em;
                color: #54595d;
            }
        `;
    document.head.appendChild(style);
  }

  function createCollapsibleSection(title) {
    const expanded = true;

    const section = document.createElement("div");
    section.className = "wiki-filter-section";

    const header = document.createElement("div");
    header.className = "wiki-filter-header";

    const toggle = document.createElement("span");
    toggle.className = "wiki-filter-toggle";
    toggle.textContent = "▼";

    const enableCheckbox = document.createElement("input");
    enableCheckbox.type = "checkbox";
    enableCheckbox.className = "wiki-filter-enable";
    enableCheckbox.checked = false;
    enableCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      applyFilters();
    });

    const heading = document.createElement("span");
    heading.textContent = title;
    heading.style.marginLeft = "0.5em";

    header.appendChild(toggle);
    header.appendChild(enableCheckbox);
    header.appendChild(heading);

    const content = document.createElement("div");
    content.className = "wiki-filter-content";

    section.appendChild(header);
    section.appendChild(content);

    function setExpanded(exp) {
      toggle.style.transform = exp ? "" : "rotate(-90deg)";
      content.style.display = exp ? "" : "none";
    }

    header.addEventListener("click", (e) => {
      if (e.target === enableCheckbox) return;
      const newState = content.style.display === "none";
      setExpanded(newState);
    });

    setExpanded(expanded);
    return { section, content, enableCheckbox };
  }

  function createButtons(parent, checkboxSelector) {
    const container = document.createElement("div");
    container.className = "wiki-filter-buttons";

    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.textContent = "Select all";
    selectAll.className = "wiki-filter-btn";
    selectAll.addEventListener("click", (e) => {
      e.preventDefault();
      parent
        .querySelectorAll(checkboxSelector)
        .forEach((cb) => (cb.checked = true));
      applyFilters();
    });

    const selectNone = document.createElement("button");
    selectNone.type = "button";
    selectNone.textContent = "Select none";
    selectNone.className = "wiki-filter-btn";
    selectNone.addEventListener("click", (e) => {
      e.preventDefault();
      parent
        .querySelectorAll(checkboxSelector)
        .forEach((cb) => (cb.checked = false));
      applyFilters();
    });

    container.appendChild(selectAll);
    container.appendChild(selectNone);
    return container;
  }

  function createNamespaceSection() {
    const { section, content } = createCollapsibleSection(
      "Filter by namespace",
      "nsExpanded"
    );

    const checkboxContainer = document.createElement("div");
    checkboxContainer.className = "wiki-filter-checkboxes";

    const sortedNs = Array.from(namespaces).sort((a, b) =>
      a === "Main" ? -1 : b === "Main" ? 1 : a.localeCompare(b)
    );

    sortedNs.forEach((ns) => {
      const label = document.createElement("label");
      label.className = "wiki-filter-checkbox";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = ns;
      checkbox.checked = false;
      checkbox.addEventListener("change", applyFilters);

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(ns));
      checkboxContainer.appendChild(label);
    });

    const buttons = createButtons(checkboxContainer, 'input[type="checkbox"]');
    content.appendChild(buttons);
    content.appendChild(checkboxContainer);

    return section;
  }

  function createTagSection() {
    if (tags.size === 0) return null;

    const { section, content } = createCollapsibleSection(
      "Filter by tags",
      "tagsExpanded"
    );

    const checkboxContainer = document.createElement("div");
    checkboxContainer.className = "wiki-filter-checkboxes";

    // Add "None" option
    const noneLabel = document.createElement("label");
    noneLabel.className = "wiki-filter-checkbox";
    const noneCheckbox = document.createElement("input");
    noneCheckbox.type = "checkbox";
    noneCheckbox.value = "none";
    noneCheckbox.checked = true;
    noneCheckbox.addEventListener("change", applyFilters);
    noneLabel.appendChild(noneCheckbox);
    noneLabel.appendChild(document.createTextNode("None (untagged)"));
    checkboxContainer.appendChild(noneLabel);

    // Add tag options
    Array.from(tags)
      .sort()
      .forEach((tag) => {
        const label = document.createElement("label");
        label.className = "wiki-filter-checkbox";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = tag;
        checkbox.checked = true;
        checkbox.addEventListener("change", applyFilters);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(tag));
        checkboxContainer.appendChild(label);
      });

    const buttons = createButtons(checkboxContainer, 'input[type="checkbox"]');
    content.appendChild(buttons);
    content.appendChild(checkboxContainer);

    return section;
  }

  function createSummarySection() {
    const { section, content } = createCollapsibleSection(
      "Filter by edit summary",
      "summaryExpanded"
    );

    const input = document.createElement("input");
    input.type = "text";
    input.className = "wiki-filter-input";
    input.placeholder = "Enter text or regular expression...";
    input.value = "";

    const debouncedFilter = debounce(() => {
      applyFilters();
    }, CONFIG.DEBOUNCE_TIME);

    input.addEventListener("input", debouncedFilter);

    const regexOption = document.createElement("div");
    regexOption.className = "wiki-filter-regex-option";

    const regexCheckbox = document.createElement("input");
    regexCheckbox.type = "checkbox";
    regexCheckbox.id = "summary-regex";
    regexCheckbox.checked = false;
    regexCheckbox.addEventListener("change", applyFilters);

    const regexLabel = document.createElement("label");
    regexLabel.htmlFor = "summary-regex";
    regexLabel.appendChild(regexCheckbox);
    regexLabel.appendChild(
      document.createTextNode("Use regular expression (case-insensitive)")
    );

    regexOption.appendChild(regexLabel);

    content.appendChild(input);
    content.appendChild(regexOption);

    return section;
  }

  function createUI() {
    const container = document.createElement("div");
    container.className = "wiki-filter-container";

    const nsSection = createNamespaceSection();
    container.appendChild(nsSection);

    const tagSection = createTagSection();
    if (tagSection) {
      container.appendChild(tagSection);
    }

    const summarySection = createSummarySection();
    container.appendChild(summarySection);

    const stats = document.createElement("div");
    stats.className = "wiki-filter-stats";
    stats.id = "filter-stats";
    container.appendChild(stats);

    const targetList = isContribPage
      ? document.querySelector(".mw-contributions-list")
      : document.querySelector("#pagehistory");

    if (targetList) {
      targetList.parentNode.insertBefore(container, targetList);
    }
  }

  function matchesSummary(summary, filter, useRegex) {
    if (!filter) return true;

    try {
      if (useRegex) {
        const regex = new RegExp(filter, "i");
        return regex.test(summary);
      } else {
        return summary.toLowerCase().includes(filter.toLowerCase());
      }
    } catch {
      return false;
    }
  }

  function applyFilters() {
    const nsCheckboxes = document.querySelectorAll(
      ".wiki-filter-section:first-child .wiki-filter-checkbox input"
    );
    const nsEnabled = document.querySelector(
      ".wiki-filter-section:first-child .wiki-filter-enable"
    )?.checked;
    const selectedNs = Array.from(nsCheckboxes)
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    const tagCheckboxes = document.querySelectorAll(
      ".wiki-filter-section:nth-child(2) .wiki-filter-checkbox input"
    );
    const tagsEnabled = document.querySelector(
      ".wiki-filter-section:nth-child(2) .wiki-filter-enable"
    )?.checked;
    const selectedTags = Array.from(tagCheckboxes)
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    const summaryInput = document.querySelector(".wiki-filter-input");
    const regexCheckbox = document.getElementById("summary-regex");
    const summaryEnabled = document.querySelector(
      ".wiki-filter-section:last-child .wiki-filter-enable"
    )?.checked;
    const summaryFilter = summaryInput?.value || "";
    const useRegex = regexCheckbox?.checked || false;

    let visibleCount = 0;

    items.forEach((item) => {
      const data = item._filterData;
      let show = true;

      // Namespace filter - only apply if enabled
      if (nsEnabled && selectedNs.length > 0) {
        if (!selectedNs.includes(data.namespace)) {
          show = false;
        }
      }

      // Tag filter - only apply if enabled
      if (show && tagsEnabled && tags.size > 0 && selectedTags.length > 0) {
        if (data.tags.length === 0) {
          if (!selectedTags.includes("none")) {
            show = false;
          }
        } else {
          if (!data.tags.some((tag) => selectedTags.includes(tag))) {
            show = false;
          }
        }
      }

      // Summary filter - only apply if enabled
      if (show && summaryEnabled && summaryFilter) {
        if (!matchesSummary(data.summary, summaryFilter, useRegex)) {
          show = false;
        }
      }

      item.style.display = show ? "" : "none";
      if (show) visibleCount++;
    });

    updateStats(visibleCount);
  }

  function updateStats(visible) {
    const stats = document.getElementById("filter-stats");
    if (stats) {
      stats.textContent = `Showing ${visible} of ${items.length} items`;
    }
  }

  function init() {
    addStyles();
    initializeData();
    createUI();
    applyFilters();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
