/* =====================================================
   DASHBOARD — Customer view of their creations + links
   ===================================================== */
(function () {
  "use strict";

  var API_BASE = window.API_BASE || "";
  var token = localStorage.getItem("littleSomething_token") || "";
  var authMode = "login";

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function publicUrl(slug) {
    var base = (API_BASE || window.location.origin).replace(/\/$/, "");
    return base + "/s/" + slug;
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(API_BASE + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        token = "";
        localStorage.removeItem("littleSomething_token");
        showLogin();
        throw new Error("Unauthorized");
      }
      return r;
    });
  }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  /* ---------- auth ---------- */

  function showLogin() {
    $("loginModal").style.display = "flex";
    $("dashBody").hidden = true;
    $("userEmail").textContent = "";
  }

  function hideLogin() {
    $("loginModal").style.display = "none";
    $("dashBody").hidden = false;
  }

  function showAuthModal() {
    var modal = $("loginModal");
    modal.style.display = "flex";
    $("loginEmail").value = "";
    $("loginPassword").value = "";
    $("loginName").value = "";
    $("loginNameField").style.display = authMode === "register" ? "flex" : "none";
    $("loginTitle").textContent = authMode === "login" ? "Login" : "Register";
    $("loginToggle").textContent = authMode === "login" ? "Need an account? Register" : "Have an account? Login";
    $("loginError").style.display = "none";
  }

  function bindAuthModal() {
    $("loginClose").addEventListener("click", function () {
      if (token) hideLogin(); else showLogin();
    });
    $("loginModal").addEventListener("click", function (e) {
      if (e.target === $("loginModal") && token) hideLogin();
    });
    $("loginToggle").addEventListener("click", function (e) {
      e.preventDefault();
      authMode = authMode === "login" ? "register" : "login";
      showAuthModal();
    });
    $("loginForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = $("loginEmail").value.trim();
      var password = $("loginPassword").value;
      var name = $("loginName").value.trim();
      if (!email || !password) return;

      var endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      var body = { email: email, password: password };
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
          $("loginError").textContent = data.error || "Authentication failed";
          $("loginError").style.display = "block";
          return;
        }
        token = data.token;
        localStorage.setItem("littleSomething_token", token);
        hideLogin();
        loadAll();
      } catch (err) {
        $("loginError").textContent = "Could not connect to the server.";
        $("loginError").style.display = "block";
      }
    });
  }

  function logout() {
    token = "";
    localStorage.removeItem("littleSomething_token");
    showLogin();
  }

  /* ---------- data ---------- */

  function linkFor(links, creationId) {
    for (var i = 0; i < links.length; i++) {
      if (links[i].creation_id === creationId) return links[i];
    }
    return null;
  }

  async function loadAll() {
    try {
      var results = await Promise.all([
        api("/api/creations"),
        api("/api/links"),
        api("/api/dashboard/stats"),
      ]);
      var creations = await results[0].json();
      var links = await results[1].json();
      var stats = await results[2].json();

      renderStats(stats.stats || {});
      renderCreations(creations.creations || [], links.links || []);
    } catch (e) {
      console.error(e);
    }
  }

  function renderStats(stats) {
    $("statCreations").textContent = stats.creations || 0;
    $("statLinks").textContent = stats.links || 0;
    $("statViews").textContent = stats.totalViews || 0;
  }

  function renderCreations(creations, links) {
    var wrap = $("creationsList");
    if (!creations.length) {
      wrap.innerHTML = '<div class="empty-state">You haven\'t made a surprise yet.<br><br><a href="builder.html">Create your first one →</a></div>';
      return;
    }

    wrap.innerHTML = creations.map(function (c) {
      var link = linkFor(links, c.id);
      var linkSection = link
        ? '<div class="link-row">' +
            '<a class="link-url" href="' + esc(publicUrl(link.slug)) + '" target="_blank" rel="noopener noreferrer">' + esc(link.slug) + '</a>' +
            '<span class="views">👁 ' + (link.views || 0) + ' views</span>' +
            '<button class="btn-sm" data-copy="' + esc(link.slug) + '">Copy link</button>' +
            '<button class="btn-sm btn-danger" data-dellink="' + esc(link.id) + '">Delete link</button>' +
          '</div>'
        : '<div class="link-row"><button class="btn-sm btn-primary" data-genlink="' + esc(c.id) + '">Generate link</button></div>';

      return '<div class="creation-card" data-id="' + esc(c.id) + '">' +
        '<div class="creation-head"><h3>' + esc(c.name || "Untitled") + '</h3>' +
          '<span class="tag">' + esc(c.template_id) + '</span></div>' +
        '<p class="muted">Updated ' + new Date(c.updated_at).toLocaleString() + '</p>' +
        linkSection +
        '<div class="creation-actions">' +
          '<a class="btn-sm" href="builder.html?creation=' + esc(c.id) + '">Edit content</a>' +
          '<button class="btn-sm btn-danger" data-delcreation="' + esc(c.id) + '">Delete</button>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  /* ---------- actions ---------- */

  async function generateLink(creationId, btn) {
    btn.disabled = true;
    btn.textContent = "Working...";
    try {
      var res = await api("/api/links/" + creationId + "/generate", { method: "POST" });
      if (!res.ok) {
        var d = await res.json().catch(function () { return {}; });
        throw new Error(d.error || "Could not generate link");
      }
      toast("Link generated");
      loadAll();
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
      btn.textContent = "Generate link";
    }
  }

  function copyLink(slug) {
    var url = publicUrl(slug);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast("Link copied to clipboard");
      }).catch(function () {
        toast(url);
      });
    } else {
      toast(url);
    }
  }

  async function deleteLink(id, btn) {
    if (!confirm("Delete this link? It will no longer be openable.")) return;
    btn.disabled = true;
    try {
      var res = await api("/api/links/" + id, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete link");
      toast("Link deleted");
      loadAll();
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
    }
  }

  async function deleteCreation(id, btn) {
    if (!confirm("Delete this creation and its link permanently?")) return;
    btn.disabled = true;
    try {
      var res = await api("/api/creations/" + id, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete creation");
      toast("Creation deleted");
      loadAll();
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
    }
  }

  /* ---------- init ---------- */

  function init() {
    bindAuthModal();
    $("logoutBtn").addEventListener("click", logout);

    document.addEventListener("click", function (e) {
      var gen = e.target.closest("[data-genlink]");
      var copy = e.target.closest("[data-copy]");
      var delLink = e.target.closest("[data-dellink]");
      var delC = e.target.closest("[data-delcreation]");
      if (gen) generateLink(gen.dataset.genlink, gen);
      if (copy) copyLink(copy.dataset.copy);
      if (delLink) deleteLink(delLink.dataset.dellink, delLink);
      if (delC) deleteCreation(delC.dataset.delcreation, delC);
    });

    if (!token) {
      showLogin();
      return;
    }

    hideLogin();
    var payload = token.split(".")[1];
    try {
      payload = payload.replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      var decoded = JSON.parse(atob(payload));
      $("userEmail").textContent = decoded.email || "";
    } catch (e) {}

    loadAll();

    var params = new URLSearchParams(window.location.search);
    if (params.get("saved")) toast("Changes saved — your link is updated");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
