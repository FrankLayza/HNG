import express from "express";
import dotenv from "dotenv";
import cors from "cors";
// import type { APIResponse } from "./config.js";
// import { classifyName } from "./config.js";
import rateLimit from "express-rate-limit";
import profileRoute from "./routes/profile.js";
dotenv.config();

const appLimiter = rateLimit({
  windowMs: 1000 * 60 * 10,
  limit: 5000,
});

const corsOption = {
  origin: "*",
  optionsSuccessStatus: 200,
};

const app = express();
app.use(cors(corsOption));
app.use(express.json());
app.use(appLimiter);
app.use(profileRoute);

// app.get("/api/classify", async (req, res) => {
//   const name = req.query.name;

//   if (name === undefined) {
//     return res.status(400).json({
//       status: "error",
//       message: "Missing or empty name parameter",
//     });
//   }

//   if (typeof name !== "string") {
//     return res.status(422).json({
//       status: "error",
//       message: "name is not a string",
//     });
//   }

//   if (!name.trim()) {
//     return res.status(400).json({
//       status: "error",
//       message: "Missing or empty name parameter",
//     });
//   }

//   const result: APIResponse = await classifyName(name);

//   if (result.status === "error") {
//     let statusCode: number;
//     switch (result.message) {
//       case "Missing or empty name parameter":
//         statusCode = 400;
//         break;
//       case "name is not a string":
//         statusCode = 422;
//         break;
//       case "No prediction available for the provided name":
//         statusCode = 422;
//         break;
//       case "Upstream or server failure":
//         statusCode = 502;
//         break;
//       default:
//         statusCode = 500;
//     }
//     return res.status(statusCode).json(result);
//   }

//   return res.status(200).json(result);
// });

app.listen(process.env.PORT, () => {
  console.log(`Server started at port ${process.env.PORT}`);
});
