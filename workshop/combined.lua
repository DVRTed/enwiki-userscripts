local functs = {}

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

function trim(s) return s:match("^%s*(.-)%s*$") end

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

function getlatest_section(sections)
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

local function count_signatures(section_body)
    local signature_pattern =
        ".-[Uu][Ss][Ee][Rr][_ ]*[Tt]?[Aa]?[Ll]?[Kk]?:[^%]]+%]%].-(%d%d:%d%d, %d+ [^ ]+ %d%d%d%d %(UTC%))"
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

function get_unanswered_threads(sections)
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

functs.talkstats = function(frame)
    local prefixed_title = frame.args[1]
    local title = mw.title.new(prefixed_title)
    local raw_content = title and title.getContent and title:getContent()

    local sections = populate_sections(raw_content)
    local latest_section = getlatest_section(sections)
    if latest_section.title then

        local time_ago = frame:preprocess(
                             "{{time ago|" .. latest_section.raw .. "}}")
        return string.format(
                   "Number of threads: '''%d'''<br>Thread with the most recent comment: [[%s#%s|%s]] (%s)",
                   #sections, prefixed_title, latest_section.title,
                   latest_section.title, time_ago)
    end
end

functs.unanswered = function(frame)
    local prefixed_title = frame.args[1]
    local max_results = tonumber(frame.args[2]) or 10

    local title = mw.title.new(prefixed_title)
    local raw_content = title and title.getContent and title:getContent()

    if not raw_content then return "Could not retrieve page content" end

    local sections = populate_sections(raw_content)
    local unanswered = get_unanswered_threads(sections)

    if #unanswered == 0 then return "" end

    local result = string.format(
                       "'''[[%s]]''' — '''%d''' unanswered threads:<br>",
                       prefixed_title, #unanswered)

    local display_count = math.min(#unanswered, max_results)
    result = result .. "{{Bulleted list"
    for i = 1, display_count do
        local thread = unanswered[i]
        local time_ago = frame:preprocess(
                             "{{time ago|" .. thread.raw_timestamp .. "}}")
        local heading_wikitext = string.format("[[%s#%s|%s]]", prefixed_title,
                                               thread.title, thread.title)
        local heading = frame:preprocess(heading_wikitext)
        result = result .. string.format("|%s (%s)", heading, time_ago)
    end

    if #unanswered > max_results then
        result = result ..
                     string.format("|''(and %d more...)''",
                                   #unanswered - max_results)
    end

    result = result .. "}}"

    return frame:preprocess(result)
end

return functs
