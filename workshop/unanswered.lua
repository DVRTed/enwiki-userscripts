local plain_text = require("Module:Plain text")._main
local section_link = require('Module:Section link')._main

-- helper functs
local function trim(s) return s:match("^%s*(.-)%s*$") end
local function case_insensitive_pattern(str)
    local pattern = {}
    for c in str:gmatch(".") do
        if c:match("%a") then
            table.insert(pattern, string.format("[%s%s]", c:upper(), c:lower()))
        else
            table.insert(pattern, c)
        end
    end
    return table.concat(pattern)
end

-- actual functions
local function get_thread_details(page_content)
    local signatures = 0
    local thread_author_username = ""
    local thread_timestamp = ""

    for line in page_content:gmatch("[^\r\n]+") do

        -- match and count timestamp 
        -- at the end of the line
        local timestamp_pattern = "%d%d:%d%d, %d+ [^ ]+ %d%d%d%d %(UTC%)"
        local timestamp = line:match(timestamp_pattern)
        if timestamp then
            signatures = signatures + 1

            -- currently, we don't do anything with threads that may
            -- have replies
            if signatures >= 2 then return nil end

            -- set the last found timestamp in the thread
            thread_timestamp = timestamp

            -- try and get the username from the same line as timestamp.
            -- it updates to the last found username.
            local ci_user = case_insensitive_pattern("user")

            local username_pattern = "%[%[" .. ci_user ..
                                         "[^:]*:([^%]%|]+).-%]%]"
            for match in line:gmatch(username_pattern) do
                thread_author_username = match
            end

        end
    end

    return {
        author_username = trim(thread_author_username),
        timestamp = thread_timestamp
    }
end

local function get_unanswered_threads(page_content)
    local threads = {}
    local current_title = nil
    local current_body = ""
    local threads_with_data = {}

    for line in page_content:gmatch("[^\r\n]+") do
        local thread_title = line:match("^==%s*(.-)%s*==$")
        if thread_title then
            current_body = trim(current_body)
            if current_title and current_body then
                table.insert(threads,
                             {title = current_title, body = current_body})
            end
            current_title = thread_title
            current_body = ""
        else
            if current_title then
                current_body = current_body .. trim(line) .. "\n"
            end
        end
    end
    current_body = trim(current_body)
    if current_title and current_body then
        table.insert(threads, {title = current_title, body = current_body})
    end

    for _, thread in ipairs(threads) do
        local details = get_thread_details(thread.body)
        if details and details.author_username ~= "" then
            table.insert(threads_with_data, {
                title = thread.title,
                body = thread.body,
                author_username = details.author_username,
                timestamp = details.timestamp
            })
        end

    end

    return threads_with_data
end

local function wrap_in_custom_div(frame, thread, page_name)
    local title = thread.title
    local body = thread.body
    local author_username = thread.author_username
    local timestamp = thread.timestamp
    local timeago = frame:preprocess("{{time ago|" .. timestamp .. "}}")

    body = plain_text(body)
    if mw.ustring.len(body) > 300 then
        body = mw.ustring.sub(body, 1, 300) .. "…"
    end

    local author_link = string.format("[[User:%s]]", author_username)
    local thread_link = section_link(page_name, plain_text(title),
                                     {nopage = true})

    local div_html = string.format(
                         '<div style="background: #fff; border-radius: 6px; padding: 12px 16px; border: 1px solid #e9ecef; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">' ..
                             '<div style="color: #6c757d; font-size: 12px; margin-bottom: 4px;">%s • %s</div>' ..
                             '<div style="font-size: 16px; font-weight: bold; margin-bottom: 6px;">%s</div>' ..
                             '<p style="margin: 0; color: #212529; font-size: 14px;">%s</p>' ..
                             '</div>', author_link, timeago, thread_link, body)

    return div_html
end

local function unanswered(frame)
    local page_name = frame.args[1] or nil
    local max_threads = tonumber(frame.args[2]) or 10

    if not page_name then return "No page name provided." end

    local page = mw.title.new(page_name)
    local page_content = page and page.getContent and page:getContent()
    if not page_content then return "Could not retrieve page content" end

    local unanswered_threads = get_unanswered_threads(page_content)

    local result = string.format(
                       '<div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 16px 0; border: 1px solid #dee2e6;">' ..
                           '<div style="margin-bottom: 16px;">' ..
                           '<div style="font-size: 18px; font-weight: bold; color: #212529; margin-bottom: 4px;">[[%s]]</div>' ..
                           '<div style="font-size: 14px; color: #6c757d; font-weight: 500;">%d unanswered threads</div>' ..
                           '</div>', page_name, #unanswered_threads)
    if #unanswered_threads == 0 then
        result = result .. '</div>'
        return result
    end

    result = result ..
                 '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">'

    --  if there's fewer threads than max_threads
    -- set it to threads count, otherwise set it to max_threads
    local display_count = math.min(#unanswered_threads, max_threads)

    for i = 1, display_count do
        local thread = unanswered_threads[i]
        local wrapped = wrap_in_custom_div(frame, thread, page_name)
        result = result .. wrapped
    end

    result = result .. '</div></div>'

    return result

end

return {unanswered = unanswered}
