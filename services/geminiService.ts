import { GoogleGenAI, Type } from "@google/genai";
import { Channel, AIResponse } from "../types";

const parseAIResponse = (response: string): AIResponse => {
    try {
        // Simple attempt to extract JSON if the model wrapped it in markdown
        const jsonMatch = response.match(/```json\n([\s\S]*)\n```/) || response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0].replace(/```json|```/g, '') : response;
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse AI response", e as any);
        return { suggestedChannels: [], reasoning: "Could not understand the AI response." };
    }
}

export const getChannelRecommendations = async (
  query: string,
  availableChannels: Channel[]
): Promise<AIResponse> => {
  if (!process.env.API_KEY) {
    return { suggestedChannels: [], reasoning: "API Key is missing." };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Create a simplified list of channels to send to the model to save tokens
  const channelListString = availableChannels
    .slice(0, 200) // Limit to 200 channels for context window safety
    .map(c => `- ${c.name} (Group: ${c.group})`)
    .join('\n');

  const prompt = `
    I am a user watching TV. I have the following list of channels available:
    
    ${channelListString}
    
    My request is: "${query}"
    
    Based on my request and the available channels, recommend up to 5 specific channel names from the list that I should watch.
    Also provide a short reasoning for why you picked them.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedChannels: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of exact channel names from the provided list"
            },
            reasoning: {
              type: Type.STRING,
              description: "Short explanation for the recommendations"
            }
          }
        }
      }
    });

    return parseAIResponse(response.text || "");

  } catch (error) {
    console.error("Gemini API Error:", error as any);
    return { suggestedChannels: [], reasoning: "Sorry, I couldn't process your request right now." };
  }
};