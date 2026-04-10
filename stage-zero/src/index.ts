import express from "express";
import cors from "cors";
import type { APIResponse } from "./config.js";
import { classifyName } from "./config.js";

const app = express();
const PORT = 2000;
app.use(cors());
app.use(express.json());

app.get("/api/classify", async (req, res) => {
  const name = req.query.name;

  if (typeof name !== "string") {
    return res.status(422).json({
      status: "error",
      message: "Name must be string",
    });
  }

  const result: APIResponse = await classifyName(name);
  if (result.status === "error") {
    const statusCode =
      result.message === "Name is required"
        ? 400
        : result.message.includes("No prediction")
          ? 200
          : 500;

    return res.status(statusCode).json(result);
  }
  return res.status(200).json(result);
});

app.listen(PORT, () => {
  console.log(`Server started at ${PORT} `);
});
