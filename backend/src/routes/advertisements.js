

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { query } = require("../db/pool");
const { requireAdmin } = require("../middleware/auth");
const config = require("../config/env");
const { saveUploadedFile } = require("../utils/uploads");

const router = express.Router();

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ALLOWED_CATEGORIES = [
  "Sponsor",
  "Partner",
  "ICMTA Event",
  "External Advertisement",
];

const ALLOWED_PLACEMENTS = [
  "home",
  "selected_pages",
  "both",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter(req, file, cb) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      const err = new Error(
        "Only JPEG, PNG, and WebP images are allowed."
      );
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result || null;
}

function parseSelectedPages(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  let pages = value;

  if (typeof pages === "string") {
    try {
      pages = JSON.parse(pages);
    } catch {
      throw new Error(
        "selected_pages must be a JSON array of page identifiers."
      );
    }
  }

  if (!Array.isArray(pages)) {
    throw new Error("selected_pages must be an array.");
  }

  const result = [
    ...new Set(
      pages
        .map((page) => String(page).trim())
        .filter(Boolean)
    ),
  ];

  if (result.some((page) => !/^[a-z0-9_-]+$/i.test(page))) {
    throw new Error(
      "Page identifiers may contain only letters, numbers, underscores, and hyphens."
    );
  }

  return result;
}

