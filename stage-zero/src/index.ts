import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import profileRoute from "./routes/profile.js";
import authRoute from "./routes/auth.js";

// Rate limiting configuration
const appLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, // Limit each IP to 1000 requests per windowMs
  message: { status: "error", message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const corsOption = {
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  optionsSuccessStatus: 200,
  credentials: true,
};

const app = express();

// Middleware
app.set("trust proxy", 1);
app.use(morgan("dev")); // Concise logging for development
app.use(cors(corsOption));
app.use(express.json());
app.use(appLimiter);

// Routes
// We use /api/v1 prefix as required by Stage 3
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/profiles", profileRoute);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Insighta Labs+ API is running" });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Endpoint not found" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
  🚀 Insighta Labs+ Backend is live!
  📡 Port: ${PORT}
  🔗 API Base: /api/v1
  `);
});
