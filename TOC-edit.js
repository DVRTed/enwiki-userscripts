mw.loader.using(['mediawiki.util', 'oojs-ui-core', 'oojs-ui-widgets', 'jquery.textSelection'], () => {
    const action = mw.config.get('wgAction');
    const textbox = $('#wpTextbox1');
    const editor_area = $(".wikiEditor-ui");

    // only run when in editing mode
    if (action !== 'edit' && action !== 'submit') return;
    if (!textbox.length) return;

    let cm6 = null;
    mw.hook('ext.CodeMirror.ready').add((cm) => { cm6 = cm; });

    // the menu that we populate with section headings
    const $menu = $('<div>', { class: 'edit-toc-menu' });
    const TOC_button = new OO.ui.PopupButtonWidget({
        label: 'TOC',
        icon: 'listBullet',
        popup: {
            $content: $menu,
            padded: true,
            align: 'backwards',
            width: 300,
        }
    });
    TOC_button.$element.css({ float: 'right', margin: '5px' });
    TOC_button.on('click', () => {
        if (TOC_button.getPopup().isVisible()) {
            render_toc();
        }
    });

    // place the button above the wikieditor div
    // if not found, fallback to placing it above the textarea
    if (editor_area.length)
        editor_area.before(TOC_button.$element);
    else
        textbox.before(TOC_button.$element);

    // selects ==xyz== on the textbox 
    // and scrolls the textbox to keep the heading at top (or middle if it's not cm)
    function jump_to(index, len) {
        if (cm6 && cm6.view) {
            // CM is nice; it has a built-in API to scroll anywhere
            const { EditorView } = mw.loader.require("ext.CodeMirror.lib");
            textbox.textSelection('setSelection', { start: index, end: index + len });
            cm6.view.dispatch({ effects: EditorView.scrollIntoView(index, { y: 'start' }) });
            textbox.focus();
            return;
        }

        // plain textarea needs these hacks

        // get the raw dom object from jquery wrapper
        const raw_textarea = textbox.get(0);

        // build a hidden div styled to match the textarea exactly
        const mirror = document.createElement('div');
        mirror.style.position = 'fixed';
        mirror.style.top = '0';
        mirror.style.left = '0';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.width = raw_textarea.clientWidth + 'px';

        const cs = window.getComputedStyle(raw_textarea);
        ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
            'textTransform', 'wordSpacing', 'padding', 'border', 'boxSizing']
            .forEach(prop => { mirror.style[prop] = cs[prop]; });

        // fill it with the text up to index, then insert a marker at the index
        mirror.textContent = raw_textarea.value.substring(0, index);
        const marker = document.createElement('span');
        marker.textContent = '\u200b';
        mirror.appendChild(marker);

        document.body.appendChild(mirror);
        const marker_top = marker.offsetTop;
        document.body.removeChild(mirror);

        const final_scroll = Math.max(0, marker_top - raw_textarea.clientHeight / 3);

        textbox.textSelection('setSelection', { start: index, end: index + len });
        raw_textarea.scrollTop = final_scroll;
        raw_textarea.focus();
    }

    // populates the menu with headings from the textbox
    function render_toc() {
        $menu.empty();
        const text = textbox.textSelection('getContents');
        const heading_regex = /^(=+)\s*(.*?)\s*(=+)\s*$/gm;
        const matches = [...text.matchAll(heading_regex)];

        if (!matches.length) {
            $menu.append($('<div>', { text: 'No headings found' }));
            return;
        }

        matches.forEach((match) => {
            const level = Math.min(match[1].length, match[3].length, 6);
            const index = match.index;
            const len = match[0].length;
            const title = match[2].replace(/\{\{anchor\|.*?\}\}|<[^>]+>/gi, '').trim();
            const indent = Math.max(0, level - 2) * 12;

            const $link = $('<a>', {
                href: '#',
                text: title,
                class: level <= 2 ? 'edit-toc-main' : 'edit-toc-nested',
            })
                .css('marginLeft', `${indent}px`)
                .on('click', (e) => {
                    e.preventDefault();
                    jump_to(index, len);
                    TOC_button.getPopup().toggle(false);
                });

            $menu.append($link);
        });
    }


    mw.util.addCSS(`
        .oo-ui-popupWidget { z-index: 1000 !important; }
        .edit-toc-menu a { display: block; padding: 4px 8px; color: #202122; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; line-height: 1.4; }
        .edit-toc-menu a:hover { background: #eaf3ff; color: #36c; }
        .edit-toc-main { font-weight: bold; }
        .edit-toc-nested { color: #404244; }
        .edit-toc-nested::before { content: '↳ '; color: #72777d; }
        .edit-toc-empty { color: #72777d; font-style: italic; font-size: 13px; }
    `);
});
