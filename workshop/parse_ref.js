function parse_ref(raw_ref) {
  const return_object = {
    template_name: null,
    url: null,
    access_date: null,
    is_bare_ref: false,
    // and templates without url
  };

  const ref = raw_ref.trim();
  const has_a_template = ref.startsWith("{{") && ref.endsWith("}}");

  if (!has_a_template) {
    const url_match = ref.match(/https?:\/\/\S+/);
    if (url_match) {
      return_object.is_bare_ref = true;
      return_object.url = url_match[0];
    }
    return return_object;
  }

  // remove the last }} and split by |
  // e.g., ["{{cite web", "url=...", "title=...", ...]
  const template_params = ref.replace(/}}$/, "").split("|");

  // remove the first item, which is the template name, and trim {{ at the start
  // e.g., "cite web"
  const template_name = template_params.shift().replace("{{", "").trim();

  const param_map = template_params
    .map((param_str) => {
      // find the first =
      // if not found, return null
      const idx = param_str.indexOf("=");
      if (idx === -1) return null;

      const param = param_str.slice(0, idx).trim();
      const value = param_str.slice(idx + 1).trim();

      return { param, value };
    })
    .filter((item) => item !== null); // filters out params with no value;

  const parameters = param_map.reduce((acc, { param, value }) => {
    acc[param] = value;
    return acc;
  }, {});

  const url = parameters["url"] || null;
  const url_status = parameters["url_status"]?.toLowerCase();
  const access_date = parameters["access-date"] || null;
  const archive_url = parameters["archive-url"] || null;

  let selected_url = url;

  if (archive_url) {
    if (url_status !== "live" || !url) {
      selected_url = archive_url;
    }
  }

  return_object.template_name = template_name;
  return_object.url = selected_url;
  return_object.access_date = access_date;
  return return_object;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parse_ref };
}
