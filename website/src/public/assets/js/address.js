/*
  Address autocomplete with a service-area check.
  Suggestions come from Photon (photon.komoot.io), a free OpenStreetMap
  geocoder that needs no API key. Results are biased toward Pittsburgh.
*/
(function () {
  var cfg = window.SHINE;
  var PHOTON = "https://photon.komoot.io/api/";
  var BBOX = "-80.75,39.9,-79.2,41.0"; // Greater Pittsburgh region

  function milesBetween(a, b) {
    var R = 3958.8;
    var toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad;
    var dLon = (b.lon - a.lon) * toRad;
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  var STATE_ABBR = { Pennsylvania: "PA", Ohio: "OH", "West Virginia": "WV" };

  function toPlace(feature) {
    var p = feature.properties || {};
    var street = p.street || "";
    var line1 = p.housenumber && street ? p.housenumber + " " + street : street || p.name || "";
    if (p.name && p.name !== street && p.housenumber == null && p.osm_key !== "highway" && p.osm_key !== "place") {
      line1 = p.name + (street ? ", " + street : "");
    }
    var city = p.city || p.town || p.village || p.locality || p.district || p.county || "";
    var state = STATE_ABBR[p.state] || p.state || "";
    var zip = p.postcode || "";
    var lon = feature.geometry.coordinates[0];
    var lat = feature.geometry.coordinates[1];
    var second = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    var miles = milesBetween(cfg.base, { lat: lat, lon: lon });
    return {
      line1: line1 || city,
      line2: second,
      label: [line1, second].filter(Boolean).join(", "),
      city: city,
      state: state,
      zip: zip,
      lat: lat,
      lon: lon,
      miles: miles,
      inArea: miles <= cfg.serviceRadiusMiles
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function attach(root, opts) {
    opts = opts || {};
    var input = root.querySelector("input");
    var list = root.querySelector(".suggestions");
    var items = [];
    var active = -1;
    var timer = null;
    var controller = null;
    var lastQuery = "";

    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    }

    function open() {
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function highlight(i) {
      var nodes = list.querySelectorAll("[role=option]");
      nodes.forEach(function (n, idx) {
        n.setAttribute("aria-selected", idx === i ? "true" : "false");
      });
      active = i;
      if (nodes[i]) {
        input.setAttribute("aria-activedescendant", nodes[i].id);
        nodes[i].scrollIntoView({ block: "nearest" });
      }
    }

    function render() {
      if (!items.length) {
        list.innerHTML =
          '<li class="empty">No matches yet. Keep typing, or enter your full address and we\'ll confirm it.</li>';
        open();
        return;
      }
      list.innerHTML =
        items
          .map(function (p, i) {
            return (
              '<li role="option" id="' + list.id + "-opt-" + i + '" aria-selected="false" data-i="' + i + '">' +
              '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-pin" /></svg>' +
              "<div><strong>" + escapeHtml(p.line1) + "</strong><span>" + escapeHtml(p.line2) + "</span></div></li>"
            );
          })
          .join("") + '<li class="credit" aria-hidden="true">Address search © OpenStreetMap contributors</li>';
      open();
    }

    function choose(i) {
      var place = items[i];
      if (!place) return;
      input.value = place.label;
      close();
      if (opts.onSelect) opts.onSelect(place);
    }

    function search(q) {
      if (controller) controller.abort();
      controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var url =
        PHOTON +
        "?q=" + encodeURIComponent(q) +
        "&lat=" + cfg.base.lat + "&lon=" + cfg.base.lon +
        "&bbox=" + BBOX + "&limit=8&lang=en";
      fetch(url, controller ? { signal: controller.signal } : undefined)
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (q !== lastQuery) return;
          var seen = {};
          items = (data.features || [])
            .filter(function (f) {
              var p = f.properties || {};
              return p.countrycode === "US" && (p.street || p.name);
            })
            .map(toPlace)
            .filter(function (p) {
              if (seen[p.label]) return false;
              seen[p.label] = true;
              return true;
            })
            .slice(0, 5);
          render();
        })
        .catch(function (err) {
          if (err && err.name === "AbortError") return;
          close();
        });
    }

    input.addEventListener("input", function () {
      var q = input.value.trim();
      if (opts.onInput) opts.onInput();
      clearTimeout(timer);
      if (q.length < 3) {
        close();
        return;
      }
      lastQuery = q;
      timer = setTimeout(function () {
        search(q);
      }, 220);
    });

    input.addEventListener("keydown", function (e) {
      if (list.hidden) return;
      var count = items.length;
      if (e.key === "ArrowDown" && count) {
        e.preventDefault();
        highlight((active + 1) % count);
      } else if (e.key === "ArrowUp" && count) {
        e.preventDefault();
        highlight((active - 1 + count) % count);
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        choose(active);
      } else if (e.key === "Escape") {
        close();
      }
    });

    list.addEventListener("mousedown", function (e) {
      var li = e.target.closest("[role=option]");
      if (!li) return;
      e.preventDefault();
      choose(Number(li.getAttribute("data-i")));
    });

    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) close();
    });
  }

  function describeArea(place) {
    if (place.inArea) {
      return {
        ok: true,
        text: "Great news, you're in our service area" + (place.city ? " (" + place.city + ")" : "") + "."
      };
    }
    return {
      ok: false,
      text:
        "You're about " + Math.round(place.miles) +
        " miles from Downtown, just outside our usual area. Book anyway and we'll confirm by phone."
    };
  }

  window.ShineAddress = { attach: attach, describeArea: describeArea };
})();
