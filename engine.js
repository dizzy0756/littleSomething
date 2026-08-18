/* =====================================================
   TEMPLATE ENGINE
   Generic template loading and rendering system.

   Usage:
     TemplateEngine.register(templateObject)
     TemplateEngine.buildSiteHTML(templateId, data, opts)

   Templates call TemplateEngine.register(this) to register.
   ===================================================== */
(function (global) {
  "use strict";

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escLines(str) {
    return esc(str).split("\n").map(function (l) { return l.trimEnd(); }).join("<br>");
  }

  function withName(str, name) {
    return String(str || "").replace(/\{name\}/gi, () => name);
  }

  const _templates = {};

  function register(template) {
    if (!template || !template.id) {
      throw new Error("Template must have an id");
    }
    _templates[template.id] = template;
  }

  function get(templateId) {
    return _templates[templateId] || null;
  }

  async function load(templateId) {
    if (_templates[templateId]) {
      return _templates[templateId];
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "templates/" + templateId + "/template.js";
      script.onload = () => {
        const template = _templates[templateId];
        if (template) resolve(template);
        else reject(new Error("Template not registered after load: " + templateId));
      };
      script.onerror = () => reject(new Error("Could not load template: " + templateId));
      document.head.appendChild(script);
    });
  }

  function buildSiteHTML(templateId, data, opts) {
    opts = opts || {};
    const template = _templates[templateId];
    if (!template) {
      throw new Error("Unknown template: " + templateId + ". Did you forget to load it?");
    }

    const cssLink = opts.inlineCSS
      ? "<style>" + opts.inlineCSS + "</style>"
      : '<link rel="stylesheet" href="' + esc(opts.cssHref || "templates/" + templateId + "/template.css") + '">';

    const bodyHTML = template.renderBody
      ? template.renderBody(data)
      : "<p>Template has no renderBody.</p>";

    const interactionJS = template.getInteractions
      ? template.getInteractions(data)
      : "";

    const title = esc(data.siteTitle || "A Little Something");

    return "<!DOCTYPE html>" +
      "<html lang=\"en\">" +
      "<head>" +
      "<meta charset=\"UTF-8\" />" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0\" />" +
      "<title>" + title + "</title>" +
      "<meta name=\"robots\" content=\"noindex, nofollow\">" +
      "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">" +
      "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>" +
      "<link href=\"https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:ital,wght@0,400;0,600;0,700;1,600&display=swap\" rel=\"stylesheet\">" +
      cssLink +
      "</head>" +
      "<body data-theme=\"" + esc(data.theme || "romantic") + "\">" +
      bodyHTML +
      "<script>" + interactionJS + "</script>" +
      "</body>" +
      "</html>";
  }

  global.TemplateEngine = {
    register,
    get,
    load,
    buildSiteHTML,
    esc,
    escLines,
    withName,
  };
})(typeof window !== "undefined" ? window : globalThis);