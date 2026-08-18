const express = require("express");
const { loadTemplate } = require("../lib/templateEngine");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const templates = require("../lib/templateEngine").listTemplates();
    res.json({ templates });
  } catch (err) {
    console.error("List templates error:", err);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.get("/:id", (req, res) => {
  try {
    const template = loadTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.json({
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        pages: template.pages,
        themes: template.themes,
        fields: template.fields,
        defaultData: template.defaultData,
      },
    });
  } catch (err) {
    console.error("Get template error:", err);
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

module.exports = router;
