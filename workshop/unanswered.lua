local plain = require("Module:Plain text")._main

local function trim(s) return s:match("^%s*(.-)%s*$") end

local function parse_timestamp(ts)
    local hour, min, day, monthname, year = ts:match(
                                                "(%d%d):(%d%d), (%d+) ([^ ]+) (%d+) %(UTC%)")
    if not (hour and min and day and monthname and year) then return nil end

    local months = {
        January = 1,
        February = 2,
        March = 3,
        April = 4,
        May = 5,
        June = 6,
        July = 7,
        August = 8,
        September = 9,
        October = 10,
        November = 11,
        December = 12
    }

    return os.time {
        year = tonumber(year),
        month = months[monthname],
        day = tonumber(day),
        hour = tonumber(hour),
        min = tonumber(min),
        sec = 0
    }
end

local function populate_sections(raw_content)
    local sections = {}
    local current_title = nil
    local current_body = ""

    for line in raw_content:gmatch("[^\r\n]+") do
        local section_title = line:match("^==%s*(.-)%s*==$")
        if section_title then
            if current_title then
                table.insert(sections, {
                    title = current_title,
                    body = current_body:gsub("^%s*", ""):gsub("%s*$", "")
                })
            end
            current_title = section_title
            current_body = ""
        else
            if current_title then
                current_body = current_body .. line .. "\n"
            end
        end
    end

    if current_title then
        table.insert(sections, {
            title = current_title,
            body = current_body:gsub("^%s*", ""):gsub("%s*$", "")
        })
    end
    return sections
end

local function count_signatures(section_body)
    local signature_pattern =
        ".-User talk:[^%]]+%]%].-(%d%d:%d%d, %d+ [^ ]+ %d%d%d%d %(UTC%))"
    local count = 0

    for line in section_body:gmatch("[^\r\n]+") do
        if line:match(signature_pattern) then count = count + 1 end
    end

    return count
end

local function has_replies(section_body)
    return count_signatures(section_body) > 1
end

local function get_thread_timestamp(section_body)
    local timestamp_pattern = "%d%d:%d%d, %d+ [^ ]+ %d%d%d%d %(UTC%)"
    local first_ts = section_body:match(timestamp_pattern)
    if first_ts then return parse_timestamp(first_ts), first_ts end
    return nil, nil
end

local function extract_signature_info(section_body)
    local signature_pattern =
        "(%[%[[Uu]ser[^%]]*:[^%]]+%][^%[]*%[?[^%]]*%]?[^%d]*)(%d%d:%d%d, %d+ [^ ]+ %d%d%d%d %(UTC%))"
    local full_signature, timestamp = section_body:match(signature_pattern)

    if not full_signature or not timestamp then return nil, nil, section_body end

    local username = full_signature:match("%[%[[Uu]ser[^%]]*:([^%]|]+)")
    if username then username = username:match("([^|]+)") end
    username = username or "Unknown"

    local cleaned_content = section_body:gsub(signature_pattern, "")
    cleaned_content = trim(cleaned_content)

    return username, timestamp, cleaned_content
end

local function wrap_in_custom_div(thread, time_ago, prefixed_title, frame)
    local processed_title = frame:preprocess(thread.title)
    local display_title = plain(processed_title)
    local username, timestamp, content = extract_signature_info(thread.body)

    if not username then
        username = "Unknown"
        content = thread.body
    end

    if mw.ustring.len(content) > 300 then
        content = mw.ustring.sub(content, 1, 300) .. "…"
    end

    local userlink = string.format("[[User:%s|%s]]", username, username)
    local threadlink = string.format("[[%s#%s|%s]]", prefixed_title,
                                     mw.uri.anchorEncode(processed_title),
                                     display_title)

    local div_html = string.format(
                         '<div style="background: #fff; border-radius: 6px; padding: 12px 16px; border: 1px solid #e9ecef; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">' ..
                             '<div style="color: #6c757d; font-size: 12px; margin-bottom: 4px;">%s • %s</div>' ..
                             '<div style="font-size: 16px; font-weight: bold; margin-bottom: 6px;">%s</div>' ..
                             '<p style="margin: 0; color: #212529; font-size: 14px;">%s</p></div>',
                         userlink, time_ago, threadlink, content)

    return div_html
