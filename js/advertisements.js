
/* ============================================================
   ICMTA ADVERTISEMENT POPUP — FRONTEND LOGIC
   ------------------------------------------------------------
   Features:
   - Fetches all active advertisements from the public API
   - Displays the newest advertisement first
   - Opens the popup after a 4-second delay
   - Automatically rotates between advertisements
   - Supports closing via button, overlay, or Escape
   - Handles invalid URLs and failed banner images
   ============================================================ */

(() => {
  "use strict";

  const API_BASE_URL = "http://localhost:5000";
  const PAGE = "home";
  const POPUP_DELAY_MS = 4000;
  const ROTATION_INTERVAL_MS = 3000;

  function initializeAdvertisementPopup() {
    const modal = document.getElementById("advertisement-modal");
    const closeButton = document.getElementById("advertisement-close");
    const overlay = modal?.querySelector(".advertisement-overlay");
    const link = document.getElementById("advertisement-link");
    const image = document.getElementById("advertisement-image");
    const title = document.getElementById("advertisement-title");
    const description = document.getElementById(
      "advertisement-description"
    );

    if (
      !modal ||
      !closeButton ||
      !overlay ||
      !link ||
      !image ||
      !title ||
      !description
    ) {
      console.error(
        "[ICMTA Advertisement] Required popup HTML elements are missing."
      );
      return;
    }

    let advertisements = [];
    let currentIndex = 0;
    let rotationTimer = null;

    function closePopup() {
      modal.hidden = true;
      document.body.style.overflow = "";

      if (rotationTimer !== null) {
        window.clearInterval(rotationTimer);
        rotationTimer = null;
      }

      document.removeEventListener("keydown", handleKeydown);
    }

    function handleKeydown(event) {
      if (event.key === "Escape" && !modal.hidden) {
        closePopup();
      }
    }

    function showAdvertisement(advertisement) {
      if (!advertisement || !advertisement.image_url) {
        return false;
      }

      const imageUrl = new URL(
        advertisement.image_url,
        API_BASE_URL
      );

      // Update the image and its text.
      title.textContent = advertisement.title || "Advertisement";
      description.textContent = advertisement.description || "";
      image.alt = advertisement.title || "Advertisement";

      // Validate the destination URL.
      if (advertisement.destination_url) {
        try {
          const destination = new URL(
            advertisement.destination_url
          );

          if (
            destination.protocol !== "https:" &&
            destination.protocol !== "http:"
          ) {
            throw new Error("Unsupported destination URL protocol.");
          }

          link.href = destination.href;
          link.style.pointerEvents = "auto";
          link.removeAttribute("aria-disabled");
        } catch (error) {
          console.error(
            "[ICMTA Advertisement] Invalid destination URL:",
            error
          );

          link.removeAttribute("href");
          link.style.pointerEvents = "none";
          link.setAttribute("aria-disabled", "true");
        }
      } else {
        link.removeAttribute("href");
        link.style.pointerEvents = "none";
        link.setAttribute("aria-disabled", "true");
      }

      // Set the image only after assigning the error handler.
      image.onerror = () => {
        console.error(
          "[ICMTA Advertisement] Failed to load banner image:",
          imageUrl.href
        );

        // Skip a broken advertisement if another is available.
        if (advertisements.length > 1) {
          showNextAdvertisement();
        } else {
          closePopup();
        }
      };

      image.src = imageUrl.href;
      return true;
    }

    function showNextAdvertisement() {
      if (advertisements.length === 0) {
        closePopup();
        return;
      }

      if (advertisements.length === 1) {
        // Keep a single advertisement visible without rotating.
        showAdvertisement(advertisements[0]);
        return;
      }

      // Try each advertisement at most once per rotation.
      for (let attempt = 0; attempt < advertisements.length; attempt++) {
        currentIndex = (currentIndex + 1) % advertisements.length;

        if (showAdvertisement(advertisements[currentIndex])) {
          return;
        }
      }

      closePopup();
    }

    function startRotation() {
      if (rotationTimer !== null) {
        window.clearInterval(rotationTimer);
      }

      // Do not rotate when only one advertisement is available.
      if (advertisements.length > 1) {
        rotationTimer = window.setInterval(
          showNextAdvertisement,
          ROTATION_INTERVAL_MS
        );
      }
    }

    closeButton.addEventListener("click", closePopup);
    overlay.addEventListener("click", closePopup);

    async function loadAdvertisements() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/advertisements?page=${encodeURIComponent(PAGE)}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`API returned HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success || !Array.isArray(result.data)) {
          throw new Error("Unexpected advertisement API response.");
        }

        // Keep active advertisements with image URLs.
        // The backend already orders them newest first.
        advertisements = result.data.filter(
          (ad) =>
            ad &&
            ad.is_active === true &&
            typeof ad.image_url === "string" &&
            ad.image_url.trim() !== ""
        );

        if (advertisements.length === 0) {
          console.info(
            "[ICMTA Advertisement] No active homepage advertisements."
          );
          return;
        }

        // Start with the newest advertisement.
        currentIndex = 0;

        window.setTimeout(() => {
          if (showAdvertisement(advertisements[currentIndex])) {
            modal.hidden = false;
            document.body.style.overflow = "hidden";
            closeButton.focus();
            document.addEventListener("keydown", handleKeydown);
            startRotation();
          }
        }, POPUP_DELAY_MS);
      } catch (error) {
        console.error(
          "[ICMTA Advertisement] Failed to load advertisements:",
          error
        );
      }
    }

    loadAdvertisements();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeAdvertisementPopup,
      { once: true }
    );
  } else {
    initializeAdvertisementPopup();
  }
})();
