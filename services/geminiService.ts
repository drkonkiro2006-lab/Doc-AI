
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { DiagnosisResult, BloodReportAnalysis, HealthPrediction } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const diagnoseImage = async (base64Image: string, mimeType: string): Promise<DiagnosisResult> => {
  const prompt = `Analyze this medical image (Eye, Skin, Lung X-ray, or Brain MRI). 
  Identify potential diseases, the probability of the finding, and the severity.
  Provide a brief medical-style explanation and 3 recommendations.
  Return ONLY a JSON object matching this structure:
  {
    "disease": "string",
    "probability": number (0-100),
    "severity": "Low" | "Medium" | "High",
    "explanation": "string",
    "recommendations": ["string", "string", "string"]
  }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          disease: { type: Type.STRING },
          probability: { type: Type.NUMBER },
          severity: { type: Type.STRING },
          explanation: { type: Type.STRING },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        propertyOrdering: ["disease", "probability", "severity", "explanation", "recommendations"]
      },
      systemInstruction: "You are a senior AI radiologist and dermatologist assistant. Be precise and objective. Always mention you are an AI assistant."
    }
  });

  return JSON.parse(response.text || '{}');
};

export const analyzeBloodReport = async (base64Image: string, mimeType: string): Promise<BloodReportAnalysis> => {
  const prompt = `Perform OCR on this blood report and analyze markers like Hemoglobin, RBC, WBC, Sugar, Cholesterol, Liver, and Kidney markers.
  Return a summary of the report, a list of detected markers with their status (Normal, Borderline, Abnormal), and advice.
  Return ONLY a JSON object matching this structure:
  {
    "summary": "string",
    "markers": [
      { "name": "string", "value": "string", "status": "Normal" | "Borderline" | "Abnormal", "meaning": "string" }
    ],
    "advice": "string"
  }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          markers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.STRING },
                status: { type: Type.STRING },
                meaning: { type: Type.STRING }
              }
            }
          },
          advice: { type: Type.STRING }
        },
        propertyOrdering: ["summary", "markers", "advice"]
      },
      systemInstruction: "You are an expert hematologist assistant. Simplify complex terms for patients while remaining accurate."
    }
  });

  return JSON.parse(response.text || '{}');
};

export const getHealthPrediction = async (userContext: any, diagnosisData?: any): Promise<HealthPrediction> => {
  const prompt = `Based on this user profile: ${JSON.stringify(userContext)} 
  and recent diagnosis: ${JSON.stringify(diagnosisData || 'None')},
  predict future disease risks and early warning signs. 
  Focus on preventive care. 
  MANDATORY: Return a clean structured JSON. DO NOT use asterisks, markdown, or bullet points in the strings.
  Use "isHighPriority": true for anything that is particularly vulnerable or needs immediate attention.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            riskCategories: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        heading: { type: Type.STRING },
                        description: { type: Type.STRING },
                        isHighPriority: { type: Type.BOOLEAN }
                      }
                    }
                  }
                }
              }
            },
            monitoringSigns: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sign: { type: Type.STRING },
                  description: { type: Type.STRING },
                  urgency: { type: Type.STRING }
                }
              }
            }
          }
        },
        systemInstruction: "You are a preventive medicine expert. Identify long-term trends and risks based on patient data. Provide highly organized, professional clinical assessments without markdown artifacts."
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (err: any) {
    // Extract user-friendly error message
    let errorMessage = 'Failed to generate health prediction.';
    
    if (err?.error?.message) {
      errorMessage = err.error.message;
    } else if (err?.message) {
      errorMessage = err.message;
    } else if (typeof err === 'string') {
      try {
        const parsed = JSON.parse(err);
        errorMessage = parsed.error?.message || parsed.message || errorMessage;
      } catch {
        errorMessage = err;
      }
    }
    
    throw new Error(errorMessage);
  }
};

export const createHealthChat = (systemInstruction: string) => {
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction
    }
  });
};





// import { DiagnosisResult, BloodReportAnalysis, HealthPrediction } from "../types";

// const API_BASE_URL = "http://localhost:3001"; 
// // Later you can switch this to production URL

// /* -------------------------------------------------------
//    IMAGE DIAGNOSIS (Eye / Skin / X-ray / MRI)
// ------------------------------------------------------- */
// export const diagnoseImage = async (
//   base64Image: string,
//   mimeType: string
// ): Promise<DiagnosisResult> => {
//   const response = await fetch(`${API_BASE_URL}/api/diagnose`, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       imageBase64: base64Image,
//       mimeType,
//     }),
//   });

//   if (!response.ok) {
//     throw new Error("Image diagnosis failed");
//   }

//   return response.json();
// };

// /* -------------------------------------------------------
//    BLOOD REPORT ANALYSIS (OCR + MARKERS)
// ------------------------------------------------------- */
// export const analyzeBloodReport = async (
//   base64Image: string,
//   mimeType: string
// ): Promise<BloodReportAnalysis> => {
//   const response = await fetch(`${API_BASE_URL}/api/analyze`, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       imageBase64: base64Image,
//       mimeType,
//     }),
//   });

//   if (!response.ok) {
//     throw new Error("Blood report analysis failed");
//   }

//   return response.json();
// };

// /* -------------------------------------------------------
//    HEALTH PREDICTION (Preventive AI)
// ------------------------------------------------------- */
// export const getHealthPrediction = async (
//   userContext: any,
//   diagnosisData?: any
// ): Promise<HealthPrediction> => {
//   const response = await fetch(`${API_BASE_URL}/api/predict`, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       userContext,
//       diagnosisData,
//     }),
//   });

//   if (!response.ok) {
//     throw new Error("Health prediction failed");
//   }

//   return response.json();
// };

// /* -------------------------------------------------------
//    HEALTH CHAT (AI ASSISTANT)
// ------------------------------------------------------- */
// export const createHealthChat = async (systemInstruction: string) => {
//   const response = await fetch(`${API_BASE_URL}/api/chat`, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       systemInstruction,
//     }),
//   });

//   if (!response.ok) {
//     throw new Error("Chat initialization failed");
//   }

//   return response.json();
// };

