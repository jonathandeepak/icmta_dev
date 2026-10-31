
/* ============================================================
   ICMTA ADMIN — ADVERTISEMENT MANAGEMENT
   Uses existing Express APIs and ICMTAdminToken.
   ============================================================ */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let ads = [];

  function apiBase() {
    return typeof getApiBase === "function"
      ? getApiBase()
      : "http://localhost:5000";
  }

  function authHeaders() {
    const token = typeof getAdminAuthToken === "function"
      ? getAdminAuthToken()
      : localStorage.getItem("ICMTAdminToken") || "";

    if (!token) throw new Error("Please log in to the admin dashboard again.");

    return { Authorization: `Bearer ${token}` };
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers: {
        ...authHeaders(),
        ...(options.headers || {})
      }
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
      throw new Error(
        result.detail || result.message || `Request failed (${response.status})`
      );
    }

    return result;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function imageUrl(path) {
    if (!path) return "";
    try {
      return new URL(path, apiBase() || window.location.origin).href;
    } catch {
      return "";
    }
  }

  function dateInputValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000
    );
    return local.toISOString().slice(0, 16);
  }

  function showError(error) {
    console.error("[ICMTA Advertisement Admin]", error);
    alert(error.message || "Advertisement operation failed.");
  }

  function resetAdvertisementForm() {
    $("advertisementForm").reset();
    $("advertisementId").value = "";
    $("adImage").required = true;
    $("adTitle").focus();
  }

  async function loadAdvertisementsAdmin() {
    const tbody = $("advertisementsTableBody");
    if (!tbody) return;

    tbody.innerHTML =
      '<tr><td colspan="6">Loading advertisements...</td></tr>';

    try {
      const result = await apiRequest("/api/admin/advertisements");
      ads = Array.isArray(result.data) ? result.data : [];

      if (!ads.length) {
        tbody.innerHTML =
          '<tr><td colspan="6">No advertisements found.</td></tr>';
        return;
      }

      tbody.innerHTML = ads.map((ad) => {
        const id = Number(ad.advertisement_id);
        const src = imageUrl(ad.image_url);

        return `
          <tr>
            <td>${id}</td>
            <td>
              ${
                src
                  ? `<img src="${escapeHtml(src)}"
                       alt="${escapeHtml(ad.title)}"
                       style="width:90px;height:55px;object-fit:contain"
                       onerror="this.style.display='none'">`
                  : "No image"
              }
            </td>
            <td>
              <strong>${escapeHtml(ad.title)}</strong>
              <div class="subtitle">${escapeHtml(ad.category)}</div>
            </td>
            <td>${escapeHtml(ad.placement)}</td>
            <td>
              <span class="badge">
                ${ad.is_active ? "Active" : "Inactive"}
              </span>
            </td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn secondary" type="button"
                  data-ad-action="edit" data-ad-id="${id}">Edit</button>
                <button class="btn secondary" type="button"
                  data-ad-action="toggle" data-ad-id="${id}">
                  ${ad.is_active ? "Deactivate" : "Activate"}
                </button>
                <button class="btn secondary" type="button"
                  data-ad-action="delete" data-ad-id="${id}">Delete</button>
              </div>
            </td>
          </tr>`;
      }).join("");
    } catch (error) {
      tbody.innerHTML =
        '<tr><td colspan="6">Unable to load advertisements. Check login and backend.</td></tr>';
      showError(error);
    }
  }

  function editAdvertisement(id) {
    const ad = ads.find(
      (item) => Number(item.advertisement_id) === id
    );

    if (!ad) return;

    $("advertisementId").value = ad.advertisement_id;
    $("adTitle").value = ad.title || "";
    $("adDescription").value = ad.description || "";
    $("adDestination").value = ad.destination_url || "";
    $("adCategory").value = ad.category || "Sponsor";
    $("adPlacement").value = ad.placement || "both";
    $("adPages").value = Array.isArray(ad.selected_pages)
      ? ad.selected_pages.join(",")
      : "";

    $("adStartDate").value = dateInputValue(ad.start_date);
    $("adEndDate").value = dateInputValue(ad.end_date);

    // The backend allows editing without uploading another image.
    $("adImage").required = false;

    $("advertisements").scrollIntoView({ behavior: "smooth" });
    $("adTitle").focus();
  }

  async function saveAdvertisement(event) {
    event.preventDefault();

    const id = $("advertisementId").value.trim();
    const file = $("adImage").files[0];

    if (!id && !file) {
      alert("Please select a banner image for the new advertisement.");
      return;
    }

    const placement = $("adPlacement").value;
    const pages = $("adPages").value
      .split(",")
      .map((page) => page.trim())
      .filter(Boolean);

    if (placement === "selected_pages" && pages.length === 0) {
      alert("Enter at least one page identifier, such as events.");
      return;
    }

    const formData = new FormData();
    formData.append("title", $("adTitle").value.trim());
    formData.append("description", $("adDescription").value.trim());
    formData.append("destination_url", $("adDestination").value.trim());
    formData.append("category", $("adCategory").value);
    formData.append("placement", placement);
    formData.append("selected_pages", JSON.stringify(pages));
    formData.append("start_date", $("adStartDate").value);
    formData.append("end_date", $("adEndDate").value);

    if (file) formData.append("image", file);

    const submitButton = $("advertisementForm").querySelector(
      'button[type="submit"]'
    );

    submitButton.disabled = true;

    try {
      const path = id
        ? `/api/admin/advertisements/${encodeURIComponent(id)}`
        : "/api/admin/advertisements";

      await apiRequest(path, {
        method: id ? "PUT" : "POST",
        body: formData
      });

      alert(
        id
          ? "Advertisement updated successfully."
          : "Advertisement created. It is inactive until you activate it."
      );

      resetAdvertisementForm();
      await loadAdvertisementsAdmin();
    } catch (error) {
      showError(error);
    } finally {
      submitButton.disabled = false;
    }
  }

  async function toggleAdvertisement(id) {
    const ad = ads.find(
      (item) => Number(item.advertisement_id) === id
    );
    if (!ad) return;

    const nextStatus = !ad.is_active;

    if (!confirm(
      `${nextStatus ? "Activate" : "Deactivate"} "${ad.title}"?`
    )) return;

    try {
      await apiRequest(
        `/api/admin/advertisements/${id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: nextStatus })
        }
      );

      await loadAdvertisementsAdmin();
    } catch (error) {
      showError(error);
    }
  }

  async function deleteAdvertisement(id) {
    const ad = ads.find(
      (item) => Number(item.advertisement_id) === id
    );
    if (!ad) return;

    if (!confirm(
      `Permanently delete "${ad.title}" and its managed banner file?`
    )) return;

    try {
      await apiRequest(`/api/admin/advertisements/${id}`, {
        method: "DELETE"
      });

      alert("Advertisement deleted.");
      await loadAdvertisementsAdmin();
    } catch (error) {
      showError(error);
    }
  }

  // Keep functions accessible to existing inline HTML handlers.
  window.loadAdvertisementsAdmin = loadAdvertisementsAdmin;
  window.resetAdvertisementForm = resetAdvertisementForm;

  document.addEventListener("DOMContentLoaded", () => {
    const form = $("advertisementForm");
    const tbody = $("advertisementsTableBody");

    if (form) {
      form.addEventListener("submit", saveAdvertisement);
    }

    if (tbody) {
      tbody.addEventListener("click", (event) => {
        const button = event.target.closest("[data-ad-action]");
        if (!button) return;

        const id = Number(button.dataset.adId);
        if (!Number.isSafeInteger(id) || id <= 0) return;

        switch (button.dataset.adAction) {
          case "edit":
            editAdvertisement(id);
            break;
          case "toggle":
            toggleAdvertisement(id);
            break;
          case "delete":
            deleteAdvertisement(id);
            break;
        }
      });
    }

    // Load the list when the Advertisements sidebar item is selected.
    document.querySelectorAll('.nav button[data-page="advertisements"]')
      .forEach((button) => {
        button.addEventListener("click", loadAdvertisementsAdmin);
      });
  });
})();
