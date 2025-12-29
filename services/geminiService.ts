
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY do Gemini não foi encontrada. Verifique as variáveis de ambiente.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

function fileToGenerativePart(base64: string, mimeType: string) {
    return {
      inlineData: {
        data: base64.split(',')[1],
        mimeType
      },
    };
}

export async function analyzeImage(imageDataUrl: string): Promise<string> {
    const model = 'gemini-3-flash-preview';
    const prompt = "Analise esta imagem de uma câmera de segurança. Descreva quaisquer pessoas, animais ou objetos significativos presentes. O que está acontecendo? Seja conciso e direto.";

    try {
        const imagePart = fileToGenerativePart(imageDataUrl, 'image/jpeg');
        
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [{ text: prompt }, imagePart] },
        });

        if (response && response.text) {
            return response.text;
        } else {
            throw new Error("A resposta da API está vazia ou malformada.");
        }
    } catch (error) {
        console.error("Erro ao chamar a API Gemini:", error);
        if (error instanceof Error) {
            return `Erro na análise da IA: ${error.message}`;
        }
        return "Erro desconhecido na análise da IA.";
    }
}
