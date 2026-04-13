import express from "express";
import dotenv from "dotenv"
import cors from "cors";
import type { APIResponse } from "./config.js";
import { classifyName } from "./config.js";
import rateLimit from "express-rate-limit"

const appLimiter = rateLimit({
  windowMs: 1000 * 60 * 10,
  limit: 50
})

const corsOption = {
  origin: "*",
  optionsSuccessStatus: 200
}

dotenv.config()
const app = express();
app.use(cors(corsOption));
app.use(express.json());
app.use(appLimiter)



app.get("/api/classify", async (req, res) => {
  const name = req.query.name;

  if (typeof name !== "string") {
    return res.status(422).json({
      status: "error",
      message: "name is not a string",
    });
  }

  const result: APIResponse = await classifyName(name);
  if (result.status === "error") {
    const statusCode =
      result.message === "Missing or empty name parameter"
        ? 400
        : result.message === "Upstream or server failure"
          ? 500
          : 200;

    return res.status(statusCode).json(result);
  }
  return res.status(200).json(result);
});

app.listen(process.env.PORT, () => {
  console.log(`Server started at ${process.env.PORT} `);
});
