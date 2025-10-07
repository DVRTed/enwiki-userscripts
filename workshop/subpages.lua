local p = {}

function p.main(frame)
    local args = frame.args
    local prefixOutput = args[1] or ""

    return "<pre>" .. mw.text.encode(prefixOutput) .. "</pre>"
end

return p
