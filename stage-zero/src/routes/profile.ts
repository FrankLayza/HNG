import { Router } from "express";
import { nameSchema } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { v7 as uuidv7 } from "uuid";
import { getAllProfile } from "../services/external.js";
import { getAgeGroup, getTopCountry } from "../services/classify.js";
import { Prisma } from "../generated/prisma/client.js";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireAdmin, requireAnalyst } from "../middleware/rbac.js";
import { parseNLQ } from "../lib/parser.js";
import countries from "i18n-iso-countries";
import { createRequire } from "module";
import * as fastcsv from "fast-csv";

const require = createRequire(import.meta.url);
const en = require("i18n-iso-countries/langs/en.json");
countries.registerLocale(en);

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  gender: z.string().optional(),
  age_group: z.string().optional(),
  country_id: z.string().optional(),
  min_age: z.coerce.number().min(0).optional(),
  max_age: z.coerce.number().min(0).optional(),
  min_gender_probability: z.coerce.number().optional(),
  min_country_probability: z.coerce.number().optional(),
  sort_by: z.enum(["age", "created_at", "gender_probability"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const route: Router = Router();

/**
 * @route   POST /api/v1/profiles
 * @desc    Create a new profile (Analyst+)
 */
route.post("/", authenticate, requireAnalyst, async (req, res) => {
  if (!req.body.name) {
    return res.status(400).json({ status: "error", message: "Name is required" });
  }

  const validation = nameSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ status: "error", message: "Invalid profile data", errors: validation.error.issues });
  }

  const validatedData = validation.data;

  try {
    const existing = await prisma.profile.findUnique({
      where: { name: validatedData.name },
    });

    if (existing) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: existing,
      });
    }

    const [ageRes, countryRes, genderRes] = await getAllProfile(validatedData.name);
    const ageGroup = getAgeGroup(ageRes.age);
    const country = getTopCountry(countryRes.country);

    const profile = await prisma.profile.create({
      data: {
        id: uuidv7(),
        name: validatedData.name,
        gender: genderRes.gender,
        gender_probability: genderRes.probability,
        age: ageRes.age,
        age_group: ageGroup,
        country_id: country.country_id,
        country_name: countries.getName(country.country_id, "en") || "Unknown",
        country_probability: country.probability,
      },
    });

    return res.status(201).json({
      status: "success",
      message: "Profile created successfully",
      data: profile,
    });
  } catch (error: any) {
    console.error("Profile creation error:", error);
    const status = error.message?.includes("invalid response") ? 502 : 500;
    return res.status(status).json({ status: "error", message: error.message || "Internal server error" });
  }
});

/**
 * @route   GET /api/v1/profiles/export
 * @desc    Export all profiles as CSV (Admin only)
 */
route.get("/export", authenticate, requireAdmin, async (req, res) => {
  try {
    const profiles = await prisma.profile.findMany({
      orderBy: { created_at: "desc" },
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=profiles_export.csv");

    const csvStream = fastcsv.format({ headers: true });
    csvStream.pipe(res);

    profiles.forEach((profile) => {
      csvStream.write({
        ID: profile.id,
        Name: profile.name,
        Gender: profile.gender,
        Gender_Prob: profile.gender_probability,
        Age: profile.age,
        Age_Group: profile.age_group,
        Country: profile.country_name,
        Country_Code: profile.country_id,
        Country_Prob: profile.country_probability,
        Created_At: profile.created_at.toISOString(),
      });
    });

    csvStream.end();
  } catch (error) {
    console.error("Export error:", error);
    if (!res.headersSent) {
      res.status(500).json({ status: "error", message: "Failed to export profiles" });
    }
  }
});

/**
 * @route   GET /api/v1/profiles/search
 * @desc    Search profiles using NLQ (Analyst+)
 */
route.get("/search", authenticate, requireAnalyst, async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ status: "error", message: "Search query 'q' is required" });
  }

  const parsedFilters = parseNLQ(query);
  if (!parsedFilters) {
    return res.status(400).json({ status: "error", message: "Unable to interpret natural language query" });
  }

  const mergedQuery = { ...req.query, ...parsedFilters };
  const parsed = querySchema.safeParse(mergedQuery);

  if (!parsed.success) {
    return res.status(400).json({ status: "error", message: "Invalid query parameters", errors: parsed.error.issues });
  }

  try {
    const result = await executeProfileSearch(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error during search" });
  }
});

/**
 * @route   GET /api/v1/profiles/:id
 * @desc    Get profile by ID (Analyst+)
 */
route.get("/:id", authenticate, requireAnalyst, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: req.params.id as string },
    });

    if (!profile) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }

    return res.status(200).json({ status: "success", data: profile });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

/**
 * @route   GET /api/v1/profiles
 * @desc    List profiles with filtering and pagination (Analyst+)
 */
route.get("/", authenticate, requireAnalyst, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ status: "error", message: "Invalid query parameters", errors: parsed.error.issues });
  }

  try {
    const result = await executeProfileSearch(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    console.error("List profiles error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

/**
 * @route   DELETE /api/v1/profiles/:id
 * @desc    Delete a profile (Admin only)
 */
route.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await prisma.profile.delete({
      where: { id: req.params.id as string },
    });
    return res.status(204).send();
  } catch (error) {
    return res.status(404).json({ status: "error", message: "Profile not found" });
  }
});

/**
 * Helper function to execute search with Prisma and format pagination
 */
async function executeProfileSearch(data: z.infer<typeof querySchema>) {
  const where: Prisma.ProfileWhereInput = {};
  
  if (data.gender) where.gender = { equals: data.gender, mode: "insensitive" };
  if (data.country_id) where.country_id = { equals: data.country_id, mode: "insensitive" };
  if (data.age_group) where.age_group = { equals: data.age_group, mode: "insensitive" };

  if (data.min_age !== undefined || data.max_age !== undefined) {
    where.age = {};
    if (data.min_age !== undefined) where.age.gte = data.min_age;
    if (data.max_age !== undefined) where.age.lte = data.max_age;
  }

  if (data.min_gender_probability !== undefined) {
    where.gender_probability = { gte: data.min_gender_probability };
  }

  if (data.min_country_probability !== undefined) {
    where.country_probability = { gte: data.min_country_probability };
  }

  const skip = (data.page - 1) * data.limit;

  const [total, profiles] = await Promise.all([
    prisma.profile.count({ where }),
    prisma.profile.findMany({
      where,
      skip,
      take: data.limit,
      orderBy: { [data.sort_by]: data.order },
    }),
  ]);

  const total_pages = Math.ceil(total / data.limit);

  return {
    status: "success",
    data: profiles,
    pagination: {
      page: data.page,
      limit: data.limit,
      total,
      total_pages,
      has_next: data.page < total_pages,
      has_prev: data.page > 1,
    }
  };
}

export default route;
