/* Reset password page — consumes the token from the email link and submits it
   to /api/auth/reset-password. Relies on window.API_BASE from /src/config.js. */
(function () {
  "use strict";

  var API_BASE = window.API_BASE || "";

  function $(id) { return document.getElementById(id); }

  function showMsg(text, kind) {
    var el = $("resetMsg");
    el.textContent = text;
    el.className = "reset-msg show " + kind;
  }

  function getToken() {
    var params = new URLSearchParams(window.location.search);
    return params.get("token");
  }

  function init() {
    var token = getToken();
    var form = $("resetForm");
    var submitBtn = $("submitBtn");

    if (!token) {
      form.style.display = "none";
      showMsg("This reset link is missing its token. Request a new one from the login screen.", "err");
      return;
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var pw = $("newPassword").value;
      var confirm = $("confirmPassword").value;

      if (pw !== confirm) {
        showMsg("Passwords don't match.", "err");
        return;
      }
      if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
        showMsg("Password must be at least 8 characters and include letters and numbers.", "err");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Updating…";

      try {
        var res = await fetch(API_BASE + "/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token, password: pw }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          showMsg(data.error || "Could not reset your password.", "err");
          submitBtn.disabled = false;
          submitBtn.textContent = "Update password";
          return;
        }
        form.style.display = "none";
        showMsg(data.message || "Password updated. You can now log in.", "ok");
        $("backToLogin").style.display = "inline-block";
      } catch (err) {
        showMsg("Could not connect to the server. Please try again.", "err");
        submitBtn.disabled = false;
        submitBtn.textContent = "Update password";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
