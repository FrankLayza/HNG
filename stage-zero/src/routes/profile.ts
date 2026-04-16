import { Router } from "express";
import { nameSchema } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { v7 as uuidv7 } from "uuid";
import { getAllProfile } from "../services/external.js";
import { getAgeGroup, getTopCountry } from "../services/classify.js";
import { Prisma } from "@prisma/client";

const route: Router = Router();

route.post("/api/profiles", async (req, res) => {
  if (req.body.name === undefined || req.body.name === "") {
    return res.status(400).json({
      status: "error",
      message: "Missing or empty name",
    });
  }
  if (typeof req.body.name !== "string") {
    return res.status(422).json({
      status: "error",
      message: "name is not a string",
    });
  }

  const validation = nameSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      status: "error",
      message: "Missing or empty name",
    });
  }
  const validatedData = validation.data;
  try {
    const existing = await prisma.profile.findUnique({
      where: {
        name: validatedData.name,
      },
    });
    if (existing) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: existing,
      });
    }
    const [ageRes, countryRes, genderRes] = await getAllProfile(
      validatedData.name,
    );
    const ageGroup = getAgeGroup(ageRes.age);
    const country = getTopCountry(countryRes.country);
    const profile = await prisma.profile.create({
      data: {
        id: uuidv7(),
        name: validatedData.name,
        gender: genderRes.gender,
        gender_probability: genderRes.probability,
        sample_size: genderRes.sample_size,
        age: ageRes.age,
        age_group: ageGroup,
        country_id: country.country_id,
        country_probability: country.probability,
      },
    });
    return res.status(201).json({
      status: "success",
      message: "Profile created successfully",
      data: profile,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("returned an invalid response")
    ) {
      return res.status(502).json({
        status: "error",
        message: error.message,
      });
    }
  }
});

route.get("/api/profiles/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const profile = await prisma.profile.findUnique({
      where: {
        id: id,
      },
    });
    if (!profile) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
    }
    return res.status(200).json({
      status: "success",
      data: profile,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});

route.get("/api/profiles", async (req, res) => {
  const { gender, country_id, age_group } = req.query;
  const where: Prisma.ProfileWhereInput = {};
  if (gender) {
    where.gender = { equals: gender as string, mode: "insensitive" };
  }
  if (country_id) {
    where.country_id = { equals: country_id as string, mode: "insensitive" };
  }
  if (age_group) {
    where.age_group = { equals: age_group as string, mode: "insensitive" };
  }
  try {
    const profiles = await prisma.profile.findMany({
      where,
    });
    return res.status(200).json({
      status: "success",
      count: profiles.length,
      data: profiles.map((profile) => {
        return {
          id: profile.id,
          name: profile.name,
          gender: profile.gender,
          age: profile.age,
          age_group: profile.age_group,
          country_id: profile.country_id,
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});

route.delete("/api/profiles/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.profile.delete({
      where: {
        id: id,
      },
    });
    return res.status(204).send();
  } catch (error) {
    return res
      .status(404)
      .json({ status: "error", message: "Profile not found" });
  }
});
export default route;
