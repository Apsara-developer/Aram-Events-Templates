
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { createWorker } = require("tesseract.js");
const { GoogleGenAI } = require("@google/genai");

// =====================================================
// GEMINI CONFIGURATION
// =====================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const genAI = GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
    : null;

// =====================================================
// EXPRESS CONFIGURATION
// =====================================================

const app = express();
const PORT = process.env.PORT || 5000;

const frontendPath = path.join(__dirname, "..");

app.use(cors());

app.use(express.json({ limit: "20mb" }));

app.use(express.urlencoded({
    extended: true,
    limit: "20mb"
}));

app.use(express.static(frontendPath));

// =====================================================
// FILE UPLOAD CONFIGURATION
// =====================================================

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, callback) => {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            callback(null, true);
        } else {
            callback(
                new Error(
                    "Only JPG, JPEG, PNG, WEBP and PDF files are supported."
                )
            );
        }
    }
});

// =====================================================
// HOME AND EDITOR ROUTES
// =====================================================

app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

app.get("/editor.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "editor.html"));
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {

    res.status(200).json({
        success: true,
        message: "Aram Events AI backend is running.",
        provider: "Google Gemini",
        model: MODEL,
        geminiConfigured: Boolean(genAI)
    });

});

// =====================================================
// FLYER TEXT EXTRACTION
// PDF + IMAGE OCR
// =====================================================

async function extractFlyerText(file) {

    if (!file) {
        throw new Error("No flyer file received.");
    }

    // PDF TEXT EXTRACTION

    if (file.mimetype === "application/pdf") {

        const result = await pdfParse(file.buffer);

        return (result.text || "").trim();
    }

    // IMAGE OCR

    if (file.mimetype.startsWith("image/")) {

        const worker = await createWorker("eng");

        try {

            const result = await worker.recognize(file.buffer);

            return (result.data.text || "").trim();

        } finally {

            await worker.terminate();

        }
    }

    throw new Error("Unsupported flyer format.");
}

// =====================================================
// EVENT DETAILS EXTRACTION
// =====================================================

function extractEventDetails(text) {

    const lines = String(text || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const fullText = lines.join(" ");

    const months =
        "January|February|March|April|May|June|July|August|September|October|November|December";

    const dateMatch = fullText.match(
        new RegExp(
            `\\b(?:\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}|\\d{1,2}\\s+(?:${months})\\s+\\d{4}|(?:${months})\\s+\\d{1,2},?\\s+\\d{4})\\b`,
            "i"
        )
    );

    const timeMatch = fullText.match(
        /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|A\.M\.|P\.M\.)\b/i
    );

    const venueMatch = fullText.match(
        /\b(?:venue|location|address|held at)\s*[:\-]?\s*([^,\n]+(?:,\s*[^,\n]+)?)/i
    );

    const eventName =
        lines.find(line =>
            line.length >= 4 &&
            !/^(date|time|venue|location|register|contact|email)\b/i.test(line)
        ) || "";

    const description = lines
        .filter(line => line.length > 35)
        .slice(0, 5)
        .join(" ");

    return {
        eventName,
        eventDate: dateMatch ? dateMatch[0] : "",
        eventTime: timeMatch ? timeMatch[0] : "",
        venue: venueMatch ? venueMatch[1].trim() : "",
        description
    };
}

// =====================================================
// REUSABLE UPLOAD MIDDLEWARE
// =====================================================

function handleFlyerUpload(req, res, next) {

    upload.single("flyer")(req, res, error => {

        if (error) {

            return res.status(400).json({
                success: false,
                message: error.message
            });

        }

        next();
    });
}

// =====================================================
// API 1: EXTRACT FLYER DETAILS
// =====================================================

