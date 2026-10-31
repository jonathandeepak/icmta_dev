const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { query, getConnection } = require("../db/pool");
const { requireAdmin } = require("../middleware/auth");
const { nextMemberId } = require("../services/memberService");
const { saveUploadedFile } = require("../utils/uploads");
const { cleanString, cleanEmail } = require("../utils/validation");
const { calculateMembershipFee } = require("../services/paymentService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function proofFromNotes(notes) {
  const m = String(notes || "").match(/\[Payment Proof:\s*([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

async function getAdminMember(memberId) {
  const rows = await query(`
    SELECT
      m.member_id,m.academic_title,m.name,m.designation,m.department,m.institution,
      m.membership_category,m.is_active,m.my_status,m.created_at,m.updated_at,
      c.mobile,c.whatsapp,c.whatsapp_secondary,c.professional_email,c.personal_email,
      c.address,c.city,c.state_province,c.pin_code,c.country,
      a.date_of_birth,a.qualification,a.research_guideship,a.expertise,
      a.linkedin,a.orcid,a.google_scholar,a.photo_url,a.source_record
    FROM members m
    LEFT JOIN member_contact_info c ON m.member_id=c.member_id
    LEFT JOIN member_academic_profile a ON m.member_id=a.member_id
    WHERE m.member_id=? LIMIT 1
  `, [memberId]);
  return rows[0] || null;
}

router.use(requireAdmin);

router.get("/admin/members", async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT
        m.member_id,m.academic_title,m.name,m.designation,m.department,m.institution,
        m.membership_category,m.is_active,m.my_status,m.created_at,m.updated_at,
        c.mobile,c.whatsapp,c.whatsapp_secondary,c.professional_email,c.personal_email,
        c.address,c.city,c.state_province,c.pin_code,c.country,
        a.date_of_birth,a.qualification,a.research_guideship,a.expertise,
        a.linkedin,a.orcid,a.google_scholar,a.photo_url,a.source_record
      FROM members m
      LEFT JOIN member_contact_info c ON m.member_id=c.member_id
      LEFT JOIN member_academic_profile a ON m.member_id=a.member_id
      ORDER BY m.member_id ASC
    `);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) { next(err); }
});

router.post("/admin/members", upload.single("photo"), async (req, res, next) => {
  let conn;
  try {
    const b = req.body || {};
    const name = cleanString(b.name);
    if (!name) return res.status(400).json({ detail: "Name is required." });

    const professionalEmail = cleanEmail(b.professional_email);
    if (professionalEmail) {
      const dup = await query(
        "SELECT member_id FROM member_contact_info WHERE LOWER(TRIM(professional_email))=? LIMIT 1",
        [professionalEmail]
      );
      if (dup.length) return res.status(409).json({ detail: "Professional email already exists." });
    }

    const photoUrl = req.file
      ? saveUploadedFile(req.file, "member_photos", ["image/jpeg","image/png","image/webp"], 5*1024*1024)
      : null;

    conn = await getConnection();
    await conn.beginTransaction();
    const memberId = await nextMemberId(conn);

    await conn.execute(`
      INSERT INTO members
        (member_id,academic_title,name,designation,department,institution,membership_category,is_active,my_status)
      VALUES (?,?,?,?,?,?,?,1,'Active')
    `, [
      memberId, cleanString(b.academic_title), name, cleanString(b.designation),
      cleanString(b.department), cleanString(b.institution), cleanString(b.membership_category)
    ]);

    await conn.execute(`
      INSERT INTO member_contact_info
        (member_id,mobile,whatsapp,whatsapp_secondary,professional_email,personal_email,
         address,city,state_province,pin_code,country)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `, [
      memberId, cleanString(b.mobile), cleanString(b.whatsapp), cleanString(b.whatsapp_secondary),
      professionalEmail, cleanEmail(b.personal_email), cleanString(b.address || b.college_address),
      cleanString(b.city), cleanString(b.state_province), cleanString(b.pin_code),
      cleanString(b.country)
    ]);

    await conn.execute(`
      INSERT INTO member_academic_profile
        (member_id,date_of_birth,qualification,research_guideship,expertise,
         linkedin,orcid,google_scholar,photo_url,source_record)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [
      memberId, cleanString(b.date_of_birth), cleanString(b.qualification),
      cleanString(b.research_guideship || b.guideship), cleanString(b.expertise),
      cleanString(b.linkedin), cleanString(b.orcid), cleanString(b.google_scholar),
      photoUrl, cleanString(b.source_record)
    ]);

    await conn.commit();
    const member = await getAdminMember(memberId);
    res.status(201).json({ success: true, data: member });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

router.put("/admin/members/:member_id", upload.single("photo"), async (req, res, next) => {
  let conn;
  try {
    const memberId = req.params.member_id;
    const current = await getAdminMember(memberId);
    if (!current) return res.status(404).json({ detail: "Member not found" });

    const b = req.body || {};
    const professionalEmail = b.professional_email !== undefined
      ? cleanEmail(b.professional_email)
      : current.professional_email;

    if (professionalEmail) {
      const dup = await query(
        "SELECT member_id FROM member_contact_info WHERE LOWER(TRIM(professional_email))=? AND member_id<>? LIMIT 1",
        [professionalEmail, memberId]
      );
      if (dup.length) return res.status(409).json({ detail: "Professional email already exists." });
    }

    const photoUrl = req.file
      ? saveUploadedFile(req.file, "member_photos", ["image/jpeg","image/png","image/webp"], 5*1024*1024)
      : current.photo_url;

    conn = await getConnection();
    await conn.beginTransaction();

    await conn.execute(`
      UPDATE members SET
        academic_title=?, name=?, designation=?, department=?, institution=?, membership_category=?
      WHERE member_id=?
    `, [
      b.academic_title !== undefined ? cleanString(b.academic_title) : current.academic_title,
      b.name !== undefined ? cleanString(b.name) : current.name,
      b.designation !== undefined ? cleanString(b.designation) : current.designation,
      b.department !== undefined ? cleanString(b.department) : current.department,
      b.institution !== undefined ? cleanString(b.institution) : current.institution,
      b.membership_category !== undefined ? cleanString(b.membership_category) : current.membership_category,
      memberId
    ]);

    await conn.execute(`
      UPDATE member_contact_info SET
        mobile=?, whatsapp=?, whatsapp_secondary=?, professional_email=?, personal_email=?,
        address=?, city=?, state_province=?, pin_code=?, country=?
      WHERE member_id=?
    `, [
      b.mobile !== undefined ? cleanString(b.mobile) : current.mobile,
      b.whatsapp !== undefined ? cleanString(b.whatsapp) : current.whatsapp,
      b.whatsapp_secondary !== undefined ? cleanString(b.whatsapp_secondary) : current.whatsapp_secondary,
      professionalEmail,
      b.personal_email !== undefined ? cleanEmail(b.personal_email) : current.personal_email,
      b.address !== undefined ? cleanString(b.address) : current.address,
      b.city !== undefined ? cleanString(b.city) : current.city,
      b.state_province !== undefined ? cleanString(b.state_province) : current.state_province,
      b.pin_code !== undefined ? cleanString(b.pin_code) : current.pin_code,
      b.country !== undefined ? cleanString(b.country) : current.country,
      memberId
    ]);

    await conn.execute(`
      UPDATE member_academic_profile SET
        date_of_birth=?, qualification=?, research_guideship=?, expertise=?,
        linkedin=?, orcid=?, google_scholar=?, photo_url=?
      WHERE member_id=?
    `, [
      b.date_of_birth !== undefined ? cleanString(b.date_of_birth) : current.date_of_birth,
      b.qualification !== undefined ? cleanString(b.qualification) : current.qualification,
      b.research_guideship !== undefined ? cleanString(b.research_guideship) : current.research_guideship,
      b.expertise !== undefined ? cleanString(b.expertise) : current.expertise,
      b.linkedin !== undefined ? cleanString(b.linkedin) : current.linkedin,
      b.orcid !== undefined ? cleanString(b.orcid) : current.orcid,
      b.google_scholar !== undefined ? cleanString(b.google_scholar) : current.google_scholar,
      photoUrl,
      memberId
    ]);

    await conn.commit();
    res.json({ success: true, data: await getAdminMember(memberId) });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

router.get("/admin/metrics", async (req, res, next) => {
  try {
    const [members, pendingApps, approvedApps, pendingPayments] = await Promise.all([
      query("SELECT COUNT(*) AS count FROM members"),
      query("SELECT COUNT(*) AS count FROM membership_applications WHERE approval_status='Pending'"),
      query("SELECT COUNT(*) AS count FROM membership_applications WHERE approval_status='Approved'"),
      query("SELECT COUNT(*) AS count FROM membership_payments WHERE payment_status='Pending'"),
    ]);
    res.json({
      success: true,
      data: {
        total_members: Number(members[0].count),
        pending_applications: Number(pendingApps[0].count),
        approved_applications: Number(approvedApps[0].count),
        pending_payments: Number(pendingPayments[0].count),
      },
    });
  } catch (err) { next(err); }
});


router.get("/admin/reports/overview", async (req, res, next) => {
  try {
    
const [
  members,
  applications,
  paymentsByStatus,
  paymentsByCategory,
  membersByCategory,
  monthlyRevenue,
monthlyMembershipGrowth,
membershipCategoryGrowth,
] = await Promise.all([

      query(`
        SELECT COUNT(*) AS total_members
        FROM members
      `),

      query(`
        SELECT
          approval_status,
          COUNT(*) AS count
        FROM membership_applications
        GROUP BY approval_status
      `),

       // Payments by status within the selected payment creation date range.
      query(`
        SELECT
          COALESCE(currency, 'Unknown') AS currency,
          payment_status,
          COUNT(*) AS transaction_count,
          COALESCE(SUM(amount), 0) AS total_amount
        FROM membership_payments
        WHERE (? IS NULL OR DATE(created_at) >= ?)
          AND (? IS NULL OR DATE(created_at) <= ?)
        GROUP BY currency, payment_status
        ORDER BY currency, payment_status
      `, [
        req.query.startDate || null,
        req.query.startDate || null,
        req.query.endDate || null,
        req.query.endDate || null
      ]),

      // Paid payments by membership category within the selected date range.
      query(`
        SELECT
          COALESCE(NULLIF(TRIM(membership_category), ''), 'General Member') AS membership_category,
          COALESCE(currency, 'Unknown') AS currency,
          SUM(amount) AS total_amount,
          COUNT(*) AS transaction_count
        FROM membership_payments
        WHERE payment_status = 'Paid'
          AND (? IS NULL OR DATE(paid_at) >= ?)
          AND (? IS NULL OR DATE(paid_at) <= ?)
        GROUP BY membership_category, currency
        ORDER BY membership_category, currency
      `, [
        req.query.startDate || null,
        req.query.startDate || null,
        req.query.endDate || null,
        req.query.endDate || null
      ]),

      query(`
        SELECT
          COALESCE(NULLIF(TRIM(membership_category), ''), 'General Member') AS membership_category,
          COUNT(*) AS count
        FROM members
        GROUP BY membership_category
        ORDER BY count DESC
      `),


      
      // Monthly revenue from paid transactions within the selected date range.
      query(`
        SELECT
          DATE_FORMAT(p.paid_at, '%Y-%m') AS month,
          COALESCE(p.currency, 'Unknown') AS currency,
          COUNT(*) AS transaction_count,
          COALESCE(SUM(p.amount), 0) AS total_amount
        FROM membership_payments p
        WHERE p.payment_status = 'Paid'
          AND p.paid_at IS NOT NULL
          AND (? IS NULL OR DATE(p.paid_at) >= ?)
          AND (? IS NULL OR DATE(p.paid_at) <= ?)
        GROUP BY DATE_FORMAT(p.paid_at, '%Y-%m'), p.currency
        ORDER BY month ASC, currency ASC
      `, [
        req.query.startDate || null,
        req.query.startDate || null,
        req.query.endDate || null,
        req.query.endDate || null
      ]),

      
      // Monthly membership growth based on member registration date.
      query(`
        SELECT
          DATE_FORMAT(created_at, '%Y-%m') AS month,
          COUNT(*) AS new_members
        FROM members
        WHERE (? IS NULL OR DATE(created_at) >= ?)
          AND (? IS NULL OR DATE(created_at) <= ?)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY month ASC
      `, [
        req.query.startDate || null,
        req.query.startDate || null,
        req.query.endDate || null,
        req.query.endDate || null
      ]),


      
      // Monthly membership growth grouped by membership category.
      query(`
        SELECT
          DATE_FORMAT(created_at, '%Y-%m') AS month,
          COALESCE(NULLIF(TRIM(membership_category), ''), 'General Member') AS membership_category,
          COUNT(*) AS new_members
        FROM members
        WHERE (? IS NULL OR DATE(created_at) >= ?)
          AND (? IS NULL OR DATE(created_at) <= ?)
        GROUP BY
          DATE_FORMAT(created_at, '%Y-%m'),
          membership_category
        ORDER BY month ASC, membership_category ASC
      `, [
        req.query.startDate || null,
        req.query.startDate || null,
        req.query.endDate || null,
        req.query.endDate || null
      ]),

    ]);

    res.json({
      success: true,
      data: {
        total_members: Number(members[0].total_members),

        applications: applications.map(row => ({
          status: row.approval_status,
          count: Number(row.count),
        })),

        payments_by_status: paymentsByStatus.map(row => ({
          currency: row.currency,
          status: row.payment_status,
          transaction_count: Number(row.transaction_count),
          total_amount: Number(row.total_amount),
        })),

        paid_payments_by_category: paymentsByCategory.map(row => ({
          membership_category: row.membership_category,
          currency: row.currency,
          total_amount: Number(row.total_amount),
          transaction_count: Number(row.transaction_count),
        })),

         members_by_category: membersByCategory.map(row => ({
          membership_category: row.membership_category,
          count: Number(row.count),
        })),

        // Monthly revenue grouped by month and currency.
        monthly_revenue: monthlyRevenue.map(row => ({
          month: row.month,
          currency: row.currency,
          transaction_count: Number(row.transaction_count),
          total_amount: Number(row.total_amount),
        })),

                // Monthly new-member registration statistics.
        monthly_membership_growth: monthlyMembershipGrowth.map(row => ({
          month: row.month,
          new_members: Number(row.new_members),
        })),
        
// Monthly registrations grouped by membership category.
membership_category_growth: membershipCategoryGrowth.map(row => ({
  month: row.month,
  membership_category: row.membership_category,
  new_members: Number(row.new_members),
})),
      },
    });
  } catch (err) {
    next(err);
  }
});


router.get("/admin/applications", async (req, res, next) => {
  try {
    let status = cleanString(req.query.status);
    status = status && status.toLowerCase() !== "all" ? status : null;

    let memberType = cleanString(req.query.member_type);
    if (!memberType || memberType.toLowerCase() === "all") memberType = null;
    else memberType = memberType.toLowerCase().includes("exist") ? "existing" : "new";

    let payment = cleanString(req.query.payment);
    if (!payment || payment.toLowerCase() === "all") payment = null;
    else if (/paid|verif/i.test(payment)) payment = "Paid";
    else if (/pend/i.test(payment)) payment = "Pending";
    else if (/not/i.test(payment)) payment = "Not Submitted";
    else if (/fail/i.test(payment)) payment = "Failed";

    const rows = await query(`
      SELECT
        ma.application_id,ma.member_id,ma.membership_category,ma.full_name,
        ma.approval_status,ma.admin_notes,ma.reviewed_by,ma.reviewed_at,
        ma.created_at,ma.updated_at,
        ac.professional_email,ac.personal_email,ac.mobile,ac.photo_url,
        mp.payment_id,mp.payment_status,mp.transaction_id,mp.amount
      FROM membership_applications ma
      LEFT JOIN application_contact_info ac ON ma.application_id=ac.application_id
      LEFT JOIN membership_payments mp ON ma.application_id=mp.application_id
      WHERE (? IS NULL OR ma.approval_status=?)
        AND (
          ? IS NULL OR
          (?='existing' AND ma.member_id IS NOT NULL AND TRIM(ma.member_id)<>'') OR
          (?='new' AND (ma.member_id IS NULL OR TRIM(ma.member_id)=''))
        )
        AND (
          ? IS NULL OR
          (?='Paid' AND mp.payment_status='Paid') OR
          (?='Pending' AND mp.payment_status='Pending') OR
          (?='Not Submitted' AND mp.payment_id IS NULL) OR
          (?='Failed' AND mp.payment_status='Failed')
        )
      ORDER BY ma.application_id DESC
    `, [status,status,memberType,memberType,memberType,payment,payment,payment,payment,payment]);

    const data = rows.map(r => ({
      ...r,
      member_type: r.member_id ? "Existing Member" : "New Member",
      payment_status: r.payment_id ? r.payment_status : "Not Submitted",
      amount: r.amount == null ? null : Number(r.amount),
      payment_proof: proofFromNotes(r.admin_notes),
    }));
    res.json({ success: true, data, count: data.length });
  } catch (err) { next(err); }
});

router.get("/admin/applications/:application_id", async (req, res, next) => {
  try {
    const id = Number(req.params.application_id);
    const rows = await query(`
      SELECT
        ma.*, ai.academic_title,ai.date_of_birth,ai.highest_qualification,
        ai.designation AS applicant_designation,ai.department AS applicant_department,
        ai.institution AS applicant_institution,ai.college_address,ai.pin_code,
        ai.state_province AS applicant_state,ai.country AS applicant_country,
        ac.personal_email,ac.professional_email,ac.mobile,ac.whatsapp,
        ac.whatsapp_secondary,ac.photo_url,ac.google_scholar,ac.linkedin,
        ac.orcid,ac.expertise,ac.research_guideship,
        mp.payment_id,mp.payment_status,mp.amount,mp.currency,mp.payment_method,
        mp.payment_gateway,mp.transaction_id,mp.paid_at,mp.created_at AS payment_created_at
      FROM membership_applications ma
      LEFT JOIN application_applicant_info ai ON ma.application_id=ai.application_id
      LEFT JOIN application_contact_info ac ON ma.application_id=ac.application_id
      LEFT JOIN membership_payments mp ON ma.application_id=mp.application_id
      WHERE ma.application_id=? LIMIT 1
    `, [id]);
    if (!rows.length) return res.status(404).json({ detail: "Application not found." });
    const r = rows[0];

    let existingMemberRecord = null;
    if (r.member_id) {
      const mem = await query(
        "SELECT member_id,name,designation,institution,department FROM members WHERE UPPER(TRIM(member_id))=UPPER(TRIM(?)) LIMIT 1",
        [r.member_id]
      );
      existingMemberRecord = mem[0] || null;
    }

    res.json({
      success: true,
      data: {
        application_id:r.application_id, member_id:r.member_id || null,
        member_type:r.member_id ? "Existing Member" : "New Member",
        membership_category:r.membership_category, full_name:r.full_name,
        approval_status:r.approval_status, admin_notes:r.admin_notes,
        reviewed_by:r.reviewed_by, reviewed_at:r.reviewed_at, created_at:r.created_at, updated_at:r.updated_at,
        academic_title:r.academic_title, date_of_birth:r.date_of_birth,
        highest_qualification:r.highest_qualification,
        designation:r.applicant_designation, department:r.applicant_department,
        institution:r.applicant_institution, college_address:r.college_address,
        pin_code:r.pin_code, state_province:r.applicant_state, country:r.applicant_country || "India",
        personal_email:r.personal_email, professional_email:r.professional_email,
        mobile:r.mobile, whatsapp:r.whatsapp, whatsapp_secondary:r.whatsapp_secondary,
        photo_url:r.photo_url, google_scholar:r.google_scholar, linkedin:r.linkedin,
        orcid:r.orcid, expertise:r.expertise, research_guideship:r.research_guideship,
        payment_id:r.payment_id, payment_status:r.payment_status || "Not Submitted",
        amount:r.amount == null ? null : Number(r.amount), currency:r.currency || "INR",
        payment_method:r.payment_method, payment_gateway:r.payment_gateway,
        transaction_id:r.transaction_id, paid_at:r.paid_at, payment_created_at:r.payment_created_at,
        payment_proof:proofFromNotes(r.admin_notes), existing_member_record:existingMemberRecord,
      },
    });
  } catch (err) { next(err); }
});

router.get("/admin/applications/:application_id/payment-proof", async (req, res, next) => {
  try {
    const rows = await query("SELECT admin_notes FROM membership_applications WHERE application_id=?", [Number(req.params.application_id)]);
    if (!rows.length) return res.status(404).json({ detail: "Application not found." });
    const relative = proofFromNotes(rows[0].admin_notes);
    if (!relative) return res.status(404).json({ detail: "No payment proof file associated with this application." });
    const path = require("path");
    const fs = require("fs");
    const safeRelative = relative.replace(/^\/uploads\//, "");
    const fullPath = path.resolve(require("../config/env").uploadDir, safeRelative);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: "Payment proof file not found on disk." });
    res.sendFile(fullPath);
  } catch (err) { next(err); }
});

router.post("/admin/applications/:application_id/approve", async (req, res, next) => {
  let conn;
  try {
    const id = Number(req.params.application_id);
    const apps = await query("SELECT * FROM membership_applications WHERE application_id=? LIMIT 1", [id]);
    const app = apps[0];
    if (!app) return res.status(404).json({ detail: "Membership application does not exist." });
    if (app.approval_status === "Approved") return res.status(409).json({ detail: "Application has already been approved." });
    if (app.approval_status === "Rejected") return res.status(400).json({ detail: "Rejected application cannot be approved." });
    if (app.approval_status !== "Pending") return res.status(400).json({ detail: `Application status is ${app.approval_status}. Only pending applications can be approved.` });

    const payments = await query(
      "SELECT * FROM membership_payments WHERE application_id=? ORDER BY payment_id DESC LIMIT 1",
      [id]
    );
    if (!payments.length || payments[0].payment_status !== "Paid") {
      return res.status(400).json({
        detail: "Application cannot be approved because payment is not marked as Paid. Please verify the payment first.",
      });
    }

    const aiRows = await query("SELECT * FROM application_applicant_info WHERE application_id=? LIMIT 1", [id]);
    const acRows = await query("SELECT * FROM application_contact_info WHERE application_id=? LIMIT 1", [id]);
    const ai = aiRows[0] || {};
    const ac = acRows[0] || {};

    conn = await getConnection();
    await conn.beginTransaction();

    let memberId = app.member_id;
    let createdNew = false;

    if (memberId) {
      const memberRows = await conn.execute("SELECT member_id FROM members WHERE member_id=? FOR UPDATE", [memberId]);
      if (!memberRows[0].length) {
        const e = new Error(`Application references member ${memberId}, but that member does not exist.`);
        e.statusCode = 400;
        throw e;
      }
    } else {
      memberId = await nextMemberId(conn);
      createdNew = true;
      await conn.execute(`
        INSERT INTO members
          (member_id,academic_title,name,designation,department,institution,membership_category,is_active,my_status)
        VALUES (?,?,?,?,?,?,?,1,'Active')
      `, [
        memberId, ai.academic_title || null, app.full_name.trim(),
        ai.designation || null, ai.department || null, ai.institution || null,
        app.membership_category
      ]);
      await conn.execute(
        "INSERT INTO member_contact_info (member_id) VALUES (?)",
        [memberId]
      );
      await conn.execute(
        "INSERT INTO member_academic_profile (member_id) VALUES (?)",
        [memberId]
      );
    }

    // Preserve existing populated fields; fill only missing values, matching the old service.
    const member = (await conn.execute(`
      SELECT
        m.*,c.mobile,c.whatsapp,c.whatsapp_secondary,c.professional_email,c.personal_email,
        c.address,c.city,c.state_province,c.pin_code,c.country,
        a.date_of_birth,a.qualification,a.research_guideship,a.expertise,
        a.linkedin,a.orcid,a.google_scholar,a.photo_url
      FROM members m
      LEFT JOIN member_contact_info c ON m.member_id=c.member_id
      LEFT JOIN member_academic_profile a ON m.member_id=a.member_id
      WHERE m.member_id=? FOR UPDATE
    `, [memberId]))[0][0];

    const v = (newValue, oldValue) =>
      newValue !== undefined && newValue !== null && String(newValue).trim() !== ""
        ? newValue
        : oldValue;

    const name = createdNew ? app.full_name.trim() : member.name;
    const academicTitle = v(ai.academic_title, member.academic_title);
    const designation = v(ai.designation, member.designation);
    const department = v(ai.department, member.department);
    const institution = v(ai.institution, member.institution);
    const category = v(app.membership_category, member.membership_category);

    await conn.execute(`
      UPDATE members SET academic_title=?,name=?,designation=?,department=?,institution=?,
        membership_category=?,is_active=1,my_status='Active'
      WHERE member_id=?
    `, [academicTitle,name,designation,department,institution,category,memberId]);

    await conn.execute(`
      UPDATE member_contact_info SET
        mobile=?,whatsapp=?,whatsapp_secondary=?,professional_email=?,personal_email=?,
        address=?,state_province=?,pin_code=?,country=?
      WHERE member_id=?
    `, [
      v(ac.mobile,member.mobile),v(ac.whatsapp,member.whatsapp),v(ac.whatsapp_secondary,member.whatsapp_secondary),
      v(ac.professional_email,member.professional_email),v(ac.personal_email,member.personal_email),
      v(ai.college_address,member.address),v(ai.state_province,member.state_province),
      v(ai.pin_code,member.pin_code),v(ai.country,member.country),
      memberId
    ]);

    await conn.execute(`
      UPDATE member_academic_profile SET
        date_of_birth=?,qualification=?,research_guideship=?,expertise=?,
        linkedin=?,orcid=?,google_scholar=?,photo_url=?
      WHERE member_id=?
    `, [
      v(ai.date_of_birth,member.date_of_birth),v(ai.highest_qualification,member.qualification),
      v(ac.research_guideship,member.research_guideship),v(ac.expertise,member.expertise),
      v(ac.linkedin,member.linkedin),v(ac.orcid,member.orcid),
      v(ac.google_scholar,member.google_scholar),v(ac.photo_url,member.photo_url),
      memberId
    ]);

    await conn.execute(`
      UPDATE membership_applications
      SET member_id=?,approval_status='Approved',reviewed_by=?,reviewed_at=NOW()
      WHERE application_id=?
    `, [memberId, req.admin.admin_id, id]);

    await conn.commit();

    res.json({
      success: true,
      message: "Application approved successfully.",
      data: { application_id:id, member_id:memberId, approval_status:"Approved", created_new_member:createdNew },
    });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

router.post("/admin/applications/:application_id/reject", async (req, res, next) => {
  try {
    const id = Number(req.params.application_id);
    const rows = await query("SELECT * FROM membership_applications WHERE application_id=?", [id]);
    const app = rows[0];
    if (!app) return res.status(404).json({ detail: "Application not found." });
    if (app.approval_status === "Approved") return res.status(400).json({ detail: "Approved application cannot be rejected." });
    if (app.approval_status !== "Pending") return res.status(400).json({ detail: `Only pending applications can be rejected. Current status is ${app.approval_status}.` });

    const reason = cleanString(req.body?.reason) || cleanString(req.query?.reason);
    const notes = app.admin_notes || "";
    const updatedNotes = reason ? `${notes}${notes ? "\n" : ""}[Rejected: ${reason}]` : notes;

    await query(`
      UPDATE membership_applications
      SET approval_status='Rejected',reviewed_by=?,reviewed_at=NOW(),admin_notes=?
      WHERE application_id=?
    `, [req.admin.admin_id, updatedNotes || null, id]);

    res.json({
      success:true,
      message:"Application rejected.",
      data:{application_id:id,status:"Rejected",reason},
    });
  } catch (err) { next(err); }
});

router.get("/admin/events", async (req, res, next) => {
  try {
    let status = cleanString(req.query.status);
    if (status === "PENDING_APPROVAL") status = "Pending";
    if (status === "APPROVED") status = "Approved";
    if (status === "REJECTED") status = "Rejected";

    let sql = `
      SELECT e.*,d.short_description,d.full_description,d.poster_url,d.organized_by,
        d.in_association_with,d.registration_fee,d.registration_link,d.rejection_reason,
        c.speaker_name,c.speaker_designation,c.speaker_institution,
        c.coordinator_name,c.contact_number,c.contact_email
      FROM events e
      LEFT JOIN event_details d ON e.event_id=d.event_id
      LEFT JOIN event_contacts c ON e.event_id=c.event_id
    `;
    const params = [];
    if (status) { sql += " WHERE e.status=?"; params.push(status); }
    sql += " ORDER BY e.created_at DESC";
    const rows = await query(sql, params);
    res.json({ success:true, data:rows, count:rows.length });
  } catch (err) { next(err); }
});

router.put("/admin/events/:event_id/review", async (req, res, next) => {
  try {
    const id = Number(req.params.event_id);
    const status = String(req.body?.status || req.query?.status || "").toUpperCase();
    const reason = cleanString(req.body?.rejection_reason || req.query?.rejection_reason);

    const rows = await query("SELECT event_id,status FROM events WHERE event_id=? LIMIT 1", [id]);
    if (!rows.length) return res.status(404).json({ detail:"Event not found" });
    if (!["APPROVED","REJECTED"].includes(status)) return res.status(400).json({ detail:"Status must be APPROVED or REJECTED." });
    if (rows[0].status !== "Pending") return res.status(400).json({ detail:`Only pending events can be reviewed. Current status is ${rows[0].status}.` });

    await query("UPDATE events SET status=?,reviewed_by=?,reviewed_at=NOW() WHERE event_id=?", [
      status === "APPROVED" ? "Approved" : "Rejected", req.admin.admin_id, id
    ]);
    await query("UPDATE event_details SET rejection_reason=? WHERE event_id=?", [
      status === "REJECTED" ? reason : null, id
    ]);

    res.json({ success:true, data:{event_id:id,status:status==="APPROVED"?"Approved":"Rejected"} });
  } catch (err) { next(err); }
});

// Compatibility routes used by the old localStorage event service.
async function reviewEventCompatibility(req, res, next, forcedStatus) {
  try {
    const id = Number(req.params.event_id);
    const rows = await query("SELECT event_id,status FROM events WHERE event_id=? LIMIT 1", [id]);
    if (!rows.length) return res.status(404).json({ detail:"Event not found" });
    if (rows[0].status !== "Pending") {
      return res.status(400).json({ detail:`Only pending events can be reviewed. Current status is ${rows[0].status}.` });
    }

    const dbStatus = forcedStatus === "APPROVED" ? "Approved" : "Rejected";
    const reason = cleanString(req.body?.reason || req.body?.rejection_reason || req.query?.reason);

    await query(
      "UPDATE events SET status=?,reviewed_by=?,reviewed_at=NOW() WHERE event_id=?",
      [dbStatus, req.admin.admin_id, id]
    );
    await query(
      "UPDATE event_details SET rejection_reason=? WHERE event_id=?",
      [dbStatus === "Rejected" ? reason : null, id]
    );

    res.json({
      success:true,
      message: dbStatus === "Approved" ? "Event approved." : "Event rejected.",
      data:{event_id:id,status:dbStatus}
    });
  } catch (err) {
    next(err);
  }
}

router.post("/admin/events/:event_id/approve", async (req, res, next) => {
  try {
    const eventId = Number(req.params.event_id);
    const adminId = req.admin.admin_id;

    await query(
      `CALL sp_approve_event(?, ?)`,
      [eventId, adminId]
    );

    const rows = await query(
      `SELECT
        event_id,
        event_title,
        event_date,
        registration_deadline,
        status,
        reviewed_by,
        reviewed_at
       FROM events
       WHERE event_id = ?`,
      [eventId]
    );

    const data = rows[0];

    if (!data) {
      return res.status(404).json({
        detail: "Event not found after approval."
      });
    }

    res.json({
      success: true,
      message: "Event approved.",
      data
    });

  } catch (err) {
    next(err);
  }
});

router.post("/admin/events/:event_id/publish", async (req, res, next) => {
  try {
    const eventId = Number(req.params.event_id);
    const adminId = req.admin.admin_id;

    await query(
      `CALL sp_publish_event(?, ?)`,
      [eventId, adminId]
    );

    const rows = await query(
      `SELECT
        event_id,
        event_title,
        event_date,
        registration_deadline,
        status,
        reviewed_by,
        reviewed_at
       FROM events
       WHERE event_id = ?`,
      [eventId]
    );

    const data = rows[0];

    if (!data) {
      return res.status(404).json({
        detail: "Event not found after publishing."
      });
    }

    res.json({
      success: true,
      message: "Event published.",
      data
    });

  } catch (err) {
    next(err);
  }
});

router.post("/admin/events/:event_id/reject", (req,res,next) =>
  reviewEventCompatibility(req,res,next,"REJECTED")
);

router.get("/admin/payments", async (req, res, next) => {
  try {
    const status = cleanString(req.query.status);
    const rows = await query(`
      SELECT
        p.payment_id,p.application_id,p.member_id,
        a.full_name AS applicant_name,
        COALESCE(ac.professional_email,ac.personal_email) AS applicant_email,
        ac.mobile AS applicant_mobile,
        p.membership_category,p.amount,p.currency,p.payment_method,p.payment_gateway,
        p.transaction_id,p.payment_status,a.approval_status,
        p.paid_at,p.created_at,p.updated_at,a.admin_notes
      FROM membership_payments p
      LEFT JOIN membership_applications a ON p.application_id=a.application_id
      LEFT JOIN application_contact_info ac ON a.application_id=ac.application_id
      ${status ? "WHERE p.payment_status=?" : ""}
      ORDER BY p.payment_id DESC
    `, status ? [status] : []);
    res.json({ success:true, data:rows.map(r=>({...r,amount:Number(r.amount)})), count:rows.length });
  } catch (err) { next(err); }
});

router.post("/admin/payments/:payment_id/verify", async (req, res, next) => {
  try {
    const id = Number(req.params.payment_id);
    const rows = await query("SELECT payment_id,application_id FROM membership_payments WHERE payment_id=?", [id]);
    if (!rows.length) return res.status(404).json({ detail:"Payment record not found." });

    await query("UPDATE membership_payments SET payment_status='Paid',paid_at=NOW() WHERE payment_id=?", [id]);
    const p = (await query("SELECT * FROM membership_payments WHERE payment_id=?", [id]))[0];
    res.json({
      success:true,
      message:"Payment verified and marked as Paid.",
      data:{payment_id:p.payment_id,application_id:p.application_id,payment_status:p.payment_status,paid_at:p.paid_at},
    });
  } catch (err) { next(err); }
});

router.post("/admin/payments/:payment_id/reject", async (req, res, next) => {
  try {
    const id = Number(req.params.payment_id);
    const rows = await query("SELECT * FROM membership_payments WHERE payment_id=?", [id]);
    if (!rows.length) return res.status(404).json({ detail:"Payment record not found." });

    await query("UPDATE membership_payments SET payment_status='Failed' WHERE payment_id=?", [id]);
    const reason = cleanString(req.body?.reason || req.query?.reason);
    if (reason && rows[0].application_id) {
      const app = (await query("SELECT admin_notes FROM membership_applications WHERE application_id=?", [rows[0].application_id]))[0];
      const notes = app?.admin_notes || "";
      await query(
        "UPDATE membership_applications SET admin_notes=? WHERE application_id=?",
        [`${notes}${notes ? "\n" : ""}[Payment Rejected: ${reason}]`, rows[0].application_id]
      );
    }

    const p = (await query("SELECT * FROM membership_payments WHERE payment_id=?", [id]))[0];
    res.json({ success:true,message:"Payment marked as Failed.",data:{payment_id:p.payment_id,payment_status:p.payment_status} });
  } catch (err) { next(err); }
});

module.exports = router;
