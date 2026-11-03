const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const csv = (value, fallback = "") =>
  String(value || fallback)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

module.exports = {
  port: Number(process.env.PORT || 5000),

  nodeEnv: process.env.NODE_ENV || "development",

  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "",
  },

  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: `${Number(process.env.JWT_EXPIRE_MINUTES || 60)}m`,
  },

  resend: {
  apiKey: process.env.RESEND_API_KEY || "",
},

  smtp: {
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
  },

  auth: {
    otpLength: 6,
    otpExpiresMinutes: 10,
    maxOtpAttempts: 5,
    maxCodeRequestsPerHour: 5,
  },

  corsOrigins: csv(
    process.env.CORS_ORIGINS,
    "http://localhost:5500,http://127.0.0.1:5500,http://localhost:5502,http://127.0.0.1:5502,"
  ),

  uploadDir: path.resolve(process.env.UPLOAD_DIR || "uploads"),
};