app.post(
    "/api/extract-flyer",
    handleFlyerUpload,
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message: "Please upload an event flyer."
                });

            }

            console.log("Extracting flyer:", req.file.originalname);

            const extractedText = await extractFlyerText(req.file);

            if (!extractedText) {

                return res.status(422).json({
                    success: false,
                    message: "No readable text found in the flyer."
                });

            }

            const data = extractEventDetails(extractedText);

            console.log("Flyer extraction completed.");

            return res.status(200).json({
                success: true,
                message: "Flyer details extracted successfully.",
                data,
                extractedText
            });

        } catch (error) {

            console.error("FLYER EXTRACTION ERROR:", error);

            return res.status(500).json({
                success: false,
                message: error.message ||
                    "Unable to extract flyer information."
            });

        }
    }
);

// =====================================================
// WEBSITE GENERATION PROMPT
// =====================================================

function createWebsitePrompt(eventData, design) {

    return `
You are a professional website designer and senior frontend developer.

Generate a COMPLETE, premium-quality, responsive event website.

EVENT INFORMATION:

${JSON.stringify(eventData, null, 2)}

DESIGN PREFERENCE:

${design || "Premium modern editorial event website with elegant typography."}

WEBSITE REQUIREMENTS:

1. Return a complete HTML document.
2. Include <!DOCTYPE html>.
3. Include html, head and body elements.
4. Write all CSS inside a style element.
5. Create a premium responsive navigation bar.
6. Create an attractive full-width hero section.
7. Display the actual event name prominently.
8. Include event date, time and venue.
9. Create an event overview section.
10. Create a programme or agenda section.
11. Create a speakers section.
12. Create sponsors and partners sections.
13. Create a venue and location section.
14. Create an event gallery section.
15. Create a contact section.
16. Create a professional footer.
17. Use modern typography, beautiful spacing and attractive colors.
18. Use CSS Grid and Flexbox where appropriate.
19. Add responsive mobile, tablet and desktop layouts.
20. Add smooth scrolling.
21. Add subtle hover effects and animations.
22. Use working navigation anchor links.
23. Do not use React, Vue or other frameworks.
24. Do not use external JavaScript libraries.
25. Use HTML, CSS and optional vanilla JavaScript.
26. Do not return Markdown code fences.
27. Do not return explanations outside the HTML.
28. Use actual information from the flyer.
29. Do not invent confirmed speakers, sponsors, addresses, emails, phone numbers or registration links.
30. If programme details are unavailable, show "Programme to be announced".
31. If speaker details are unavailable, show "Speakers to be announced".
32. If partner details are unavailable, show "Partners to be announced".
33. Do not invent event information.
34. Make the design visually rich and suitable for a real professional event.
35. Do not use broken image URLs.
36. Use the uploaded flyer as a visual reference when an image is provided.
37. Ensure every navigation link points to a real section.
38. Include polished mobile navigation functionality.
39. Return a complete standalone HTML website.

Return ONLY the complete HTML document.
`;
}

// =====================================================
// HTML CLEANUP
// =====================================================

