/* =====================================================
   TEMPLATE: Playful Love Journey
   A playful five-page click-through surprise.
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
    return esc(str).split("\n").map((l) => l).join("<br>");
  }

  function withName(str, name) {
    return String(str || "").replace(/\{name\}/gi, () => name);
  }

  function renderMemeBox(box) {
    return '<div class="meme-box">' +
      '<p>' + escLines(box.caption) + '</p>' +
      '<img src="' + esc(box.gif && box.gif.src) + '" alt="' + esc((box.gif && box.gif.alt) || "meme") + '" class="cat-gif">' +
      '</div>';
  }

  var FINAL_LINE_STYLES = ["normal", "love", "normal", "accent"];

  function renderFinalLine(text, style, name) {
    var rendered = escLines(withName(text, esc(name)));
    if (style === "love") return '<h2 class="final-love">' + rendered + '</h2>';
    if (style === "accent")
      return '<p class="final-line" style="color:var(--red-accent); font-weight:800;">' + rendered + '</p>';
    return '<p class="final-line">' + rendered + '</p>';
  }

  const Template = {
    id: "playful-love-journey",
    name: "Playful Love Journey",
    description: "A playful five-page surprise full of cats, memories and little reveals.",
    pages: [
      { id: "opening", label: "Page 1 — Opening" },
      { id: "appreciation", label: "Page 2 — Appreciation" },
      { id: "confession", label: "Page 3 — Heart Burst" },
      { id: "memes", label: "Page 4 — Meme Roast" },
      { id: "finale", label: "Page 5 — Finale" }
    ],
    themes: [
      { id: "romantic", name: "Romantic", dots: ["#ffb8d2", "#ff8fb3", "#ff5d7a"] },
      { id: "cute", name: "Cute", dots: ["#cdb8ff", "#a78bfa", "#7c5cff"] },
      { id: "elegant", name: "Elegant", dots: ["#ffb98f", "#ff8a5c", "#ff5d3d"] },
      { id: "dreamy", name: "Dreamy", dots: ["#a9e8cb", "#4fc990", "#1fae6f"] }
    ],
    defaultTheme: "romantic",
    defaultData: {
      theme: "romantic",
      siteTitle: "For Buu 💗",
      recipientName: "Buu",
      eyebrow: "a little something for you",
      heading: "Hiii {name} 💗",
      subtext: "I made a little something for you...\nBut you have to click around to discover it hehe 👉👈",
      gifOpening: { src: "/assets/gifs/happy-cat.gif", alt: "Cute waiting cat" },
      startButtonLabel: "Start the surprise 💗",
      appreciationHeading: "Okay... now let me tell you something 🥺💗",
      appreciationLines: [
        "Thank you for being you.",
        "Thank you for all the little things you do.",
        "Thank you for making ordinary days feel a little more special.",
        "I don't always say it enough, but I really appreciate having you in my life."
      ],
      appreciationEmphLine: "You're genuinely one of my favourite people in this entire world. 💗",
      gifAppreciation: { src: "/assets/gifs/dudu-pat-bubu-dudu.gif", alt: "Cute love cat" },
      appreciationOutro: "Okay okay... enough wholesome stuff 😭",
      continueButtonLabel: "There's more... 👀 →",
      confessionPrompt: "I have something very important to say...",
      confessionButtonLabel: "Click me 🥺",
      loveText: "LOVE YOU {NAME} 💗",
      gifConfession: { src: "/assets/gifs/friday.gif", alt: "Proposing cat" },
      confessionOutro: "Okay, I'm done being cheesy... probably.",
      continueButtonLabel2: "Continue → 😂",
      burstMessages: ["sooooo much 💗", "hehe", "mwah 😚", "my {name} 🥺"],
      memesHeading: "Okay enough romance. Time for nonsense. 😂",
      memeBoxes: [
        { caption: "You when I go out with my friends:", gif: { src: "/assets/gifs/bubu-angry-bubu-fierce.gif", alt: "Angry cat" } },
        { caption: "You when i wake up late:", gif: { src: "/assets/gifs/that's-what-i-prefer-cute-angry-cat.gif", alt: "Angry cat" } },
        { caption: "You for no reason:", gif: { src: "/assets/gifs/angry-cat.gif", alt: "Angry cat" } }
      ],
      laughButtonLabel: "Press this if you agree 😂",
      laughRevealInitial: "I KNEW IT 😭",
      laughRevealFollowup: "I KNEW IT 😭 — don't worry, I won't tell anyone.",
      lastThingButtonLabel: "One last thing... 💗",
      finalPhoto: { src: "/assets/our-photo.jpg", alt: "Our photo" },
      finalSong: { src: "/assets/our-song.mp3" },
      musicButtonLabel: "🎵 Play our song",
      finalLine0: "And finally...",
      finalLine1: "I'm really lucky to have you. 💗",
      finalLine2: "I love you, {name}.",
      finalLine3: "Always remember that. 🥺💕",
      gifFinal: { src: "/assets/gifs/yapapa-yapapa-cat.gif", alt: "Cute love cat" },
      footerText: "Made with way too much love and questionable amounts of coding. 😂💗"
    },
    fields: [
      { id: "recipientName", label: "Their name", type: "text", required: true, maxLength: 40, page: "global" },
      { id: "siteTitle", label: "Browser tab title", type: "text", maxLength: 60, page: "global" },
      { id: "eyebrow", label: "Eyebrow label", type: "text", maxLength: 60, page: "opening" },
      { id: "heading", label: "Heading", type: "text", maxLength: 80, page: "opening" },
      { id: "subtext", label: "Subtext", type: "textarea", maxLength: 240, page: "opening" },
      { id: "startButtonLabel", label: "Start button label", type: "text", maxLength: 40, page: "opening" },
      { id: "gifOpening", label: "Opening GIF", type: "gif", page: "opening" },
      { id: "appreciationHeading", label: "Heading", type: "text", maxLength: 80, page: "appreciation" },
      { id: "appreciationLines", label: "Message lines", type: "array", itemType: "text", minItems: 2, maxItems: 6, page: "appreciation" },
      { id: "appreciationEmphLine", label: "Final emphasized line", type: "text", maxLength: 140, page: "appreciation" },
      { id: "appreciationOutro", label: "Outro line", type: "text", maxLength: 80, page: "appreciation" },
      { id: "continueButtonLabel", label: "Continue button label", type: "text", maxLength: 40, page: "appreciation" },
      { id: "gifAppreciation", label: "Appreciation GIF", type: "gif", page: "appreciation" },
      { id: "confessionPrompt", label: "Prompt text", type: "text", maxLength: 80, page: "confession" },
      { id: "confessionButtonLabel", label: "Button label", type: "text", maxLength: 40, page: "confession" },
      { id: "loveText", label: "Big love text", type: "text", maxLength: 60, page: "confession" },
      { id: "confessionOutro", label: "Outro line", type: "text", maxLength: 80, page: "confession" },
      { id: "continueButtonLabel2", label: "Continue button label", type: "text", maxLength: 40, page: "confession" },
      { id: "burstMessages", label: "Floating messages", type: "array", itemType: "text", maxItems: 8, page: "confession" },
      { id: "gifConfession", label: "Confession GIF", type: "gif", page: "confession" },
      { id: "memesHeading", label: "Heading", type: "text", maxLength: 80, page: "memes" },
      { id: "laughButtonLabel", label: "\"Press this\" button label", type: "text", maxLength: 40, page: "memes" },
      { id: "laughRevealInitial", label: "Reveal text (first)", type: "text", maxLength: 60, page: "memes" },
      { id: "laughRevealFollowup", label: "Reveal text (after 1.4s)", type: "text", maxLength: 120, page: "memes" },
      { id: "lastThingButtonLabel", label: "Next button label", type: "text", maxLength: 40, page: "memes" },
      { id: "memeBoxes", label: "Meme boxes", type: "array", itemType: "memeBox", minItems: 1, maxItems: 6, page: "memes" },
      { id: "finalPhoto", label: "Your photo", type: "image", page: "finale" },
      { id: "finalSong", label: "Your song", type: "audio", page: "finale" },
      { id: "musicButtonLabel", label: "Music button label", type: "text", maxLength: 40, page: "finale" },
      { id: "finalLine0", label: "Line 1", type: "text", maxLength: 60, page: "finale" },
      { id: "finalLine1", label: "Big love line", type: "text", maxLength: 80, page: "finale" },
      { id: "finalLine2", label: "Line 3 (their name is inserted automatically)", type: "text", maxLength: 60, page: "finale" },
      { id: "finalLine3", label: "Line 4", type: "text", maxLength: 60, page: "finale" },
      { id: "gifFinal", label: "Finale GIF", type: "gif", page: "finale" },
      { id: "footerText", label: "Footer note", type: "text", maxLength: 100, page: "finale" }
    ],

    renderBody: function (data) {
      var c = data;
      var name = esc(c.recipientName || "you");
      var nameUpper = esc((c.recipientName || "you").toUpperCase());

      var appreciationLinesHTML = c.appreciationLines
        .map(function (l) { return "<p>" + escLines(l) + "</p>"; })
        .join("\n        ");

      var memeBoxesHTML = c.memeBoxes.map(renderMemeBox).join("\n");

      var finalLineTexts = [c.finalLine0, c.finalLine1, c.finalLine2, c.finalLine3];
      var finalLinesHTML = finalLineTexts
        .map(function (text, i) { return renderFinalLine(text || "", FINAL_LINE_STYLES[i], name); })
        .join("\n      ");

      var photoBlock = c.finalPhoto && c.finalPhoto.src
        ? '<img id="ourPhoto" src="' + esc(c.finalPhoto.src) + '" alt="' + esc(c.finalPhoto.alt || "Our photo") + '" style="display:block;">'
        : '<div class="placeholder-text" id="photoPlaceholder">Add your photo<br><span style="font-weight:400; font-size:0.85rem;">(Photos tab in the builder)</span></div>';

      return '<div class="float-layer" id="floatLayer"></div>' +

        '<section class="page active" id="page1">' +
          '<div class="eyebrow">' + escLines(c.eyebrow) + '</div>' +
          '<h1 class="hero">' + escLines(withName(c.heading, name)) + '</h1>' +
          '<p class="sub">' + escLines(withName(c.subtext, name)) + '</p>' +
          '<div class="cat-card">' +
            '<img src="' + esc(c.gifOpening.src) + '" alt="' + esc(c.gifOpening.alt || "gif") + '" class="cat-gif">' +
          '</div>' +
          '<div class="waiting-text">The cat is waiting...</div>' +
          '<button class="btn" style="margin-top:1.6rem" onclick="goTo(2)">' + escLines(c.startButtonLabel) + '</button>' +
        '</section>' +

        '<section class="page" id="page2">' +
          '<button class="home-btn" onclick="goTo(1)">🏠 Home</button>' +
          '<h2 class="hero" style="font-size:clamp(1.6rem,5vw,2.2rem)">' + escLines(withName(c.appreciationHeading, name)) + '</h2>' +
          '<div class="card" style="margin-top:1.4rem;">' +
            appreciationLinesHTML +
            '<p class="emph">' + escLines(withName(c.appreciationEmphLine, name)) + '</p>' +
          '</div>' +
          '<div class="cat-card" style="margin-top:1.6rem;">' +
            '<img src="' + esc(c.gifAppreciation.src) + '" alt="' + esc(c.gifAppreciation.alt || "gif") + '" class="cat-gif">' +
          '</div>' +
          '<p class="sub" style="margin-top:0.6rem;">' + escLines(c.appreciationOutro) + '</p>' +
          '<button class="btn" onclick="goTo(3)">' + escLines(c.continueButtonLabel) + '</button>' +
        '</section>' +

        '<section class="page" id="page3">' +
          '<button class="home-btn" onclick="goTo(1)">🏠 Home</button>' +
          '<div class="burst-layer" id="burstLayer"></div>' +
          '<div id="page3-before">' +
            '<p class="sub" style="font-size:1.2rem;">' + escLines(c.confessionPrompt) + '</p>' +
            '<button class="btn" onclick="triggerBurst()">' + escLines(c.confessionButtonLabel) + '</button>' +
          '</div>' +
          '<div id="page3-after" style="display:none; position:relative; z-index:5;">' +
            '<div class="love-text">' + escLines(withName(c.loveText, nameUpper)) + '</div>' +
            '<div class="cat-card" style="margin-top:0.8rem;">' +
              '<img src="' + esc(c.gifConfession.src) + '" alt="' + esc(c.gifConfession.alt || "gif") + '" class="cat-gif">' +
            '</div>' +
            '<div id="page3-continue" style="margin-top:1.6rem; opacity:0; transition:opacity 0.6s ease;">' +
              '<p class="sub">' + escLines(c.confessionOutro) + '</p>' +
              '<button class="btn" onclick="goTo(4)">' + escLines(c.continueButtonLabel2) + '</button>' +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="page" id="page4">' +
          '<button class="home-btn" onclick="goTo(1)">🏠 Home</button>' +
          '<h2 class="hero" style="font-size:clamp(1.6rem,5vw,2.2rem)">' + escLines(c.memesHeading) + '</h2>' +
          '<div class="meme-grid">' + memeBoxesHTML + '</div>' +
          '<button class="btn secondary" id="laughBtn" onclick="revealLaugh()">' + escLines(c.laughButtonLabel) + '</button>' +
          '<div class="laugh-reveal" id="laughReveal" style="display:none;"></div>' +
          '<button class="btn" style="margin-top:1.8rem; display:none;" id="lastThingBtn" onclick="goTo(5)">' + escLines(c.lastThingButtonLabel) + '</button>' +
        '</section>' +

        '<section class="page" id="page5">' +
          '<button class="home-btn" onclick="goTo(1)">🏠 Home</button>' +
          '<div class="photo-frame" id="photoFrame">' +
            photoBlock +
            '<span class="glow-heart" style="top:6%; left:8%;">💗</span>' +
            '<span class="glow-heart" style="bottom:8%; right:10%; animation-delay:1s;">✨</span>' +
          '</div>' +
          '<audio id="bgAudio" loop>' +
            (c.finalSong && c.finalSong.src ? '<source src="' + esc(c.finalSong.src) + '">' : "") +
          '</audio>' +
          '<button class="music-btn" id="musicBtn" onclick="toggleMusic()">' + escLines(c.musicButtonLabel) + '</button>' +
          finalLinesHTML +
          '<div class="cat-card" style="margin-top:1rem;">' +
            '<img src="' + esc(c.gifFinal.src) + '" alt="' + esc(c.gifFinal.alt || "gif") + '" class="cat-gif">' +
          '</div>' +
          '<footer class="made-with">' + escLines(c.footerText) + '</footer>' +
        '</section>';
    },

    getInteractions: function (data) {
      var burstMsgs = JSON.stringify(
        data.burstMessages.map(function (m) { return withName(m, data.recipientName || "you"); })
      );
      var hasSong = !!(data.finalSong && data.finalSong.src);
      var laughInitial = JSON.stringify(data.laughRevealInitial);
      var laughFollowup = JSON.stringify(data.laughRevealFollowup);

      return '' +
        'function goTo(n){' +
          'document.querySelectorAll(".page").forEach(function(p){p.classList.remove("active")});' +
          'document.getElementById("page" + n).classList.add("active");' +
          'window.scrollTo({top:0, behavior:"smooth"});' +
        '}' +
        'var floatSymbols = ["💗","✨","💕","⭐","🎀","💖"];' +
        'var floatLayer = document.getElementById("floatLayer");' +
        'function spawnFloatItem(){' +
          'var el = document.createElement("div");' +
          'el.className = "float-item";' +
          'el.textContent = floatSymbols[Math.floor(Math.random()*floatSymbols.length)];' +
          'var size = 0.9 + Math.random()*1.4;' +
          'el.style.fontSize = size + "rem";' +
          'el.style.left = Math.random()*100 + "vw";' +
          'el.style.setProperty("--drift", (Math.random()*80 - 40) + "px");' +
          'var duration = 9 + Math.random()*8;' +
          'el.style.animationDuration = duration + "s";' +
          'floatLayer.appendChild(el);' +
          'setTimeout(function(){ el.remove(); }, duration*1000 + 500);' +
        '}' +
        'setInterval(spawnFloatItem, 700);' +
        'for(var i=0;i<8;i++) setTimeout(spawnFloatItem, i*300);' +
        'var burstInterval = null;' +
        'function triggerBurst(){' +
          'document.getElementById("page3-before").style.display = "none";' +
          'document.getElementById("page3-after").style.display = "block";' +
          'var burstLayer = document.getElementById("burstLayer");' +
          'var hearts = ["💗","💕","💖","❤️","✨"];' +
          'var count = 0;' +
          'var maxCount = 70;' +
          'burstInterval = setInterval(function(){' +
            'for(var i=0; i<3 && count < maxCount; i++, count++){' +
              'var h = document.createElement("div");' +
              'h.className = "burst-heart" + (Math.random() > 0.6 ? " fall" : "");' +
              'h.textContent = hearts[Math.floor(Math.random()*hearts.length)];' +
              'h.style.left = Math.random()*100 + "vw";' +
              'h.style.fontSize = (1 + Math.random()*1.6) + "rem";' +
              'var dur = 3 + Math.random()*2.5;' +
              'h.style.animationDuration = dur + "s";' +
              'burstLayer.appendChild(h);' +
              'setTimeout(function(){ h.remove(); }, dur*1000 + 200);' +
            '}' +
            'if (count >= maxCount) clearInterval(burstInterval);' +
          '}, 180);' +
          'var msgs = ' + burstMsgs + ';' +
          'msgs.forEach(function(msg, i){' +
            'setTimeout(function(){' +
              'var el = document.createElement("div");' +
              'el.className = "tiny-float-msg";' +
              'el.textContent = msg;' +
              'el.style.left = (15 + Math.random()*60) + "vw";' +
              'el.style.top = (30 + Math.random()*30) + "vh";' +
              'document.getElementById("page3").appendChild(el);' +
              'setTimeout(function(){ el.remove(); }, 3200);' +
            '}, 900 + i*1300);' +
          '});' +
          'setTimeout(function(){' +
            'document.getElementById("page3-continue").style.opacity = "1";' +
          '}, 5200);' +
        '}' +
        'function revealLaugh(){' +
          'var reveal = document.getElementById("laughReveal");' +
          'reveal.style.display = "block";' +
          'reveal.textContent = ' + laughInitial + ';' +
          'document.getElementById("laughBtn").style.display = "none";' +
          'setTimeout(function(){' +
            'reveal.textContent = ' + laughFollowup + ';' +
            'document.getElementById("lastThingBtn").style.display = "inline-block";' +
          '}, 1400);' +
        '}' +
        'function toggleMusic(){' +
          'var audio = document.getElementById("bgAudio");' +
          'var btn = document.getElementById("musicBtn");' +
          'if (!' + hasSong + '){' +
            'var original = btn.textContent;' +
            'btn.textContent = "🎵 Add a song in the Music tab!";' +
            'setTimeout(function(){ btn.textContent = original; }, 2200);' +
            'return;' +
          '}' +
          'if (audio.paused){' +
            'audio.volume = 0.35;' +
            'audio.play();' +
            'btn.textContent = "⏸ Pause music";' +
          '} else {' +
            'audio.pause();' +
            'btn.textContent = ' + JSON.stringify(data.musicButtonLabel) + ';' +
          '}' +
        '}';
    },

    getAssetPath: function (relativePath) {
      return "templates/playful-love-journey/" + relativePath;
    }
  };

  if (global.TemplateEngine) {
    global.TemplateEngine.register(Template);
  } else {
    global._pendingTemplates = global._pendingTemplates || [];
    global._pendingTemplates.push(Template);
  }

})(typeof window !== "undefined" ? window : globalThis);