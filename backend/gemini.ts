import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function analyzeWithGemini(
  imageBase64: string,
  mimeType: string
) {
  // ✅ Correct model for image + OCR
  const model = genAI.getGenerativeModel({
    model: "gemini-1.0-pro-vision",
  });

  const result = await model.generateContent([
    {
      inlineData: {
        data: imageBase64,
        mimeType,
      },
    },
    `
Return ONLY valid JSON in this exact format:
{
  "summary": "string",
  "markers": [
    {
      "name": "string",
      "value": "string",
      "status": "Normal | Borderline | Abnormal",
      "meaning": "string"
    }
  ],
  "advice": "string"
}

Please analyze the medical blood report image provided above using OCR and extract the relevant information. Summarize the key findings, identify important markers along with their values and statuses (Normal, Borderline, Abnormal), and provide meaningful advice based on the results. Return the information in JSON format as specified.Please use OCR to extract text from the image and analyze the blood report accordingly. 

`
  ]);

  const text = result.response.text();
  return JSON.parse(text);
}


