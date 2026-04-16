import express from "express"
import { nameSchema } from "../config.js";
import { prisma } from "../lib/prisma.js";

const route = express.Router()

route.post('/api/profiles', async (req, res) => {
    const name = req.body;
    const validation = nameSchema.safeParse({name})
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
            return res.status(400).json({
                status: "error",
                message: "Profile already exists",
                data: existing
            })
        }
    } catch (error) {
        
    }
    return res.status(200).json({
        status: "success",
        data: validatedData
    })
})

route.get("/api/profiles/:id", (id) => {
    
})