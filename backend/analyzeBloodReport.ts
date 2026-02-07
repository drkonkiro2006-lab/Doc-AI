import * as dotenv from "dotenv"
dotenv.config() // MUST be before weave.init()

import * as weave from "weave"
import { analyzeWithGemini } from "./gemini"

weave.init("kumarayush-professional-heritage-institute-of-technology-org/quickstart_playground");



export const analyzeBloodReport = weave.op(
  async function analyzeBloodReport(imageBase64: string, mimeType: string) {
    const result = await analyzeWithGemini(imageBase64, mimeType)
    return result
  }
)