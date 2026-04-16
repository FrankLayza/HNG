import "dotenv/config";
import express from "express";
import cors from "cors";
// import type { APIResponse } from "./config.js";
// import { classifyName } from "./config.js";
import rateLimit from "express-rate-limit";
import profileRoute from "./routes/profile.js";

const appLimiter = rateLimit({
  windowMs: 1000 * 60 * 10,
  limit: 5000,
});

const corsOption = {
  origin: "*",
  optionsSuccessStatus: 200,
};

const app = express();
app.set("trust proxy", 1);
app.use(cors(corsOption));
app.use(express.json());
app.use(appLimiter);
app.use(profileRoute);


app.listen(process.env.PORT, () => {
  console.log(`Server started at port ${process.env.PORT}`);
});
