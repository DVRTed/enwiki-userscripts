local p = {}

function p.search(frame)
    local args = frame:getParent().args
    local page_title = args.page
    local query_string = args.query
    local context_chars = tonumber(args.context) or 75

    if not page_title or not query_string then
        return
            '<strong class="error">Error: Missing required parameters "page" and "query".</strong>'
    end

    local title = mw.title.new(page_title)
    if not title or not title.exists then
        return '<strong class="error">Error: Page "' .. page_title ..
                   '" does not exist.</strong>'
    end
    local content = title:getContent()

    local matches = {}
    local start_index = 1
    while true do
        local match_start, match_end = string.find(content, query_string,
                                                   start_index, true)
        if not match_start then break end

        local context_start = math.max(1, match_start - context_chars)
        local context_end = math.min(#content, match_end + context_chars)

        local prefix = context_start > 1 and '...' or ''
        local suffix = context_end < #content and '...' or ''

        local snippet = mw.text.nowiki(string.sub(content, context_start,
                                                  match_start - 1)) ..
                            '<strong>' ..
                            mw.text
                                .nowiki(
                                string.sub(content, match_start, match_end)) ..
                            '</strong>' ..
                            mw.text
                                .nowiki(
                                string.sub(content, match_end + 1, context_end))

        table.insert(matches, '<li>' .. prefix .. snippet .. suffix .. '</li>')

        start_index = match_end + 1
    end

    if #matches > 0 then
        local found_text =
            '* Found ' .. #matches .. ' match(es) for "<strong>' ..
                mw.text.nowiki(query_string) .. '</strong>" on [[' .. page_title ..
                ']]:\n'
        return found_text .. '<ul>' .. table.concat(matches) .. '</ul>'
    else
        return
            'No matches found for "<strong>' .. mw.text.nowiki(query_string) ..
                '</strong>" on [[' .. page_title .. ']].'
    end
end

return p

