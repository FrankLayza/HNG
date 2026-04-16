import express from "express"
import { nameSchema } from "../config.js";
import { prisma } from "../lib/prisma.js";
import {v7 as uuidv7} from 'uuid'
import { getAllProfile, getProcessedAt } from "../services/external.js";
import { getAgeGroup, getTopCountry } from "../services/classify.js";


const route = express.Router()

route.post('/api/profiles', async (req, res) => {
    const validation = nameSchema.safeParse(req.body)
    if(!validation.success){
        return res.status(400).json({
            status: "error",
            message: validation.error.message
        })
    }
    const validatedData = validation.data;
    try {
        const existing = await prisma.profile.findUnique({
            where: {
                name: validatedData.name,
            },
        });
        if(existing){
            return res.status(200).json({
                status: "success",
                message: "Profile already exists",
                data: existing
            })
        }
        const [ageRes, countryRes, genderRes] = await getAllProfile(validatedData.name)
        const ageGroup = getAgeGroup(ageRes.age)
        const country = getTopCountry(countryRes.country)
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
            data: profile
        })
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: "Internal server error",
        })
    }
})

route.get("/api/profiles/:id", async (req, res) => {
    const {id} = req.params
    try {
        const profile = await prisma.profile.findUnique({
            where: {
                id: id,
            },
        });
        if(!profile){
            return res.status(404).json({
                status: "error",
                message: "Profile not found",
            })
        }
        return res.status(200).json({
            status: "success",
            data: profile
        })
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: "Internal server error",
        })
    }
})