
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { query } = require("../db/pool");
const { cleanString } = require("../utils/validation");
// Enforce login and database-backed active membership checks.
const { requireAuth, requireMember } = require("../middleware/memberAuth");

const router = express.Router();

const uploadDir = path.join(__dirname, "../../uploads/event_posters");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, and WEBP images are allowed."));
    }

    cb(null, true);
  }
});


const EVENT_SELECT = `
  SELECT
    e.event_id,
e.event_title,
e.event_category,
DATE_FORMAT(e.event_date, '%Y-%m-%d') AS event_date,
DATE_FORMAT(e.registration_deadline, '%Y-%m-%d') AS registration_deadline,
e.start_time,
e.end_time,
e.event_mode,
    e.status, e.reviewed_by, e.reviewed_at, e.created_at, e.updated_at,
    d.short_description, d.full_description, d.poster_url,
    d.organized_by, d.in_association_with, d.registration_fee,
    d.registration_link, d.rejection_reason,
    c.speaker_name, c.speaker_designation, c.speaker_institution,
    c.coordinator_name, c.contact_number, c.contact_email
  FROM events e
  LEFT JOIN event_details d ON e.event_id = d.event_id
  LEFT JOIN event_contacts c ON e.event_id = c.event_id
`;


/*
 * GET /api/events
 *
 * Active members can see all approved/published events.
 * Registered non-members can see only basic information about past events.
 */
router.get("/events", requireAuth, async (req, res, next) => {
  try {
    if (req.memberAuth.is_member) {
      // Preserve the full event listing for active ICMTA members.
      const rows = await query(`${EVENT_SELECT}
        WHERE e.status IN ('Approved','Published')
        ORDER BY e.event_date ASC, e.start_time ASC`);

      return res.json({
        success: true,
        data: rows,
        account_type: "member"
      });
    }

    // Limit non-members to past events and omit contact details,
    // full descriptions, registration links, and other restricted fields.
    const rows = await query(`
      SELECT
        e.event_id,
        e.event_title,
        e.event_category,
        DATE_FORMAT(e.event_date, '%Y-%m-%d') AS event_date,
        e.event_mode,
        d.short_description,
        d.poster_url
      FROM events e
      LEFT JOIN event_details d ON e.event_id = d.event_id
      WHERE e.status IN ('Approved','Published')
        AND DATE(e.event_date) < CURDATE()
      ORDER BY e.event_date DESC
    `);

    return res.json({
      success: true,
      data: rows,
      account_type: "registered"
    });
  } catch (err) {
    next(err);
  }
});


/*
 * GET /api/events/:event_id
 *
 * Full event details require active membership.
 * Registered non-members can view limited information for past events only.
 */
router.get("/events/:event_id", requireAuth, async (req, res, next) => {
  try {
    const eventId = Number(req.params.event_id);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({
        success: false,
        detail: "Invalid event ID."
      });
    }

    if (req.memberAuth.is_member) {
      // Active members retain access to full approved/published event details.
      const rows = await query(`${EVENT_SELECT}
        WHERE e.event_id = ?
          AND e.status IN ('Approved','Published')
        LIMIT 1`, [eventId]);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          detail: "Event not found."
        });
      }

      return res.json({
        success: true,
        data: rows[0],
        account_type: "member"
      });
    }

    // Do not expose full event details or future events to non-members.
    const rows = await query(`
      SELECT
        e.event_id,
        e.event_title,
        e.event_category,
        DATE_FORMAT(e.event_date, '%Y-%m-%d') AS event_date,
        e.event_mode,
        d.short_description,
        d.poster_url
      FROM events e
      LEFT JOIN event_details d ON e.event_id = d.event_id
      WHERE e.event_id = ?
        AND e.status IN ('Approved','Published')
        AND DATE(e.event_date) < CURDATE()
      LIMIT 1
    `, [eventId]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        detail: "Event not found or unavailable for this account."
      });
    }

    return res.json({
      success: true,
      data: rows[0],
      account_type: "registered"
    });
  } catch (err) {
    next(err);
  }
});


