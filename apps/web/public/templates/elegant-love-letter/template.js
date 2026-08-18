/* =====================================================
   TEMPLATE: Elegant Love Letter
   A slower, more intimate five-screen love letter.
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

  function resolveNestedName(data) {
    var name = data.recipientName || "you";
    var resolved = {};
    Object.keys(data).forEach(function (key) {
      var val = data[key];
      if (typeof val === "string") {
        resolved[key] = val.replace(/\{\{recipientName\}\}/g, name);
      } else if (Array.isArray(val)) {
        resolved[key] = val.map(function (item) {
          return typeof item === "string" ? item.replace(/\{\{recipientName\}\}/g, name) : item;
        });
      } else {
        resolved[key] = val;
      }
    });
    return resolved;
  }

  function renderPlaceholders(template, data) {
    var html = template;
    html = html.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, function (match, key, content) {
      var arr = data[key];
      if (!Array.isArray(arr)) return "";
      return arr.map(function (item) {
        return content.replace(/\{\{this\}\}/g, esc(item));
      }).join("");
    });
    html = html.replace(/\{\{(\w+)\}\}/g, function (match, key) {
      return esc(data[key] != null ? data[key] : "");
    });
    return html;
  }

  var TEMPLATE_HTML = '<!doctype html>' +
    '<html lang="en">' +
    '<head>' +
    '    <meta charset="utf-8">' +
    '    <meta name="viewport" content="width=device-width,initial-scale=1">' +
    '    <title>{{siteTitle}}</title>' +
    '    <link rel="preconnect" href="https://fonts.googleapis.com">' +
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap" rel="stylesheet">' +
    '</head>' +
    '<body>' +
    '    <header class="experience-nav"><span class="brand">little<span>Something</span><i>♥</i></span></header>' +
    '    <main class="experience">' +
    '        <div class="experience-screen active" data-screen="0"><span class="exp-label">01 / 05</span>' +
    '            <div class="float-heart h1">♥</div>' +
    '            <div class="float-heart h2">♡</div>' +
    '            <p class="eyebrow">{{eyebrow}}</p>' +
    '            <h1>{{heading}}</h1>' +
    '            <p>{{subtext}}</p><button class="button advance">Open it <span>♥</span></button>' +
    '        </div>' +
    '        <div class="experience-screen notes" data-screen="1"><span class="exp-label">02 / 05</span>' +
    '            <p class="eyebrow">A few favourites</p>' +
    '            <h2>Things I adore<br>about <em>you.</em></h2>' +
    '            <div class="love-notes">' +
    '                {{#each notes}}<p>{{this}}</p>{{/each}}' +
    '            </div><button class="button advance">Keep going <span>→</span></button>' +
    '        </div>' +
    '        <div class="experience-screen burst" data-screen="2"><span class="exp-label">03 / 05</span>' +
    '            <p class="eyebrow">Okay, the big one</p>' +
    '            <h2>{{burstHeading}}</h2><button class="heart-button" aria-label="Reveal the heart burst">♥</button>' +
    '            <p class="heart-prompt">Tap the heart when you\'re ready.</p>' +
    '            <div class="burst-message">' +
    '                <h1>{{burstRevealText}}</h1><button class="button advance">I feel it too <span>♥</span></button>' +
    '            </div>' +
    '        </div>' +
    '        <div class="experience-screen jokes" data-screen="3"><span class="exp-label">04 / 05</span>' +
    '            <p class="eyebrow">For our eyes only</p>' +
    '            <h2>Proof that we\'re<br><em>our own little universe.</em></h2>' +
    '            <div class="joke-cards">' +
    '                {{#each jokeCards}}<article>{{this}}</article>{{/each}}' +
    '            </div><button class="button advance">One last thing <span>→</span></button>' +
    '        </div>' +
    '        <div class="experience-screen finale" data-screen="4"><span class="exp-label">05 / 05</span>' +
    '            <p class="eyebrow">A memory for you</p>' +
    '            <div class="final-photo"><span>♡</span><small>put your favourite photo here</small></div><button class="music">♫ Play our song</button>' +
    '            <h2>Wherever we are,<br>I\'m <em>with you.</em></h2>' +
    '            <p>{{footerText}}</p>' +
    '        </div>' +
    '    </main>' +
    '</body>' +
    '</html>';

  var Template = {
    id: "elegant-love-letter",
    name: "Elegant Love Letter",
    description: "A slower, more intimate five-screen love letter experience.",
    pages: [
      { id: "opening", label: "Opening" },
      { id: "notes", label: "Things I Adore" },
      { id: "burst", label: "Heart Reveal" },
      { id: "jokes", label: "Inside Jokes" },
      { id: "finale", label: "Finale" }
    ],
    themes: [
      { id: "blush", name: "Blush", dots: ["#f8d7e3", "#f5a3b8", "#ee7a9d"] },
      { id: "lavender", name: "Lavender", dots: ["#e2d9ff", "#c4b5fd", "#a78bfa"] },
      { id: "rose", name: "Rose", dots: ["#ffd1d9", "#ff9aa2", "#e85d75"] },
      { id: "gold", name: "Gold", dots: ["#fff3d4", "#ffe08a", "#d4a017"] }
    ],
    defaultTheme: "blush",
    defaultData: {
      theme: "blush",
      siteTitle: "A Little Something For You",
      recipientName: "Buu",
      eyebrow: "A LittleSomething for you",
      heading: "Hey, {{recipientName}}. I made this just for you.",
      subtext: "There are a few things I've been meaning to say — the kind worth opening slowly.",
      notes: [
        "You make ordinary Tuesdays feel like tiny adventures.",
        "Your laugh is still my favourite sound in a crowded room.",
        "You remember the little things. That matters more than you know."
      ],
      burstHeading: "One more thing?",
      burstRevealText: "I am so lucky to love you.",
      jokeCards: [
        "That time we said 'we'll just get chai' and came home three hours later.",
        "The dramatic way you say 'I'm fine' when you are very much not fine.",
        "Our highly debated, completely incorrect theory about pigeons."
      ],
      finalPhoto: { src: "", alt: "Our favourite photo" },
      finalSong: { src: "", name: "" },
      footerText: "Made with a whole lot of love."
    },
    fields: [
      { id: "recipientName", label: "Their name", type: "text", required: true, maxLength: 40, page: "global" },
      { id: "siteTitle", label: "Browser tab title", type: "text", maxLength: 60, page: "global" },
      { id: "eyebrow", label: "Eyebrow label", type: "text", maxLength: 60, page: "opening" },
      { id: "heading", label: "Heading", type: "text", maxLength: 80, page: "opening" },
      { id: "subtext", label: "Subtext", type: "textarea", maxLength: 200, page: "opening" },
      { id: "notes", label: "Things I adore", type: "array", itemType: "text", minItems: 2, maxItems: 5, page: "notes" },
      { id: "burstHeading", label: "Burst heading", type: "text", maxLength: 60, page: "burst" },
      { id: "burstRevealText", label: "Reveal text", type: "text", maxLength: 100, page: "burst" },
      { id: "jokeCards", label: "Inside jokes", type: "array", itemType: "text", minItems: 2, maxItems: 4, page: "jokes" },
      { id: "finalPhoto", label: "Your photo", type: "image", page: "finale" },
      { id: "finalSong", label: "Your song", type: "audio", page: "finale" },
      { id: "footerText", label: "Footer note", type: "text", maxLength: 120, page: "finale" }
    ],

    renderBody: function (data) {
      var html = renderPlaceholders(TEMPLATE_HTML, resolveNestedName(data));
      if (data.finalPhoto && data.finalPhoto.src) {
        html = html.replace(
          '<div class="final-photo"><span>♡</span><small>put your favourite photo here</small></div>',
          '<div class="final-photo"><img src="' + esc(data.finalPhoto.src) + '" alt="' + esc(data.finalPhoto.alt || "Photo") + '"></div>'
        );
      }
      if (data.finalSong && data.finalSong.src) {
        html = html.replace(
          '<button class="music">♫ Play our song</button>',
          '<audio id="bgAudio" loop><source src="' + esc(data.finalSong.src) + '"></audio><button class="music" id="musicToggle" type="button">♫ Play our song</button>'
        );
      }
      var bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      return bodyMatch ? bodyMatch[1] : html;
    },

    getInteractions: function (data) {
      return '' +
        'var screens=[...document.querySelectorAll(".experience-screen")];' +
        'var current=0;' +
        'document.querySelectorAll(".advance").forEach(function(b){' +
          'b.onclick=function(){' +
            'screens[current].classList.remove("active");' +
            'current=Math.min(current+1,screens.length-1);' +
            'screens[current].classList.add("active");' +
          '};' +
        '});' +
        'document.querySelector(".heart-button").onclick=function(){' +
          'document.querySelector(".burst").classList.add("revealed");' +
        '};' +
        (data.finalSong && data.finalSong.src ? '' +
          'document.getElementById("musicToggle").onclick=function(){' +
            'var audio=document.getElementById("bgAudio");' +
            'if(audio.paused){audio.play();this.textContent="♫ Pause our song…";}' +
            'else{audio.pause();this.textContent="♫ Play our song";}' +
          '};' : '');
    },

    getAssetPath: function (relativePath) {
      return "templates/elegant-love-letter/" + relativePath;
    }
  };

  if (global.TemplateEngine) {
    global.TemplateEngine.register(Template);
  } else {
    global._pendingTemplates = global._pendingTemplates || [];
    global._pendingTemplates.push(Template);
  }

})(typeof window !== "undefined" ? window : globalThis);