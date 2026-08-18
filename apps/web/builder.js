/* =====================================================
   BUILDER — Template-Driven Website Builder
   ===================================================== */
(function () {
  "use strict";

  var DRAFT_PREFIX = "littleSomething_draft_";

  function storageKey(templateId) {
    return DRAFT_PREFIX + templateId;
  }

  var state = {
    templateId: null,
    data: {},
    creationId: null  // set after first server save; used to update instead of re-create
  };

  var currentTemplate = null;
  var renderTimer = null;
  var saveTimer = null;

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function $(id) { return document.getElementById(id); }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  var API_BASE = window.API_BASE || "";
  var authToken = localStorage.getItem("littleSomething_token") || "";

  function setAuthToken(token) {
    authToken = token;
    if (token) {
      localStorage.setItem("littleSomething_token", token);
    } else {
      localStorage.removeItem("littleSomething_token");
    }
    updateAuthUI();
  }

  function getAuthHeaders() {
    var headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = "Bearer " + authToken;
    return headers;
  }

  function updateAuthUI() {
    var authArea = $("authArea");
    if (!authArea) return;
    if (authToken) {
      authArea.innerHTML = '<span style="font-size:0.78rem; color:var(--ink-soft);">Logged in</span><button class="btn-ghost" id="logoutBtn" type="button">Logout</button>';
      $("logoutBtn").addEventListener("click", function () {
        setAuthToken(null);
      });
    } else {
      authArea.innerHTML = '<button class="btn-ghost" id="loginBtn" type="button">Login</button>';
      $("loginBtn").addEventListener("click", showAuthModal);
    }
  }

  /* ---------- persistence ---------- */

  function loadDraft(templateId) {
    try {
      var raw = localStorage.getItem(storageKey(templateId));
      if (raw) {
        var parsed = JSON.parse(raw);
        return parsed.data || parsed;
      }
    } catch (e) {
      console.warn("Could not load saved draft.", e);
    }
    return null;
  }

  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var payload = {
          templateId: state.templateId,
          data: state.data
        };
        localStorage.setItem(storageKey(state.templateId), JSON.stringify(payload));
        var el = $("saveStatus");
        el.textContent = "Draft saved " + new Date().toLocaleTimeString();
      } catch (e) {
        $("saveStatus").textContent = "Couldn't save draft (storage full?)";
      }
    }, 400);
  }

  /* ---------- template loading ---------- */

  async function loadTemplate(templateId) {
    var template = TemplateEngine.get(templateId);
    if (!template) {
      try {
        await TemplateEngine.load(templateId);
        template = TemplateEngine.get(templateId);
      } catch (e) {
        console.error("Failed to load template:", templateId, e);
        return null;
      }
    }
    return template;
  }

  async function switchTemplate(templateId) {
    var template = await loadTemplate(templateId);
    if (!template) return;

    state.templateId = templateId;
    state.data = deepClone(template.defaultData);
    state.creationId = null; // new template = new creation

    var saved = loadDraft(templateId);
    if (saved) {
      state.data = Object.assign(deepClone(template.defaultData), saved);
    }

    currentTemplate = template;
    buildEditorUI(template);
    hydrateForm(template);
    renderPreview();
    saveDraft();
  }

  /* ---------- editor UI generation ---------- */

  function buildEditorUI(template) {
    $("templateName").textContent = "Editing: " + template.name;

    var globalFields = $("globalFields");
    globalFields.innerHTML = "";

    var templateSelectLabel = document.createElement("label");
    templateSelectLabel.className = "field";
    templateSelectLabel.innerHTML = "<span>Template</span>" +
      '<select id="f-templateId">' +
        '<option value="playful-love-journey"' + (template.id === "playful-love-journey" ? " selected" : "") + '>Playful Love Journey</option>' +
        '<option value="elegant-love-letter"' + (template.id === "elegant-love-letter" ? " selected" : "") + '>Elegant Love Letter</option>' +
      '</select>';
    globalFields.appendChild(templateSelectLabel);

    var templateSelect = $("f-templateId");
    if (templateSelect) {
      templateSelect.addEventListener("change", function () {
        switchTemplate(this.value);
      });
    }

    var globalFieldsDef = template.fields.filter(function (f) { return f.page === "global"; });
    globalFieldsDef.forEach(function (field) {
      globalFields.appendChild(createFieldElement(field, state.data));
    });

    var tabsContainer = $("tabs");
    tabsContainer.innerHTML = "";

    var panelsContainer = $("tabPanels");
    panelsContainer.innerHTML = "";

    var pages = template.pages || [];
    var hasTheme = (template.themes && template.themes.length > 0);

    if (hasTheme) {
      var themeTab = document.createElement("button");
      themeTab.className = "tab active";
      themeTab.dataset.tab = "theme";
      themeTab.textContent = "Theme";
      tabsContainer.appendChild(themeTab);

      var themePanel = document.createElement("div");
      themePanel.className = "tab-panel active";
      themePanel.dataset.panel = "theme";
      themePanel.innerHTML = '<h2>Pick a mood</h2>' +
        '<p class="panel-hint">Changes fonts stay the same — this swaps the whole color atmosphere.</p>' +
        '<div class="theme-grid" id="themeGrid"></div>';
      panelsContainer.appendChild(themePanel);
    }

    pages.forEach(function (page, index) {
      var tab = document.createElement("button");
      tab.className = "tab" + (index === 0 && !hasTheme ? " active" : "");
      tab.dataset.tab = page.id;
      tab.textContent = page.label;
      tabsContainer.appendChild(tab);

      var panel = document.createElement("div");
      panel.className = "tab-panel" + (index === 0 && !hasTheme ? " active" : "");
      panel.dataset.panel = page.id;
      panel.innerHTML = '<h2>' + esc(page.label) + '</h2>' +
        '<div class="page-fields" data-page="' + page.id + '"></div>';
      panelsContainer.appendChild(panel);
    });

    bindTabs();
  }

  /* ---------- field creation ---------- */

  function createFieldElement(field, data) {
    var wrapper = document.createElement("div");
    wrapper.className = "field";
    wrapper.dataset.fieldId = field.id;

    var label = document.createElement("span");
    label.textContent = field.label || field.id;
    wrapper.appendChild(label);

    if (field.type === "text") {
      var input = document.createElement("input");
      input.type = "text";
      input.id = "f-" + field.id;
      input.maxLength = field.maxLength || 255;
      input.value = data[field.id] || "";
      input.addEventListener("input", function () {
        state.data[field.id] = input.value;
        scheduleRender();
      });
      wrapper.appendChild(input);
    } else if (field.type === "textarea") {
      var textarea = document.createElement("textarea");
      textarea.id = "f-" + field.id;
      textarea.rows = 3;
      textarea.maxLength = field.maxLength || 1000;
      textarea.value = data[field.id] || "";
      textarea.addEventListener("input", function () {
        state.data[field.id] = textarea.value;
        scheduleRender();
      });
      wrapper.appendChild(textarea);
    } else if (field.type === "image") {
      var uploadRow = document.createElement("div");
      uploadRow.className = "upload-row";
      var thumb = document.createElement("img");
      thumb.className = "thumb-preview";
      thumb.alt = "";
      thumb.style.display = "none";
      if (data[field.id] && data[field.id].src) {
        thumb.src = data[field.id].src;
        thumb.style.display = "block";
      }
      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.id = "f-" + field.id;
      fileInput.accept = "image/jpeg,image/png,image/webp";
      fileInput.addEventListener("change", async function () {
        var file = fileInput.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
          alert("That photo is over 8MB — try a smaller one.");
          return;
        }
        thumb.alt = file.name;
        thumb.style.display = "block";
        try {
          var url = await window.LS.uploadFile(file, "photo", { token: authToken, creationId: state.creationId });
          state.data[field.id] = { src: url, alt: file.name };
          thumb.src = url;
        } catch (e) {
          var dataUrl = await readFileAsDataURL(file);
          state.data[field.id] = { src: dataUrl, alt: file.name };
          thumb.src = dataUrl;
        }
        scheduleRender();
        persistCreationIfExists();
      });
      uploadRow.appendChild(thumb);
      uploadRow.appendChild(fileInput);
      wrapper.appendChild(uploadRow);
      var hint = document.createElement("small");
      hint.textContent = "JPG, PNG or WEBP, up to 8MB.";
      wrapper.appendChild(hint);
    } else if (field.type === "audio") {
      var audioRow = document.createElement("div");
      audioRow.className = "upload-row";
      var fileName = document.createElement("span");
      fileName.className = "file-name";
      fileName.id = "songName-" + field.id;
      fileName.textContent = data[field.id] && data[field.id].name ? data[field.id].name : "No song selected";
      var audioInput = document.createElement("input");
      audioInput.type = "file";
      audioInput.id = "f-" + field.id;
      audioInput.accept = "audio/mpeg,audio/mp3,audio/wav,audio/ogg";
      audioInput.addEventListener("change", async function () {
        var file = audioInput.files[0];
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) {
          alert("That song is over 15MB — try a smaller file.");
          return;
        }
        fileName.textContent = file.name;
        try {
          var url = await window.LS.uploadFile(file, "music", { token: authToken, creationId: state.creationId });
          state.data[field.id] = { src: url, name: file.name };
        } catch (e) {
          var dataUrl = await readFileAsDataURL(file);
          state.data[field.id] = { src: dataUrl, name: file.name };
        }
        scheduleRender();
        persistCreationIfExists();
      });
      audioRow.appendChild(fileName);
      audioRow.appendChild(audioInput);
      wrapper.appendChild(audioRow);
      var audioHint = document.createElement("small");
      audioHint.textContent = "MP3, WAV or OGG, up to 15MB.";
      wrapper.appendChild(audioHint);
    } else if (field.type === "gif") {
      var gifMount = document.createElement("div");
      gifMount.id = "gifpicker-" + field.id;
      wrapper.appendChild(gifMount);
    } else if (field.type === "array") {
      if (field.itemType === "text") {
        var arrayContainer = document.createElement("div");
        arrayContainer.id = "array-" + field.id;
        wrapper.appendChild(arrayContainer);
        var addBtn = document.createElement("button");
        addBtn.className = "btn-ghost";
        addBtn.type = "button";
        addBtn.textContent = "+ Add item";
        addBtn.addEventListener("click", function () {
          var arr = state.data[field.id] || [];
          if (field.maxItems && arr.length >= field.maxItems) return;
          arr.push("");
          state.data[field.id] = arr;
          renderArrayField(field, arrayContainer);
          scheduleRender();
        });
        wrapper.appendChild(addBtn);
        renderArrayField(field, arrayContainer);
      } else if (field.itemType === "memeBox") {
        var memeContainer = document.createElement("div");
        memeContainer.id = "memeBoxesList";
        wrapper.appendChild(memeContainer);
        var addMemeBtn = document.createElement("button");
        addMemeBtn.className = "btn-ghost";
        addMemeBtn.type = "button";
        addMemeBtn.textContent = "+ Add meme box";
        addMemeBtn.addEventListener("click", addMeme);
        wrapper.appendChild(addMemeBtn);
      }
    }

    return wrapper;
  }

  function renderArrayField(field, container) {
    container.innerHTML = "";
    var arr = state.data[field.id] || [];
    arr.forEach(function (item, index) {
      var row = document.createElement("div");
      row.className = "array-item";
      var input = document.createElement("input");
      input.type = "text";
      input.value = item;
      input.maxLength = field.maxLength || 255;
      input.addEventListener("input", function () {
        state.data[field.id][index] = input.value;
        scheduleRender();
      });
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", function () {
        state.data[field.id].splice(index, 1);
        renderArrayField(field, container);
        scheduleRender();
      });
      row.appendChild(input);
      row.appendChild(delBtn);
      container.appendChild(row);
    });
  }

  /* ---------- form hydration ---------- */

  function hydrateForm(template) {
    buildThemeGrid(template);

    var globalFields = template.fields.filter(function (f) { return f.page === "global"; });
    globalFields.forEach(function (field) {
      if (field.type === "gif") {
        var mount = $("gifpicker-" + field.id);
        if (mount) {
          mountGifPicker(mount, field.id);
        }
      }
    });

    template.pages.forEach(function (page) {
      var pageFields = template.fields.filter(function (f) { return f.page === page.id; });
      var container = document.querySelector('.page-fields[data-page="' + page.id + '"]');
      if (!container) return;

      pageFields.forEach(function (field) {
        var el = createFieldElement(field, state.data);
        container.appendChild(el);
        if (field.type === "gif") {
          var mount = $("gifpicker-" + field.id);
          if (mount) {
            mountGifPicker(mount, field.id);
          }
        } else if (field.type === "array" && field.itemType === "memeBox") {
          renderMemeEditors();
        }
      });
    });
  }

  /* ---------- theme grid ---------- */

  function buildThemeGrid(template) {
    var grid = $("themeGrid");
    if (!grid) return;
    grid.innerHTML = "";
    var themes = template.themes || [];
    themes.forEach(function (t) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-swatch" + (state.data.theme === t.id ? " selected" : "");
      btn.style.background = "#fff6f2";
      btn.innerHTML =
        '<div class="swatch-dots">' +
        t.dots.map(function (c) { return '<span class="dot" style="background:' + c + '"></span>'; }).join("") +
        "</div>" + t.name;
      btn.addEventListener("click", function () {
        state.data.theme = t.id;
        grid.querySelectorAll(".theme-swatch").forEach(function (s) { s.classList.remove("selected"); });
        btn.classList.add("selected");
        scheduleRender();
      });
      grid.appendChild(btn);
    });
  }

  /* ---------- gif picker ---------- */

  var GIF_LIBRARY = [
    { file: "happy-cat.gif", alt: "Happy waiting cat" },
    { file: "dudu-pat-bubu-dudu.gif", alt: "Cat headpat" },
    { file: "friday.gif", alt: "Proposing cat" },
    { file: "bubu-angry-bubu-fierce.gif", alt: "Fierce cat" },
    { file: "that's-what-i-prefer-cute-angry-cat.gif", alt: "Cute angry cat" },
    { file: "angry-cat.gif", alt: "Angry cat" },
    { file: "cat-orange-cat.gif", alt: "Orange cat" },
    { file: "cat-yes-sir.gif", alt: "Yes sir cat" },
    { file: "cat-kitty.gif", alt: "Kitty cat" },
    { file: "yapapa-yapapa-cat.gif", alt: "Dancing cat" }
  ];

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function mountGifPicker(containerEl, fieldOrIndex, getValue, setValue) {
    containerEl.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "gifpicker";

    var currentValue;
    if (typeof fieldOrIndex === "string") {
      currentValue = state.data[fieldOrIndex] || {};
    } else {
      currentValue = state.data.memeBoxes[fieldOrIndex].gif || {};
    }

    function refreshSelection() {
      wrap.querySelectorAll(".gif-thumb").forEach(function (img) {
        img.classList.toggle("selected", img.dataset.src === currentValue.src);
      });
    }

    GIF_LIBRARY.forEach(function (g) {
      var img = document.createElement("img");
      img.className = "gif-thumb";
      img.src = "/assets/gifs/" + g.file;
      img.alt = g.alt;
      img.dataset.src = "/assets/gifs/" + g.file;
      img.title = g.alt;
      img.addEventListener("click", function () {
        var val = { src: "/assets/gifs/" + g.file, alt: g.alt };
        if (typeof fieldOrIndex === "string") {
          state.data[fieldOrIndex] = val;
        } else {
          state.data.memeBoxes[fieldOrIndex].gif = val;
        }
        currentValue = val;
        refreshSelection();
        scheduleRender();
      });
      wrap.appendChild(img);
    });

    var uploadBtn = document.createElement("label");
    uploadBtn.className = "gif-upload-btn";
    uploadBtn.title = "Upload your own gif";
    uploadBtn.textContent = "+";
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/gif,image/webp,image/png";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", async function () {
      var file = fileInput.files[0];
      if (!file) return;
      var val;
      try {
        var url = await window.LS.uploadFile(file, "gif", { token: authToken, creationId: state.creationId });
        val = { src: url, alt: "Custom gif" };
      } catch (e) {
        var dataUrl = await readFileAsDataURL(file);
        val = { src: dataUrl, alt: "Custom gif" };
      }
      if (typeof fieldOrIndex === "string") {
        state.data[fieldOrIndex] = val;
      } else {
        state.data.memeBoxes[fieldOrIndex].gif = val;
      }
      currentValue = val;
      refreshSelection();
      scheduleRender();
      persistCreationIfExists();
    });
    uploadBtn.appendChild(fileInput);
    wrap.appendChild(uploadBtn);

    containerEl.appendChild(wrap);
    refreshSelection();
  }

  /* ---------- meme boxes ---------- */

  var MIN_MEMES = 1;
  var MAX_MEMES = 6;

  function renderMemeEditors() {
    var list = $("memeBoxesList");
    if (!list) return;
    list.innerHTML = "";
    var boxes = state.data.memeBoxes || [];
    boxes.forEach(function (box, i) {
      var card = document.createElement("div");
      card.className = "meme-editor";

      var head = document.createElement("div");
      head.className = "meme-editor-head";
      head.innerHTML = '<span>Meme ' + (i + 1) + '</span>';
      var controls = document.createElement("div");
      var upBtn = mkIconBtn("↑", i > 0, function () { moveMeme(i, -1); });
      var downBtn = mkIconBtn("↓", i < boxes.length - 1, function () { moveMeme(i, 1); });
      var delBtn = mkIconBtn("✕", boxes.length > MIN_MEMES, function () { removeMeme(i); });
      controls.append(upBtn, downBtn, delBtn);
      head.appendChild(controls);
      card.appendChild(head);

      var captionLabel = document.createElement("label");
      captionLabel.className = "field";
      captionLabel.innerHTML = "<span>Caption</span>";
      var captionInput = document.createElement("input");
      captionInput.type = "text";
      captionInput.maxLength = 80;
      captionInput.value = box.caption || "";
      captionInput.addEventListener("input", function () {
        state.data.memeBoxes[i].caption = captionInput.value;
        scheduleRender();
      });
      captionLabel.appendChild(captionInput);
      card.appendChild(captionLabel);

      var gifField = document.createElement("div");
      gifField.className = "field";
      gifField.innerHTML = "<span>Gif</span>";
      var gifMount = document.createElement("div");
      gifField.appendChild(gifMount);
      card.appendChild(gifField);
      mountGifPicker(gifMount, i);

      list.appendChild(card);
    });
  }

  function mkIconBtn(label, enabled, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn";
    b.textContent = label;
    b.disabled = !enabled;
    b.style.opacity = enabled ? "1" : "0.3";
    b.addEventListener("click", onClick);
    return b;
  }

  function moveMeme(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= state.data.memeBoxes.length) return;
    var tmp = state.data.memeBoxes[i];
    state.data.memeBoxes[i] = state.data.memeBoxes[j];
    state.data.memeBoxes[j] = tmp;
    renderMemeEditors();
    scheduleRender();
  }

  function removeMeme(i) {
    if (state.data.memeBoxes.length <= MIN_MEMES) return;
    state.data.memeBoxes.splice(i, 1);
    renderMemeEditors();
    scheduleRender();
  }

  function addMeme() {
    if (state.data.memeBoxes.length >= MAX_MEMES) return;
    var lib = GIF_LIBRARY[state.data.memeBoxes.length % GIF_LIBRARY.length];
    state.data.memeBoxes.push({
      caption: "You when...",
      gif: { src: "/assets/gifs/" + lib.file, alt: lib.alt }
    });
    renderMemeEditors();
    scheduleRender();
  }

  /* ---------- preview ---------- */

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPreview, 150);
    saveDraft();
  }

  function renderPreview() {
    if (!currentTemplate) return;
    var html = TemplateEngine.buildSiteHTML(state.templateId, state.data, { cssHref: currentTemplate.getAssetPath("template.css") });
    $("previewFrame").srcdoc = html;
  }

  /* ---------- tabs ---------- */

  function bindTabs() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
        tab.classList.add("active");
        var panel = document.querySelector('.tab-panel[data-panel="' + tab.dataset.tab + '"]');
        if (panel) panel.classList.add("active");
      });
    });
  }

  /* ---------- mobile preview ---------- */

  function bindMobilePreview() {
    var pane = document.querySelector(".preview-pane");
    var toggle = $("mobilePreviewToggle");
    if (!toggle || !pane) return;
    toggle.addEventListener("click", function () {
      var opening = !pane.classList.contains("open");
      pane.classList.toggle("open", opening);
      toggle.textContent = opening ? "Close ✕" : "Preview 👀";
    });
  }

  /* ---------- full-screen preview ---------- */

  function bindFullPreview() {
    $("fullPreviewBtn").addEventListener("click", function () {
      var wrap = document.querySelector(".preview-frame-wrap");
      if (wrap.requestFullscreen) wrap.requestFullscreen();
      else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
    });
  }

  /* ---------- reset ---------- */

  function bindReset() {
    $("resetBtn").addEventListener("click", function () {
      if (!confirm("Reset every field back to the original example? This can't be undone.")) return;
      state.data = deepClone(currentTemplate.defaultData);
      localStorage.removeItem(storageKey(state.templateId));
      buildEditorUI(currentTemplate);
      hydrateForm(currentTemplate);
      renderPreview();
    });
  }

  /* ---------- export ---------- */

  var authMode = "login";

  function showAuthModal() {
    var modal = $("authModal");
    modal.style.display = "flex";
    $("authEmail").value = "";
    $("authPassword").value = "";
    $("authNameField").style.display = authMode === "register" ? "flex" : "none";
    $("authModalTitle").textContent = authMode === "login" ? "Login" : "Register";
    $("authToggle").textContent = authMode === "login" ? "Need an account? Register" : "Have an account? Login";
  }

  function hideAuthModal() {
    $("authModal").style.display = "none";
  }

  function bindAuthModal() {
    $("authClose").addEventListener("click", hideAuthModal);
    $("authModal").addEventListener("click", function (e) {
      if (e.target === $("authModal")) hideAuthModal();
    });
    $("authToggle").addEventListener("click", function (e) {
      e.preventDefault();
      authMode = authMode === "login" ? "register" : "login";
      showAuthModal();
    });
    $("authForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = $("authEmail").value.trim();
      var password = $("authPassword").value;
      var name = $("authName").value.trim();

      var endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      var body = { email, password };
      if (authMode === "register") body.name = name;

      try {
        var res = await fetch(API_BASE + endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        });
        var data = await res.json();
        if (!res.ok) {
          alert(data.error || "Authentication failed");
          return;
        }
        setAuthToken(data.token);
        hideAuthModal();
      } catch (err) {
        alert("Could not connect to server. Is the backend running?");
        console.error(err);
      }
    });
  }

  async function apiCall(method, path, body) {
    var res = await fetch(API_BASE + path, {
      method: method,
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : null,
    });
    if (res.status === 401) {
      setAuthToken(null);
      throw new Error("Unauthorized");
    }
    return res;
  }

  // Push the current state to the backend if a creation already exists. This
  // keeps an already-generated link in sync when media (photo/song/gif) is
  // uploaded after the link was first created — otherwise the live preview
  // shows the new media while the shared link stays stale.
  function persistCreationIfExists() {
    if (!state.creationId || !authToken) return;
    apiCall("PUT", "/api/creations/" + state.creationId, {
      name: state.data.recipientName || "Untitled",
      data: state.data,
    }).catch(function (err) {
      console.warn("Autosave after upload failed:", err);
    });
  }

  async function bindGenerateLink() {
    $("downloadBtn").addEventListener("click", async function () {
      var btn = $("downloadBtn");
      var original = btn.textContent;
      btn.textContent = "Working...";
      btn.disabled = true;

      try {
        if (!authToken) {
          btn.textContent = original;
          btn.disabled = false;
          showAuthModal();
          return;
        }

        var creationRes;
        if (state.creationId) {
          creationRes = await apiCall("PUT", "/api/creations/" + state.creationId, {
            name: state.data.recipientName || "Untitled",
            data: state.data,
          });
        } else {
          creationRes = await apiCall("POST", "/api/creations", {
            template_id: state.templateId,
            name: state.data.recipientName || "Untitled",
            data: state.data,
          });
        }

        if (!creationRes.ok) {
          var errData = await creationRes.json();
          throw new Error(errData.error || "Failed to save creation");
        }

        var creationData = await creationRes.json();
        var creationId = creationData.creation.id;
        state.creationId = creationId;

        var orderRes = await apiCall("POST", "/api/payments/create-order", {
          creation_id: creationId,
        });
        if (!orderRes.ok) {
          var orderErr = await orderRes.json();
          if (orderErr.already_paid && orderErr.link) {
            var publicUrl = (API_BASE || window.location.origin) + "/s/" + orderErr.link.slug;
            window.location.href = "/success.html?slug=" + orderErr.link.slug;
            return;
          }
          throw new Error(orderErr.error || "Failed to start payment");
        }

        var orderData = await orderRes.json();

        await loadRazorpayScript();

        var userEmail = getUserEmail();
        var rzp = new Razorpay({
          key: orderData.key_id,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "LittleSomething",
          description: "Your private surprise link",
          prefill: { email: userEmail },
          method: { upi: true },
          theme: { color: "#f3698b" },
          handler: async function (response) {
            btn.textContent = "Verifying...";
            try {
              var verifyRes = await fetch(API_BASE + "/api/payments/verify", {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              var verifyData = await verifyRes.json();
              if (verifyRes.ok && verifyData.success && verifyData.link) {
                window.location.href = "/success.html?slug=" + verifyData.link.slug;
              } else {
                throw new Error(verifyData.error || "Payment verification failed");
              }
            } catch (err) {
              console.error(err);
              alert(err.message || "Something went wrong during verification");
              btn.textContent = original;
              btn.disabled = false;
            }
          },
          ondismiss: function () {
            btn.textContent = original;
            btn.disabled = false;
          },
        });

        rzp.open();
      } catch (err) {
        console.error(err);
        alert(err.message || "Something went wrong");
        btn.textContent = original;
        btn.disabled = false;
      }
    });
  }

  function loadRazorpayScript() {
    return new Promise(function (resolve, reject) {
      if (window.Razorpay) {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function getUserEmail() {
    var token = authToken;
    if (!token) return "";
    var parts = token.split(".");
    if (parts.length !== 3) return "";
    try {
      var payload = parts[1];
      payload = payload.replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      var decoded = JSON.parse(atob(payload));
      return decoded.email || "";
    } catch (e) {
      return "";
    }
  }

  function getUserRole() {
    var token = authToken;
    if (!token) return "";
    var parts = token.split(".");
    if (parts.length !== 3) return "";
    try {
      var payload = parts[1];
      payload = payload.replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      var decoded = JSON.parse(atob(payload));
      return decoded.role || "";
    } catch (e) {
      return "";
    }
  }

  function updateAdminUI() {
    var bypassBtn = $("adminBypassBtn");
    if (!bypassBtn) return;
    if (getUserRole() === "admin") {
      bypassBtn.style.display = "inline-block";
    } else {
      bypassBtn.style.display = "none";
    }
  }

  async function bindAdminBypass() {
    $("adminBypassBtn").addEventListener("click", async function () {
      var btn = $("adminBypassBtn");
      var original = btn.textContent;
      btn.textContent = "Working...";
      btn.disabled = true;

      try {
        if (!authToken) {
          btn.textContent = original;
          btn.disabled = false;
          showAuthModal();
          return;
        }

        var creationRes;
        if (state.creationId) {
          creationRes = await apiCall("PUT", "/api/creations/" + state.creationId, {
            name: state.data.recipientName || "Untitled",
            data: state.data,
          });
        } else {
          creationRes = await apiCall("POST", "/api/creations", {
            template_id: state.templateId,
            name: state.data.recipientName || "Untitled",
            data: state.data,
          });
        }

        if (!creationRes.ok) {
          var errData = await creationRes.json();
          throw new Error(errData.error || "Failed to save creation");
        }

        var creationData = await creationRes.json();
        var creationId = creationData.creation.id;

        var linkRes = await apiCall("POST", "/api/admin/links/generate", {
          creation_id: creationId,
        });

        if (!linkRes.ok) {
          var linkErr = await linkRes.json();
          throw new Error(linkErr.error || "Failed to generate link");
        }

        var linkData = await linkRes.json();
        window.location.href = "/success.html?slug=" + linkData.link.slug;
      } catch (err) {
        console.error(err);
        alert(err.message || "Something went wrong");
        btn.textContent = original;
        btn.disabled = false;
      }
    });
  }

  /* ---------- init ---------- */

  async function init() {
    var params = new URLSearchParams(window.location.search);
    var requestedTemplate = params.get("template") || "playful-love-journey";

    var template = await loadTemplate(requestedTemplate);
    if (!template) {
      requestedTemplate = "playful-love-journey";
      template = await loadTemplate(requestedTemplate);
    }

    state.templateId = template.id;
    state.data = deepClone(template.defaultData);

    var saved = loadDraft(template.id);
    if (saved) {
      state.data = Object.assign(deepClone(template.defaultData), saved);
    }

    currentTemplate = template;
    buildEditorUI(template);
    hydrateForm(template);
    bindMobilePreview();
    bindFullPreview();
    bindReset();
    bindAuthModal();
    updateAuthUI();
    updateAdminUI();
    bindGenerateLink();
    bindAdminBypass();

    renderPreview();
    saveDraft();
  }

  document.addEventListener("DOMContentLoaded", init);
})();