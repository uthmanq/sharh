// quizService.js
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config({ path: '../.env' });
const { Quiz } = require('../models/QuizModel.js');

const generateQuizFromBookObject = async (book, bookId) => {
  try {
    // Initialize Gemini
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log("Generating quiz...", process.env.GEMINI_API_KEY ? "API key found" : "API key missing");

    // Prepare book content as a single long string
    const bookContent = book.lines
      .map((line, idx) => {
        return `Line ${idx + 1}:\nArabic: ${line.Arabic || ""}\nEnglish: ${line.English || ""}\nCommentary: ${line.commentary || ""}\nRootwords: ${line.rootwords || ""}`;
      })
      .join("\n\n");

    // Build prompt instructions
    const systemPrompt = `
You are an expert quiz creator. I will provide you with the content of a book.
Your task is to generate a JSON object representing a multiple-choice quiz about the content.
The quiz should have at least 10 questions.
Each question must have exactly 4 answer options, with only one marked as correct.
Each question must also include a 'rationale' explaining why the correct answer is right and the others are wrong.
Ensure the output is a single, valid JSON object, and do not include any other text.
The structure must follow this format:
{
  "questions": [
    {
      "questionText": "The question text goes here.",
      "options": [
        { "text": "Option A text.", "isCorrect": false },
        { "text": "Option B text.", "isCorrect": true },
        { "text": "Option C text.", "isCorrect": false },
        { "text": "Option D text.", "isCorrect": false }
      ],
      "rationale": "Explanation for the correct answer and why the others are incorrect."
    }
  ]
}
    `;

    // Call Gemini with structured contents
    const result = await genAI.models.generateContent({
      model: "gemini-1.5-flash", // or gemini-1.5-pro for bigger context
      contents: [
        {
          role: "user",
          parts: [
            { text: systemPrompt },
            { text: `Book title: ${book.title || ""}, Author: ${book.author || ""}` },
            { text: bookContent }
          ]
        }
      ]
    });

    // Extract raw text
    const quizResponse = await result.response.text();
    console.log("Raw response:", quizResponse);

    // Clean up fenced code blocks if Gemini added them
    let cleanedResponse = quizResponse.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/, "").replace(/\n?```$/, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/```\n?/, "").replace(/\n?```$/, "");
    }

    // Parse JSON
    let quizData;
    try {
      quizData = JSON.parse(cleanedResponse);
    } catch (err) {
      console.error("JSON parsing error:", err);
      console.error("Raw response that failed to parse:", cleanedResponse);
      throw new Error("Failed to parse quiz JSON response");
    }

    // Validate structure
    if (!quizData.questions || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      throw new Error("Invalid quiz structure: missing or empty questions array");
    }

    // Save to DB
    const quizToSave = {
      book: bookId,
      questions: quizData.questions
    };
    const newQuiz = new Quiz(quizToSave);
    await newQuiz.save();

    console.log("Quiz generated and saved successfully!");
    return newQuiz;

  } catch (error) {
    console.error("Error generating quiz:", error);
    throw new Error(`Failed to generate quiz: ${error.message}`);
  }
};

module.exports = { generateQuizFromBookObject };
