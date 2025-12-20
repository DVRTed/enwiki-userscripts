const { parse_ref } = require("./parse_ref");
const { describe, test, expect } = require("@jest/globals");

describe("parse_ref", () => {
  test("parses cite news with live url", () => {
    const result = parse_ref(
      `{{cite news|url=https://example.com/article|archive-url=https://archive.org/example|access-date=2024-01-01|url_status=live}}`
    );

    expect(result.template_name).toBe("cite news");
    expect(result.url).toBe("https://example.com/article");
    expect(result.access_date).toBe("2024-01-01");
    expect(result.is_bare_ref).toBe(false);
  });

  test("parses cite news with dead url and falls back to archive-url", () => {
    const result = parse_ref(
      `{{cite news|url=https://example.com/article|archive-url=https://archive.org/example|url_status=dead}}`
    );

    expect(result.template_name).toBe("cite news");
    expect(result.url).toBe("https://archive.org/example");
    expect(result.access_date).toBe(null);
    expect(result.is_bare_ref).toBe(false);
  });

  test("uses archive-url when url is missing", () => {
    const result = parse_ref(
      `{{cite web|archive-url=https://archive.org/example|access-date=2022-01-01}}`
    );

    expect(result.template_name).toBe("cite web");
    expect(result.url).toBe("https://archive.org/example");
    expect(result.access_date).toBe("2022-01-01");
    expect(result.is_bare_ref).toBe(false);
  });

  test("parses cite journal with no url or archive", () => {
    const result = parse_ref(`{{cite journal|title=Study|year=2023}}`);

    expect(result.template_name).toBe("cite journal");
    expect(result.url).toBe(null);
    expect(result.access_date).toBe(null);
    expect(result.is_bare_ref).toBe(false);
  });

  test("parses bare URL reference", () => {
    const result = parse_ref("https://example.com/article");

    expect(result.template_name).toBe(null);
    expect(result.url).toBe("https://example.com/article");
    expect(result.access_date).toBe(null);
    expect(result.is_bare_ref).toBe(true);
  });

  test("handles whitespace and formatting noise", () => {
    const result = parse_ref(
      `  {{ cite web | url = https://example.com | access-date = 2024-01-01 }}  `
    );

    expect(result.template_name).toBe("cite web");
    expect(result.url).toBe("https://example.com");
    expect(result.access_date).toBe("2024-01-01");
    expect(result.is_bare_ref).toBe(false);
  });

  test("archive-only dead link is not a bare ref", () => {
    const result = parse_ref(
      `{{cite web|archive-url=https://archive.org/example|url_status=dead}}`
    );

    expect(result.template_name).toBe("cite web");
    expect(result.url).toBe("https://archive.org/example");
    expect(result.is_bare_ref).toBe(false);
  });

  test("handles empty input", () => {
    const result = parse_ref("");
    expect(result.template_name).toBe(null);
    expect(result.url).toBe(null);
    expect(result.access_date).toBe(null);
    expect(result.is_bare_ref).toBe(false);
  });

  test("url containing =", () => {
    const result = parse_ref(
      `{{cite web|archive-url=https://archive.org/example?page=100}}`
    );

    expect(result.template_name).toBe("cite web");
    expect(result.url).toBe("https://archive.org/example?page=100");
    expect(result.is_bare_ref).toBe(false);
  });
});
