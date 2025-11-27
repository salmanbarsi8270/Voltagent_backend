import { Tool } from "@voltagent/core";
import { z } from "zod";

export const weatherTool = new Tool({
  name: "getWeather",
  description: "Fetch current weather using WeatherAPI.com",
  parameters: z.object({
    city: z.string().describe("City name to fetch weather for")
  }),

  async execute({ city }) {
    const API_KEY = process.env.WEATHER_API_KEY!;
    const url = `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${city}&aqi=yes`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Failed to fetch weather data");
    }

    const data = await res.json();
    return data;
  }
});