// Only active ICMTA members can submit events for admin approval.
router.post(
  "/events",
  requireMember,
  upload.single("eventPoster"),
    async (req, res, next) => {

    console.log("========== EVENT FORM DEBUG ==========");
    console.log("Content-Type:", req.headers["content-type"]);
    console.log("Request Body:", req.body);
    console.log("Uploaded File:", req.file);
    console.log("======================================");

    const {
      event_title, event_category, event_date, registration_deadline,
      start_time, end_time, event_mode, speaker_name,
      speaker_designation, speaker_institution, short_description,
      full_description, organized_by, registration_fee, in_association_with,
      registration_link, coordinator_name, contact_number, contact_email
    } = req.body || {};

  if (!cleanString(event_title) || !cleanString(event_date)) {
    return res.status(400).json({ detail: "Event title and event date are required." });
  }
  if (registration_deadline && String(registration_deadline).slice(0, 10) > String(event_date).slice(0, 10)) {
    return res.status(400).json({ detail: "Registration deadline cannot be after the event date." });
  }
  if (start_time && end_time && String(end_time) <= String(start_time)) {
    return res.status(400).json({ detail: "End time must be after start time." });
  }
  if (registration_fee !== undefined && registration_fee !== null && Number(registration_fee) < 0) {
    return res.status(400).json({ detail: "Registration fee cannot be negative." });
  }
  let posterUrl = null;

if (req.file) {
  const extension = req.file.mimetype === "image/png"
    ? ".png"
    : req.file.mimetype === "image/webp"
      ? ".webp"
      : ".jpg";

  const fileName =
    crypto.randomBytes(16).toString("hex") + extension;

  const filePath = path.join(uploadDir, fileName);

  fs.writeFileSync(filePath, req.file.buffer);

  posterUrl = `/uploads/event_posters/${fileName}`;
}

    try {
    const { query: dbQuery } = require("../db/pool");

    const [resultSets] = await dbQuery(
      `CALL sp_submit_event(
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )`,
      [
        cleanString(event_title),
        cleanString(event_category),
        event_date,
        registration_deadline
          ? String(registration_deadline).slice(0, 10)
          : null,
        start_time || null,
        end_time || null,
        cleanString(event_mode),

        cleanString(short_description),
        cleanString(full_description),
        cleanString(posterUrl),
        cleanString(organized_by),
        cleanString(in_association_with),

        registration_fee === "" ||
        registration_fee === undefined ||
        registration_fee === null
          ? 0
          : Number(registration_fee),

        cleanString(registration_link),

        cleanString(speaker_name),
        cleanString(speaker_designation),
        cleanString(speaker_institution),
        cleanString(coordinator_name),
        cleanString(contact_number),
        cleanString(contact_email)
      ]
    );

    // MySQL stored procedure SELECT result is returned as a nested result set
    const rows = await query(
  `${EVENT_SELECT}
   WHERE e.event_title = ?
   ORDER BY e.event_id DESC
   LIMIT 1`,
  [cleanString(event_title)]
);

if (!rows.length) {
  return res.status(500).json({
    detail: "Event was submitted but could not be retrieved."
  });
}

    res.status(201).json({
      success: true,
      message: "Event submitted for admin approval.",
      data: rows[0]
    });

  } catch (err) {
    next(err);
  }
});


router.post("/events/:event_id/register", async (req, res, next) => {
  try {
    const eventId = Number(req.params.event_id);

    const {
      attendee_name,
      email,
      phone,
      institution
    } = req.body || {};

    if (!eventId || !Number.isInteger(eventId)) {
      return res.status(400).json({
        detail: "Invalid event ID."
      });
    }

    if (!cleanString(attendee_name)) {
      return res.status(400).json({
        detail: "Attendee name is required."
      });
    }

    if (!cleanString(email)) {
      return res.status(400).json({
        detail: "Email is required."
      });
    }

    await query(
      `CALL sp_register_event_attendee(?, ?, ?, ?, ?)`,
      [
        eventId,
        cleanString(attendee_name),
        cleanString(email),
        cleanString(phone),
        cleanString(institution)
      ]
    );

    const rows = await query(
      `SELECT
        registration_id,
        event_id,
        attendee_name,
        email,
        phone,
        institution,
        registration_status,
        registered_at
       FROM event_registrations
       WHERE event_id = ?
         AND LOWER(email) = LOWER(?)
         AND registration_status = 'Registered'
       ORDER BY registration_id DESC
       LIMIT 1`,
      [eventId, cleanString(email)]
    );

    const data = rows[0];

    if (!data) {
      return res.status(500).json({
        detail: "Registration was completed but registration data could not be retrieved."
      });
    }

    res.status(201).json({
      success: true,
      message: "Event registration successful.",
      data
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;