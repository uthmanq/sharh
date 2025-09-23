// Use consistent CommonJS syntax throughout
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config({ path: '../.env' });
const { Quiz } = require('../models/QuizModel.js');

const generateQuizFromBookObject = async (book) => {
  try {
    // Validate input
    if (!book) {
      throw new Error('Book object is required');
    }
    
    if (!book._id) {
      throw new Error('Book must have an _id');
    }

    // Extract content from book object (adjust this based on your book schema)
    const bookContent = book.content || book.text || book.description || '';
    if (!bookContent) {
      throw new Error('Book content is empty or missing');
    }

    console.log(`Generating quiz for book: ${book.title || book.name || 'Unknown Title'}`);
    console.log("API key status:", process.env.GEMINI_API_KEY ? "Found" : "Missing");
    
    // Correct SDK initialization
    const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
    
    const prompt = `
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

Book content:
"""
${bookContent}
"""
    `;

    // Correct API call
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const quizResponse = result.response.text();
    
    console.log("Raw response:", quizResponse);
    
    // Clean the response text (remove markdown code blocks if present)
    let cleanedResponse = quizResponse.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
    }
    
    // Parse the JSON string from the Gemini response with error handling
    let quizData;
    try {
      quizData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Raw response that failed to parse:', cleanedResponse);
      throw new Error('Failed to parse quiz JSON response');
    }

    // Validate the structure
    if (!quizData.questions || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      throw new Error('Invalid quiz structure: missing or empty questions array');
    }

    // Create quiz data with book reference
    const quizToSave = {
      book: book._id,
      questions: quizData.questions
    };

    // Save the new quiz to the database
    const newQuiz = new Quiz(quizToSave);
    await newQuiz.save();
    
    console.log('Quiz generated and saved successfully!');
    return newQuiz;

  } catch (error) {
    console.error('Error generating quiz:', error);
    throw new Error(`Failed to generate quiz: ${error.message}`);
  }
};

// Use CommonJS export
module.exports = { generateQuizFromBookObject };