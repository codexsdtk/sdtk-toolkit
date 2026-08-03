/* BK-279 — element-targeting annotate bridge for the wiki Design tab.
 * Injected into a prototype screen's HTML (served via /design/**?annotate=1).
 * Vanilla, zero-dependency; ported/stripped from sdtk-design-kit's
 * design-studio.html sdtkBridge() (itself adapted from open-design bridge.ts).
 * Hover-highlights + click-selects an element, then postMessages a descriptor to
 * the parent wiki viewer. It only reports selections — it never edits the screen. */
(function () {
  var HOST_SEL = "[data-sdtk-bridge],[data-sdtk-bridge-style]";
  var DISCOVER =
    "main,nav,section,article,aside,header,footer,div,h1,h2,h3,h4,h5,h6,p,a,button,img,ul,ol,li,dl,dt,dd,table,thead,tbody,tr,td,th,blockquote,figure,figcaption,label,span,strong,em";
  var enabled = false;

  function isHost(el) { return !!(el && el.matches && el.matches(HOST_SEL)); }

  function domPath(el) {
    var parts = [], node = el;
    while (node && node !== document.body) {
      var p = node.parentElement; if (!p) break;
      var kids = Array.prototype.slice.call(p.children).filter(function (c) { return !isHost(c); });
      parts.unshift(kids.indexOf(node)); node = p;
    }
    return parts.length ? "path-" + parts.join("-") : "";
  }
  function stableId(el) {
    var ex = el.getAttribute("data-sdtk-id"); if (ex) return ex;
    var gen = el.getAttribute("data-sdtk-runtime-id") || domPath(el);
    if (gen) el.setAttribute("data-sdtk-runtime-id", gen);
    return gen || "unknown";
  }
  function cssSelector(el) {
    if (el.id) return el.tagName.toLowerCase() + "#" + el.id;
    var tag = el.tagName.toLowerCase();
    var cls = (typeof el.className === "string" && el.className.trim())
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    var p = el.parentElement, nth = "";
    if (p) {
      var same = Array.prototype.slice.call(p.children).filter(function (c) { return c.tagName === el.tagName; });
      if (same.length > 1) nth = ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
    }
    return tag + cls + nth;
  }
  function labelFor(el) {
    var t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t) return t.slice(0, 48);
    if (el.tagName.toLowerCase() === "img") return el.getAttribute("alt") || "image";
    return el.tagName.toLowerCase();
  }
  function styleSubset(el) {
    var c = window.getComputedStyle(el);
    var keys = ["color", "backgroundColor", "fontSize", "fontWeight", "lineHeight", "textAlign", "fontFamily", "padding", "margin", "borderRadius", "display"];
    var o = {}; keys.forEach(function (k) { if (c[k]) o[k] = c[k]; }); return o;
  }
  function descriptor(el) {
    var r = el.getBoundingClientRect();
    return {
      stableId: stableId(el), selector: cssSelector(el), label: labelFor(el), tagName: el.tagName.toLowerCase(),
      position: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      currentText: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
      htmlHint: (el.outerHTML || "").replace(/\sdata-sdtk-runtime-id="[^"]*"/g, "").slice(0, 400),
      computedStyle: styleSubset(el)
    };
  }
  function closest(ev) {
    var el = ev.target;
    while (el && el !== document.documentElement) {
      if (el !== document.body && !isHost(el) && el.matches && el.matches(DISCOVER)) {
        var r = el.getBoundingClientRect(); if (r.width >= 6 && r.height >= 6) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener("mouseover", function (ev) {
    if (!enabled) return; var el = closest(ev);
    document.querySelectorAll("[data-sdtk-hover]").forEach(function (n) { n.removeAttribute("data-sdtk-hover"); });
    if (el) el.setAttribute("data-sdtk-hover", "1");
  }, true);

  document.addEventListener("click", function (ev) {
    if (!enabled) return; ev.preventDefault(); ev.stopPropagation();
    var el = closest(ev); if (!el) return;
    window.parent.postMessage({ type: "sdtk-select", shift: !!ev.shiftKey, target: descriptor(el) }, "*");
  }, true);

  window.addEventListener("message", function (ev) {
    if (!ev.data || ev.data.type !== "sdtk-annotate") return;
    enabled = !!ev.data.enabled;
    document.documentElement.toggleAttribute("data-sdtk-annotate", enabled);
    if (!enabled) document.querySelectorAll("[data-sdtk-hover]").forEach(function (n) { n.removeAttribute("data-sdtk-hover"); });
  });

  // Inject the hover/cursor style (carries the host marker so it is excluded
  // from element discovery and the DOM-path index).
  try {
    var style = document.createElement("style");
    style.setAttribute("data-sdtk-bridge-style", "");
    style.textContent =
      "html[data-sdtk-annotate] *{cursor:crosshair!important}" +
      "html[data-sdtk-annotate] [data-sdtk-hover]{outline:2px solid #58a6ff!important;outline-offset:2px!important;background:rgba(88,166,255,.10)!important}";
    (document.head || document.documentElement).appendChild(style);
  } catch (_e) {}

  window.parent.postMessage({ type: "sdtk-bridge-ready" }, "*");
})();
