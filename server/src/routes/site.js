const express = require("express");
const { buildSiteHTML, loadTemplate } = require("../lib/templateEngine");
const { db } = require("../lib/database");
const { generateId } = require("../lib/auth");

const router = express.Router();

function expiredPage() {
  return `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Little Something For You</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#fff0f5 0%,#fff8fa 100%);
      font-family:'Nunito',system-ui,sans-serif;color:#5a3040;text-align:center;padding:2rem}
    .card{max-width:400px}
    .star{font-size:3.5rem;margin-bottom:1.5rem;display:block}
    h1{font-size:1.5rem;font-weight:700;margin-bottom:0.75rem;line-height:1.3}
    p{font-size:1rem;opacity:0.7;line-height:1.6}
  </style>
</head><body>
  <div class="card">
    <span class="star">✨</span>
    <h1>This letter has returned to the stars.</h1>
    <p>This surprise was only meant to last a little while — like all the best moments.</p>
  </div>
</body></html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Little Something For You</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#fff0f5 0%,#fff8fa 100%);
      font-family:'Nunito',system-ui,sans-serif;color:#5a3040;text-align:center;padding:2rem}
    .card{max-width:400px}
    .star{font-size:3.5rem;margin-bottom:1.5rem;display:block}
    h1{font-size:1.5rem;font-weight:700;margin-bottom:0.75rem;line-height:1.3}
    p{font-size:1rem;opacity:0.7;line-height:1.6}
  </style>
</head><body>
  <div class="card">
    <span class="star">🔍</span>
    <h1>This surprise couldn't be found.</h1>
    <p>The link might be wrong, or the surprise may never have existed. Double-check the link and try again.</p>
  </div>
</body></html>`;
}

router.get("/:slug", (req, res) => {
  try {
    const link = db.prepare("SELECT * FROM public_links WHERE slug = ?").get(req.params.slug);
    if (!link) {
      return res.status(404).send(notFoundPage());
    }

    if (new Date(link.expires_at) < new Date()) {
      return res.status(410).send(expiredPage());
    }

    db.prepare("UPDATE public_links SET views = views + 1 WHERE id = ?").run(link.id);

    const viewId = generateId();
    db.prepare(
      "INSERT INTO link_views (id, link_id, ip_address, user_agent) VALUES (?, ?, ?, ?)"
    ).run(viewId, link.id, req.ip || "", req.get("user-agent") || "");

    const creation = db.prepare("SELECT template_id, data_json FROM creations WHERE id = ?").get(link.creation_id);
    if (!creation) {
      return res.status(404).send(notFoundPage());
    }

    const data = JSON.parse(creation.data_json);
    const templateId = creation.template_id || data.template_id;

    // Ensure the template is loaded before trying to render it
    loadTemplate(templateId);

    const html = buildSiteHTML(templateId, data, {
      cssHref: "/templates/" + templateId + "/template.css",
    });

    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("Site render error:", err);
    res.status(500).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Error</title></head><body style="font-family:system-ui;text-align:center;padding:4rem;color:#5a3040"><h1>Something went wrong</h1><p>Please try again later.</p></body></html>`);
  }
});

module.exports = router;