end

local function getlatest_section(sections)
    local timestamp = "%d%d:%d%d, %d+ [^ ]+ %d%d%d%d %(UTC%)"
    local timed_sections = {}

    for _, section in ipairs(sections) do
        local body = section.body
        local title = section.title
        local latest_time = 0
        local latest_raw = nil

        for ts in body:gmatch(timestamp) do
            local parsed = parse_timestamp(ts)
            if parsed and parsed > latest_time then
                latest_time = parsed
                latest_raw = ts
            end
        end

        if latest_time > 0 then
            table.insert(timed_sections, {
                title = title,
                body = body,
                latest_time = latest_time,
                latest_raw = latest_raw
            })
        end
    end

    local latest_section = {raw = nil, time = 0, title = nil}

    for _, section in ipairs(timed_sections) do
        if (section.latest_time > latest_section.time) then
            latest_section.raw = section.latest_raw
            latest_section.time = section.latest_time
            latest_section.title = section.title
        end
    end
    return latest_section
end

local function get_unanswered_threads(sections)
    local unanswered = {}

    for _, section in ipairs(sections) do
        if not has_replies(section.body) then
            local parsed_time, raw_time = get_thread_timestamp(section.body)
            if parsed_time then
                table.insert(unanswered, {
                    title = section.title,
                    body = section.body,
                    timestamp = parsed_time,
                    raw_timestamp = raw_time
                })
            end
        end
    end

    table.sort(unanswered, function(a, b) return a.timestamp > b.timestamp end)
    return unanswered
end

local function talkstats(frame)
    local prefixed_title = frame.args[1]
    local title = mw.title.new(prefixed_title)
    local raw_content = title and title.getContent and title:getContent()

    local sections = populate_sections(raw_content)
    local latest_section = getlatest_section(sections)

    if latest_section.title then
        local processed_title = frame:preprocess(latest_section.title)
        local display_title = plain(processed_title)
        local time_ago = frame:preprocess(
                             "{{time ago|" .. latest_section.raw .. "}}")
        return string.format(
                   "Number of threads: '''%d'''<br>Thread with the most recent comment: [[%s#%s|%s]] (%s)",
                   #sections, prefixed_title,
                   mw.uri.anchorEncode(processed_title), display_title, time_ago)
    end
end

local function unanswered(frame)
    local prefixed_title = frame.args[1]
    local max_results = tonumber(frame.args[2]) or 10

    local title = mw.title.new(prefixed_title)
    local raw_content = title and title.getContent and title:getContent()

    if not raw_content then return "Could not retrieve page content" end

    local sections = populate_sections(raw_content)
    local unanswered = get_unanswered_threads(sections)

    local result = string.format(
                       '<div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 16px 0; border: 1px solid #dee2e6;">' ..
                           '<div style="margin-bottom: 16px;">' ..
                           '<div style="font-size: 18px; font-weight: bold; color: #212529; margin-bottom: 4px;">[[%s]]</div>' ..
                           '<div style="font-size: 14px; color: #6c757d; font-weight: 500;">%d unanswered threads</div>' ..
                           '</div>', prefixed_title, #unanswered)

    if #unanswered == 0 then
        result = result .. '</div>'
        return result
    end

    result = result ..
                 '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">'

    local display_count = math.min(#unanswered, max_results)

    for i = 1, display_count do
        local thread = unanswered[i]
        local time_ago = frame:preprocess(
                             "{{time ago|" .. thread.raw_timestamp .. "}}")
        local wrapped_content = wrap_in_custom_div(thread, time_ago,
                                                   prefixed_title, frame)
        result = result .. wrapped_content
    end

    if #unanswered > max_results then
        result = result .. string.format(
                     '<div style="background: #fff; border-radius: 6px; padding: 12px 16px; border: 1px solid #e9ecef; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><div style="color: #6c757d; font-size: 12px; margin-bottom: 6px;"><span style="color: #495057; font-weight: 500;">More threads</span> • </div><p style="margin: 0; color: #212529; font-size: 14px;"><em>(and %d more...)</em></p></div>',
                     #unanswered - max_results)
    end

    result = result .. '</div></div>'

    return result
end

return {talkstats = talkstats, unanswered = unanswered}