function parseDate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is not a valid date.`);
  }

  return date;
}

function validateDestinationUrl(value) {
  const url = cleanString(value);

  if (!url) return null;

  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error();
    }

    return url;
  } catch {
    throw new Error(
      "Destination URL must be a valid HTTP or HTTPS URL."
    );
  }
}

function validateBannerInput(body, current = null) {
  const title = body.title !== undefined
    ? cleanString(body.title)
    : current?.title;

  const description = body.description !== undefined
    ? cleanString(body.description)
    : current?.description;

  const category = body.category !== undefined
    ? cleanString(body.category)
    : current?.category;

  const placement = body.placement !== undefined
    ? cleanString(body.placement)
    : current?.placement;

  const destinationUrl = body.destination_url !== undefined
    ? validateDestinationUrl(body.destination_url)
    : current?.destination_url ?? null;

  let selectedPages = current?.selected_pages ?? [];

  if (body.selected_pages !== undefined) {
    selectedPages = parseSelectedPages(body.selected_pages);
  }

  const startDate = body.start_date !== undefined
    ? parseDate(body.start_date, "start_date")
    : current?.start_date ?? null;

  const endDate = body.end_date !== undefined
    ? parseDate(body.end_date, "end_date")
    : current?.end_date ?? null;

  if (!title) {
    throw new Error("Banner title is required.");
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw new Error("Invalid advertisement category.");
  }

  if (!ALLOWED_PLACEMENTS.includes(placement)) {
    throw new Error("Invalid advertisement placement.");
  }

  if (
    startDate &&
    endDate &&
    startDate.getTime() > endDate.getTime()
  ) {
    throw new Error("start_date must not be later than end_date.");
  }

  if (placement === "selected_pages" && selectedPages.length === 0) {
    throw new Error(
      "Select at least one page for this placement."
    );
  }

  return {
    title,
    description,
    category,
    placement,
    destinationUrl,
    selectedPages,
    startDate,
    endDate,
  };
}

function normalizeBanner(row) {
  if (!row) return row;

  let selectedPages = row.selected_pages;

  if (typeof selectedPages === "string") {
    try {
      selectedPages = JSON.parse(selectedPages);
    } catch {
      selectedPages = [];
    }
  }

  return {
    ...row,
    selected_pages: selectedPages || [],
    is_active: Boolean(row.is_active),
  };
}

function getBannerById(id) {
  return query(
    "SELECT * FROM advertisements WHERE advertisement_id = ? LIMIT 1",
    [id]
  );
}

// ======================================================
// PUBLIC API
// GET /api/advertisements?page=home
// GET /api/advertisements?page=events
// ======================================================

router.get("/advertisements", async (req, res, next) => {
  try {
    const page = cleanString(req.query.page) || "home";

    if (!/^[a-z0-9_-]+$/i.test(page)) {
      return res.status(400).json({
        success: false,
        detail: "Invalid page identifier.",
      });
    }

    const rows = await query(
      `
      SELECT
        advertisement_id,
        title,
        description,
        image_url,
        destination_url,
        category,
        placement,
        selected_pages,
        start_date,
        end_date,
        is_active
      FROM advertisements
      WHERE is_active = 1
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
        AND (
          placement = 'both'
          OR (placement = 'home' AND ? = 'home')
          OR (
            placement = 'selected_pages'
            AND JSON_CONTAINS(
              selected_pages,
              JSON_QUOTE(?)
            )
          )
        )
      ORDER BY advertisement_id DESC
      
      `,
      [page, page]
    );

    console.log("Public advertisement row:", rows[0]);``
    console.log("Normalized banner:", normalizeBanner(rows[0]));
    res.set("Cache-Control", "no-store");

    res.json({
  success: true,
  data: rows.map(normalizeBanner),
  count: rows.length,
});
  } catch (err) {
    next(err);
  }
});

// All routes below this point require an active admin.
router.use(requireAdmin);

// ======================================================
// ADMIN: LIST ALL BANNERS
// GET /api/admin/advertisements
// ======================================================

router.get("/admin/advertisements", async (req, res, next) => {
  try {
    const rows = await query(
      `
      SELECT *
      FROM advertisements
      ORDER BY created_at DESC, advertisement_id DESC
      `
    );

    res.json({
      success: true,
      data: rows.map(normalizeBanner),
      count: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// ======================================================
// ADMIN: CREATE BANNER
// POST /api/admin/advertisements
// multipart/form-data; image field: image
// ======================================================

router.post(
  "/admin/advertisements",
  upload.single("image"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          detail: "A banner image is required.",
        });
      }

      const banner = validateBannerInput(req.body);
      const imageUrl = saveUploadedFile(
        req.file,
        "advertisement_banners",
        ALLOWED_IMAGE_TYPES,
        MAX_IMAGE_SIZE
      );

      const result = await query(
        `
        INSERT INTO advertisements (
          title,
          description,
          image_url,
          destination_url,
          category,
          placement,
          selected_pages,
          start_date,
          end_date,
          is_active,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `,
        [
          banner.title,
          banner.description,
          imageUrl,
          banner.destinationUrl,
          banner.category,
          banner.placement,
          JSON.stringify(banner.selectedPages),
          banner.startDate,
          banner.endDate,
          req.admin.admin_id,
        ]
      );

      const rows = await getBannerById(result.insertId);

      res.status(201).json({
        success: true,
        message: "Advertisement created as inactive.",
        data: normalizeBanner(rows[0]),
      });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          detail: err.message,
        });
      }

      if (
        err.message &&
        (
          err.message.includes("required") ||
          err.message.includes("Invalid") ||
          err.message.includes("must ") ||
          err.message.includes("Select") ||
          err.message.includes("Destination URL") ||
          err.message.includes("Page identifiers") ||
          err.message.includes("start_date") ||
          err.message.includes("end_date")
        )
      ) {
        return res.status(400).json({
          success: false,
          detail: err.message,
        });
      }

      next(err);
    }
  }
);

// ======================================================
// ADMIN: UPDATE BANNER
// PUT /api/admin/advertisements/:id
// Optional image field: image
// ======================================================

router.put(
  "/admin/advertisements/:id",
  upload.single("image"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          detail: "Invalid advertisement ID.",
        });
      }

      const rows = await getBannerById(id);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          detail: "Advertisement not found.",
        });
      }

      const current = normalizeBanner(rows[0]);
      const banner = validateBannerInput(req.body, current);

      const imageUrl = req.file
        ? saveUploadedFile(
            req.file,
            "advertisement_banners",
            ALLOWED_IMAGE_TYPES,
            MAX_IMAGE_SIZE
          )
        : current.image_url;

      await query(
        `
        UPDATE advertisements
        SET
          title = ?,
          description = ?,
          image_url = ?,
          destination_url = ?,
          category = ?,
          placement = ?,
          selected_pages = ?,
          start_date = ?,
          end_date = ?
        WHERE advertisement_id = ?
        `,
        [
          banner.title,
          banner.description,
          imageUrl,
          banner.destinationUrl,
          banner.category,
          banner.placement,
          JSON.stringify(banner.selectedPages),
          banner.startDate,
          banner.endDate,
          id,
        ]
      );

      const updated = await getBannerById(id);

      res.json({
        success: true,
        message: "Advertisement updated.",
        data: normalizeBanner(updated[0]),
      });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          detail: err.message,
        });
      }

      if (
        err.message &&
        (
          err.message.includes("required") ||
          err.message.includes("Invalid") ||
          err.message.includes("must ") ||
          err.message.includes("Select") ||
          err.message.includes("Destination URL") ||
          err.message.includes("Page identifiers") ||
          err.message.includes("start_date") ||
          err.message.includes("end_date")
        )
      ) {
        return res.status(400).json({
          success: false,
          detail: err.message,
        });
      }

      next(err);
    }
  }
);

// ======================================================
// ADMIN: ACTIVATE / DEACTIVATE
// PATCH /api/admin/advertisements/:id/status
// Body: { "is_active": true } or { "is_active": false }
// ======================================================

router.patch(
  "/admin/advertisements/:id/status",
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const value = req.body?.is_active;

      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          detail: "Invalid advertisement ID.",
        });
      }

      if (typeof value !== "boolean" && value !== 0 && value !== 1) {
        return res.status(400).json({
          success: false,
          detail: "is_active must be true or false.",
        });
      }

      const rows = await getBannerById(id);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          detail: "Advertisement not found.",
        });
      }

      await query(
        "UPDATE advertisements SET is_active = ? WHERE advertisement_id = ?",
        [value ? 1 : 0, id]
      );

      const updated = await getBannerById(id);

      res.json({
        success: true,
        message: value ? "Advertisement activated." : "Advertisement deactivated.",
        data: normalizeBanner(updated[0]),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ======================================================
// ADMIN: DELETE BANNER
// DELETE /api/admin/advertisements/:id
// ======================================================

router.delete(
  "/admin/advertisements/:id",
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          detail: "Invalid advertisement ID.",
        });
      }

      const rows = await getBannerById(id);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          detail: "Advertisement not found.",
        });
      }

      await query(
        "DELETE FROM advertisements WHERE advertisement_id = ?",
        [id]
      );

      // Only remove files belonging to the advertisement upload folder.
      const imageUrl = rows[0].image_url || "";
      const prefix = "/uploads/advertisement_banners/";

      if (imageUrl.startsWith(prefix)) {
        const filename = imageUrl.slice(prefix.length);

        if (
          filename &&
          path.basename(filename) === filename
        ) {
          const filePath = path.resolve(
            config.uploadDir,
            "advertisement_banners",
            filename
          );

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }

      res.json({
        success: true,
        message: "Advertisement deleted.",
        data: { advertisement_id: id },
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
