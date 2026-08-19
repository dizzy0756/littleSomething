const fs = require("fs");
const path = require("path");

const TEMPLATES_DIR = path.join(__dirname, "../../templates");
const _templates = {};

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAssetPaths(data) {
  const webBase = process.env.WEB_BASE_URL ? process.env.WEB_BASE_URL.replace(/\/$/, "") : "";
  function rewriteAsset(str) {
    if (typeof str !== "string") return str;
    // Legacy store: relative "assets/..." -> "/assets/...".
    if (str.indexOf("assets/") === 0) return "/" + str;
    // C2: stock assets are served by the web frontend. Make them absolute so
    // they resolve regardless of which origin serves the /s page (API vs
    // Cloudflare). User uploads (/uploads or absolute R2 URLs) are untouched.
    if (str.indexOf("/assets/") === 0 && webBase) return webBase + str;
    return str;
  }
  if (typeof data === "string") return rewriteAsset(data);
  if (Array.isArray(data)) return data.map(normalizeAssetPaths);
  if (data && typeof data === "object") {
    var out = {};
    Object.keys(data).forEach(function (key) {
      out[key] = normalizeAssetPaths(data[key]);
    });
    return out;
  }
  return data;
}

function escLines(str) {
  return esc(str).split("\n").map((l) => l.trimEnd()).join("<br>");
}

function withName(str, name) {
  return String(str || "").replace(/\{name\}/gi, () => name);
}

function loadTemplate(templateId) {
  if (_templates[templateId]) return _templates[templateId];

  const templateDir = path.join(TEMPLATES_DIR, templateId);
  const templateJsPath = path.join(templateDir, "template.js");

  if (!fs.existsSync(templateJsPath)) {
    return null;
  }

  const originalEngine = globalThis.TemplateEngine;
  globalThis.TemplateEngine = {
    register: (t) => { _templates[t.id] = t; },
  };

  try {
    const code = fs.readFileSync(templateJsPath, "utf-8");
    const fn = new Function("module", "exports", code);
    fn({}, {});
  } catch (err) {
    globalThis.TemplateEngine = originalEngine;
    throw err;
  }

  globalThis.TemplateEngine = originalEngine;

  const template = _templates[templateId];
  if (!template) {
    throw new Error("Template not registered after load: " + templateId);
  }

  return template;
}

function getTemplate(templateId) {
  return _templates[templateId] || null;
}

function listTemplates() {
  const templates = [];
  if (!fs.existsSync(TEMPLATES_DIR)) return templates;

  const entries = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const template = loadTemplate(entry.name);
      if (template) {
        templates.push({
          id: template.id,
          name: template.name,
          description: template.description,
          pages: template.pages,
          themes: template.themes,
        });
      }
    }
  }
  return templates;
}

function buildSiteHTML(templateId, data, opts) {
  opts = opts || {};
  // Auto-load the template if it hasn't been registered yet
  if (!_templates[templateId]) {
    loadTemplate(templateId);
  }
  const template = _templates[templateId];
  if (!template) {
    throw new Error("Unknown template: " + templateId);
  }

   const cssLink = opts.inlineCSS
     ? "<style>" + opts.inlineCSS + "</style>"
     : '<link rel="stylesheet" href="' + esc(opts.cssHref || "/templates/" + templateId + "/template.css") + '">';

   const nonceAttr = opts.nonce ? ' nonce="' + esc(opts.nonce) + '"' : "";

  // C4: merge the stored data with the template's defaultData so every field
  // referenced by renderBody exists. A missing nested field would otherwise
  // throw and turn the live surprise link into a 500. This is the single
  // defensive change that makes rendering crash-proof.
  const mergedData = Object.assign({}, template.defaultData || {}, data || {});

  const normalizedData = normalizeAssetPaths(mergedData);
  const bodyHTML = template.renderBody ? template.renderBody(normalizedData) : "<p>Template has no renderBody.</p>";
  const interactionJS = template.getInteractions ? template.getInteractions(normalizedData) : "";
  const title = esc(mergedData.siteTitle || "A Little Something");

  return "<!DOCTYPE html>" +
    "<html lang=\"en\">" +
    "<head>" +
    "<meta charset=\"UTF-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0,maximum-scale=1.0\" />" +
    "<title>" + title + "</title>" +
    "<meta name=\"robots\" content=\"noindex, nofollow\">" +
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">" +
    "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>" +
    "<link href=\"https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:ital,wght@0,400;0,600;0,700;1,600&display=swap\" rel=\"stylesheet\">" +
    cssLink +
    "</head>" +
    "<body data-theme=\"" + esc(mergedData.theme || "romantic") + "\">" +
    bodyHTML +
    "<script" + nonceAttr + ">" + interactionJS + "</script>" +
    "</body>" +
    "</html>";
}

function preloadAll() {
  if (!fs.existsSync(TEMPLATES_DIR)) return;
  const entries = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        loadTemplate(entry.name);
      } catch (err) {
        console.warn("Failed to preload template", entry.name, "—", err.message);
      }
    }
  }
}

module.exports = { loadTemplate, getTemplate, listTemplates, buildSiteHTML, preloadAll, esc, escLines };
