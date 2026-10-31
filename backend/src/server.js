const path = require("path");
const express = require("express");
const cors = require("cors");

const config = require("./config/env");
const { testConnection } = require("./db/pool");
const { ensureUploadDirs } = require("./utils/uploads");

const membersRouter = require("./routes/members");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const applicationsRouter = require("./routes/membershipApplications");
const paymentsRouter = require("./routes/payments");
const eventsRouter = require("./routes/publicEvents");
const memberAuthRouter = require("./routes/memberAuth");
const advertisementsRouter = require("./routes/advertisements");

const { errorHandler } = require("./middleware/errorHandler");
// Reuse the same database-backed membership checks as the member routes.
const { requireMember } = require("./middleware/memberAuth");


const app = express();


app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);


// ======================================================
// PATHS
// ======================================================

// backend/src/server.js
//        ↓
// backend/
//        ↓
// icmta_dev/   <-- frontend root

const frontendPath = path.join(__dirname, "..", "..");

ensureUploadDirs();

// ======================================================
// CORS
// ======================================================

app.use(cors({
  origin(origin, callback) {
    // Allow requests without Origin header
    // and configured frontend origins.
    if (
      !origin ||
      config.corsOrigins.includes("*") ||
      config.corsOrigins.includes(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error("CORS origin not allowed"));
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ],
}));

// ======================================================
// BODY PARSING
// ======================================================

app.use(express.json({ limit: "2mb" }));

app.use(express.urlencoded({
  extended: true,
  limit: "2mb"
}));

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", async (req, res) => {
  try {
    await testConnection();

    res.json({
      success: true,
      status: "healthy",
      database: "connected"
    });

  } catch (err) {

    res.status(503).json({
      success: false,
      status: "unhealthy",
      database: "disconnected",
      detail: err.message
    });
  }
});

// ======================================================
// UPLOADS
// ======================================================

app.use(
  "/uploads",
  express.static(config.uploadDir, {
    fallthrough: false,
    index: false,
  })
);
// ======================================================
// ROUTERS
// ====================================================== 
//these are the temporary console logs to check if the routers are being imported correctly
//they can be removed later
console.log("membersRouter:", typeof membersRouter);
console.log("authRouter:", typeof authRouter);
console.log("applicationsRouter:", typeof applicationsRouter);
console.log("eventsRouter:", typeof eventsRouter);
console.log("paymentsRouter:", typeof paymentsRouter);
console.log("memberAuthRouter:", typeof memberAuthRouter);
console.log("advertisementsRouter:", typeof advertisementsRouter);
console.log("adminRouter:", typeof adminRouter);

// ======================================================
// API ROUTES
// ======================================================

// Public/general routes must be registered before adminRouter.
// adminRouter uses router.use(requireAdmin), so anything mounted
// after it would also require an admin JWT.
app.use("/api", membersRouter);
app.use("/api", authRouter);
app.use("/api", applicationsRouter);
app.use("/api", eventsRouter);
app.use("/api", paymentsRouter);
app.use("/api", memberAuthRouter);
app.use("/api", advertisementsRouter);

// Protected admin routes
app.use("/api", adminRouter);



// ======================================================
// MEMBER DIRECT PROFILE API
// ======================================================

// Require active ICMTA membership before returning a full member profile.
app.get("/members/:member_id", requireMember, async (req, res, next) => {
  try {
    const { query } = require("./db/pool");
    const { getMemberById } = require("./services/memberQueries");

    const member = await getMemberById(
      query,
      req.params.member_id,
      true
    );

    if (!member) {
      return res.status(404).json({
        detail: "Member not found or inactive."
      });
    }

    res.json({
      success: true,
      data: member
    });

  } catch (err) {
    next(err);
  }
});

// ======================================================
// FRONTEND STATIC FILES
// ======================================================

// This serves:
// /index.html
// /css/...
// /js/...
// /images/...
// etc.

app.use(express.static(frontendPath));

// ======================================================
// FRONTEND 404
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    detail: "Route not found"
  });
});

// ======================================================
// ERROR HANDLER
// ======================================================

app.use(errorHandler);

// ======================================================
// START SERVER
// ======================================================

async function start() {

  try {

    await testConnection();

    console.log("[DB] MySQL connection successful.");

  } catch (err) {

    console.error(
      "[DB] MySQL connection failed:",
      err.message
    );

    console.error(
      "[DB] Check backend/.env before deploying."
    );

    // Start server anyway so /api/health
    // can report the database problem.
  }

  app.listen(
    config.port,
    "0.0.0.0",
    () => {

      console.log(
        `[SERVER] ICMTA Node/Express listening on port ${config.port}`
      );

    }
  );
}

if (require.main === module) {
  start();
}

module.exports = app;