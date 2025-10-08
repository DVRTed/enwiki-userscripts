// script to add {{ Wikipedia: USync }} banner to all .js files

const fs = require("fs");
const path = require("path");

const DIST_DIR = "dist";

const REPO = "https://github.com/DVRTed/enwiki-userscripts";
const REF = "refs/heads/prod";

function add_banner() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(
      `Error: Directory '${DIST_DIR}' not found. Did the build succeed?`
    );
    return;
  }

  const files = fs.readdirSync(DIST_DIR);

  for (const file_name of files) {
    if (file_name.endsWith(".js")) {
      const file_path = path.join(DIST_DIR, file_name);

      const banner = `// {{Wikipedia:USync |repo=${REPO} |ref=${REF} |path=${file_name}}}`;
      let content = fs.readFileSync(file_path, "utf8");
      content = banner + "\n" + content;
      fs.writeFileSync(file_path, content, "utf8");
      console.log(`Banner added to: ${file_path}`);
    }
  }
}

add_banner();