function cleanGeneratedHTML(value) {

    let html = String(value || "").trim();

    html = html
        .replace(/^```html\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    const htmlStart = html.search(/<!doctype html|<html\b/i);

    if (htmlStart > 0) {
        html = html.slice(htmlStart);
    }

    if (
        !/<html\b/i.test(html) ||
        !/<head\b/i.test(html) ||
        !/<body\b/i.test(html)
    ) {

        throw new Error(
            "Gemini did not return a complete HTML website. Please try again."
        );

    }

    return html;
}

// =====================================================
// API 2: GENERATE COMPLETE WEBSITE USING GEMINI
// =====================================================

app.post(
    "/api/generate-website",
    handleFlyerUpload,
    async (req, res) => {

        try {

            console.log("Received AI website generation request.");

            // CHECK GEMINI CONFIGURATION

            if (!genAI) {

                return res.status(500).json({
                    success: false,
                    message: "GEMINI_API_KEY is missing. Add your Gemini API key to backend/.env and restart the server."
                });

            }

            // GET FORM DATA

            const {
                eventName,
                eventDate,
                eventTime,
                venue,
                description,
                extractedText,
                design
            } = req.body || {};

            if (
                !req.file &&
                !eventName &&
                !eventDate &&
                !venue &&
                !description &&
                !extractedText
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Upload a flyer or provide event details."
                });

            }

            // READ FLYER CONTENT

            let flyerText = extractedText || "";

            if (req.file) {

                console.log("Reading uploaded flyer.");

                const recognizedText = await extractFlyerText(req.file);

                flyerText = [
                    flyerText,
                    recognizedText
                ].filter(Boolean).join("\n");

            }

            // COMBINE EVENT DATA

            const eventData = {
                eventName: eventName || "",
                eventDate: eventDate || "",
                eventTime: eventTime || "",
                venue: venue || "",
                description: description || "",
                flyerText: flyerText || ""
            };

            // CREATE PROMPT

            const prompt = createWebsitePrompt(
                eventData,
                design
            );

            // GEMINI CONTENT PARTS

            const parts = [
                {
                    text: prompt
                }
            ];

            // SEND IMAGE TO GEMINI

            if (
                req.file &&
                req.file.mimetype.startsWith("image/")
            ) {

                console.log("Adding flyer image to Gemini request.");

                const base64 = req.file.buffer.toString("base64");

                parts.push({
                    inlineData: {
                        mimeType: req.file.mimetype,
                        data: base64
                    }
                });

            }

            console.log("Sending request to Google Gemini...");
            console.log("Using model:", MODEL);

            // GEMINI API REQUEST

            const response = await genAI.models.generateContent({

                model: MODEL,

                contents: [
                    {
                        role: "user",
                        parts
                    }
                ],

                config: {
                    temperature: 0.7,
                    maxOutputTokens: 12000
                }

            });

            // GET GENERATED HTML

            const generatedText = response.text;

            if (!generatedText) {

                throw new Error(
                    "Gemini returned an empty response. Please try again."
                );

            }

            const html = cleanGeneratedHTML(generatedText);

            console.log("Gemini website generated successfully.");

            // RETURN WEBSITE TO FRONTEND

            return res.status(200).json({
                success: true,
                message: "Complete event website generated successfully.",
                html,
                eventData
            });

        } catch (error) {

            console.error("GEMINI WEBSITE GENERATION ERROR:", error);

            let message = error.message ||
                "Unable to generate the event website.";

            const status = Number(error.status || error.statusCode);

            if (status === 400) {

                message = "Gemini rejected the request. Check the uploaded file and request details.";

            } else if (status === 401 || status === 403) {

                message = "Gemini API authentication failed. Check your GEMINI_API_KEY.";

            } else if (status === 429) {

                message = "Gemini API quota or rate limit reached. Check your Google AI Studio usage and limits.";

            } else if (status === 404) {

                message = "Gemini model not found. Check GEMINI_MODEL in your backend/.env file.";

            }

            return res.status(500).json({
                success: false,
                message
            });

        }
    }
);

// =====================================================
// API NOT FOUND HANDLER
// =====================================================

app.use("/api", (req, res) => {

    res.status(404).json({
        success: false,
        message: `API route not found: ${req.method} ${req.originalUrl}`
    });

});

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {

    console.error("SERVER ERROR:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        message: error.message || "Internal server error."
    });

});

// =====================================================
// START SERVER
// =====================================================

const server = app.listen(PORT, () => {

    console.log("------------------------------------------");
    console.log("       ARAM EVENTS AI BACKEND");
    console.log("------------------------------------------");

    console.log(`Server running: http://localhost:${PORT}`);
    console.log(`Frontend: http://localhost:${PORT}/`);
    console.log(`Editor: http://localhost:${PORT}/editor.html`);
    console.log(`Health: http://localhost:${PORT}/api/health`);

    console.log(`Gemini configured: ${Boolean(genAI)}`);
    console.log("AI provider: Google Gemini");
    console.log(`AI model: ${MODEL}`);

    console.log("------------------------------------------");

});

server.on("error", error => {

    if (error.code === "EADDRINUSE") {

        console.error(`Port ${PORT} is already in use.`);
        console.error("Stop the other backend process before starting this one.");

    } else {

        console.error("SERVER STARTUP ERROR:", error);

    }

});
