const API = "http://localhost:3001";
let token = localStorage.getItem("admin_token");
let currentTab = "overview";
let confirmCb = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showLogin() {
  $("#loginModal").style.display = "flex";
  $("#loginError").style.display = "none";
}
function hideLogin() {
  $("#loginModal").style.display = "none";
}

function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${API}${path}`, { ...opts, headers })
    .then(async (r) => {
      if (r.status === 401 || r.status === 403) {
        token = null;
        localStorage.removeItem("admin_token");
        hideLogin();
        showLogin();
        return Promise.reject(new Error("Unauthorized"));
      }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        return Promise.reject(new Error(data.error || `HTTP ${r.status}`));
      }
      return r.json();
    });
}

function setActiveTab(tab) {
  currentTab = tab;
  $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.tab === tab));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
  const titles = { overview: "Overview", users: "Users", creations: "Creations", links: "Links" };
  $("#pageTitle").textContent = titles[tab] || "Admin";
}

function renderStats(stats) {
  const cards = [
    { label: "Users", value: stats.users },
    { label: "Creations", value: stats.creations },
    { label: "Links", value: stats.links },
    { label: "Total Views", value: stats.totalViews },
    { label: "Payments", value: stats.payments },
    { label: "Revenue", value: `₹${Number(stats.revenue).toLocaleString()}` },
  ];
  $("#statsGrid").innerHTML = cards
    .map(
      (c) => `
      <div class="stat-card">
        <h3>${c.label}</h3>
        <div class="value">${c.value}</div>
      </div>
    `
    )
    .join("");
}

function renderUsers(users) {
  const tbody = $("#usersTable tbody");
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No users yet</td></tr>`;
    return;
  }
  tbody.innerHTML = users
    .map(
      (u) => `
      <tr>
        <td>${escapeHtml(u.name || "—")}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleString() : "—"}</td>
        <td><button class="btn-sm btn-danger" data-delete-user="${u.id}">Delete</button></td>
      </tr>
    `
    )
    .join("");
}

function renderCreations(creations) {
  const tbody = $("#creationsTable tbody");
  if (!creations.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No creations yet</td></tr>`;
    return;
  }
  tbody.innerHTML = creations
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.name || "Untitled")}</td>
        <td>${escapeHtml(c.template_id)}</td>
        <td>${escapeHtml(c.user_email || "—")}</td>
        <td>${c.updated_at ? new Date(c.updated_at).toLocaleString() : "—"}</td>
        <td><button class="btn-sm btn-danger" data-delete-creation="${c.id}">Delete</button></td>
      </tr>
    `
    )
    .join("");
}

function renderLinks(links) {
  const tbody = $("#linksTable tbody");
  if (!links.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No links yet</td></tr>`;
    return;
  }
  tbody.innerHTML = links
    .map(
      (l) => `
      <tr>
        <td><code>${escapeHtml(l.slug)}</code></td>
        <td>${escapeHtml(l.creation_id)}</td>
        <td>${escapeHtml(l.user_email || "—")}</td>
        <td>${l.views}</td>
        <td>${new Date(l.expires_at).toLocaleString()}</td>
        <td><button class="btn-sm btn-danger" data-delete-link="${l.id}">Delete</button></td>
      </tr>
    `
    )
    .join("");
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showConfirm(title, body, onOk) {
  $("#confirmTitle").textContent = title;
  $("#confirmBody").textContent = body;
  $("#confirmModal").style.display = "flex";
  confirmCb = onOk;
}
function hideConfirm() {
  $("#confirmModal").style.display = "none";
  confirmCb = null;
}

async function loadOverview() {
  const data = await api("/api/admin/stats");
  renderStats(data.stats);
}
async function loadUsers() {
  const data = await api("/api/admin/users");
  renderUsers(data.users);
}
async function loadCreations() {
  const data = await api("/api/admin/creations");
  renderCreations(data.creations);
}
async function loadLinks() {
  const data = await api("/api/admin/links");
  renderLinks(data.links);
}

async function refreshCurrent() {
  if (!token) return;
  try {
    if (currentTab === "overview") await loadOverview();
    if (currentTab === "users") await loadUsers();
    if (currentTab === "creations") await loadCreations();
    if (currentTab === "links") await loadLinks();
  } catch (e) {
    console.error(e);
  }
}

function init() {
  if (!token) {
    showLogin();
  } else {
    hideLogin();
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      token = data.token;
      localStorage.setItem("admin_token", token);
      hideLogin();
      setActiveTab("overview");
      refreshCurrent();
    } catch (err) {
      $("#loginError").textContent = err.message;
      $("#loginError").style.display = "block";
    }
  });

  $("#logoutBtn").addEventListener("click", () => {
    token = null;
    localStorage.removeItem("admin_token");
    showLogin();
  });

  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.dataset.tab);
      refreshCurrent();
    });
  });

  $("#confirmCancel").addEventListener("click", hideConfirm);
  $("#confirmOk").addEventListener("click", async () => {
    if (confirmCb) {
      await confirmCb();
      hideConfirm();
    }
  });

  document.addEventListener("click", async (e) => {
    const delUser = e.target.closest("[data-delete-user]");
    const delCreation = e.target.closest("[data-delete-creation]");
    const delLink = e.target.closest("[data-delete-link]");

    if (delUser) {
      const id = delUser.dataset.deleteUser;
      showConfirm("Delete user", "This will also remove their creations, links, and related data.", async () => {
        await api(`/api/admin/users/${id}`, { method: "DELETE" });
        loadUsers();
        loadOverview();
      });
    }

    if (delCreation) {
      const id = delCreation.dataset.deleteCreation;
      showConfirm("Delete creation", "This will remove the creation and its links permanently.", async () => {
        await api(`/api/admin/creations/${id}`, { method: "DELETE" });
        loadCreations();
        loadOverview();
      });
    }

    if (delLink) {
      const id = delLink.dataset.deleteLink;
      showConfirm("Delete link", "This link will no longer be accessible.", async () => {
        await api(`/api/admin/links/${id}`, { method: "DELETE" });
        loadLinks();
        loadOverview();
      });
    }
  });

  $("#menuToggle").addEventListener("click", () => {
    $("#sidebar").classList.toggle("open");
  });

  if (token) {
    setActiveTab("overview");
    refreshCurrent();
  }
}

document.addEventListener("DOMContentLoaded", init);
