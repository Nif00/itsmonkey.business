(() => {
  "use strict";

  const counter = document.querySelector("[data-site-counter]");
  if (!counter) return;

  const goatCounterBase = "https://nif0.goatcounter.com";
  const tracker = document.createElement("script");
  tracker.async = true;
  tracker.src = "https://gc.zgo.at/count.js";
  tracker.dataset.goatcounter = goatCounterBase + "/count";

  const showCount = async () => {
    const goatData =
      window.goatcounter && typeof window.goatcounter.get_data === "function"
        ? window.goatcounter.get_data()
        : {};
    const path = goatData.p || window.location.pathname;
    const endpoint =
      goatCounterBase + "/counter/" + encodeURIComponent(path) + ".json";

    try {
      const response = await fetch(endpoint, { credentials: "omit" });
      if (!response.ok) throw new Error("Visitor count unavailable");
      const data = await response.json();
      const count =
        typeof data.count === "string"
          ? data.count
          : data.count == null
            ? ""
            : String(data.count);
      if (!count) return;
      counter.textContent = "visitors: " + count;
      counter.hidden = false;
    } catch {
      // The public counter may be disabled in GoatCounter settings.
    }
  };

  tracker.addEventListener("load", showCount, { once: true });
  document.head.appendChild(tracker);
})();
