import express from "express"
import cors from "cors"
import * as dotenv from "dotenv"
import { analyzeBloodReport } from "./analyzeBloodReport"

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json({ limit: "10mb" }))

app.post("/api/analyze", async (req, res) => {
  console.log("🔥 /api/analyze HIT");

  try {
    const { imageBase64, mimeType } = req.body;

    console.log("📦 Payload received:", {
      hasImage: !!imageBase64,
      mimeType,
    });

    const data = await analyzeBloodReport(imageBase64, mimeType);

    console.log("✅ Analysis success");
    res.json(data);
  } catch (err) {
    console.error("❌ Analysis failed:", err);
    res.status(500).json({ error: String(err) });
  }
});


app.listen(3001, () => {
  console.log("Backend running on http://localhost:3001")
})
