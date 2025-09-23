const { GoogleGenAI } = require('@google/genai');
require('dotenv').config({ path: '../.env' });
const { Quiz } = require('../models/QuizModel.js');

console.log(process.env.GEMINI_API_KEY);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const generateQuizFromBook = async (bookContent, bookId, bookTitle) => {
  try {
    console.log("generating...",process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

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
          // ... more questions
        ]
      }
      
      Book content:
      """
      ${bookContent}
      """
      `;

    const result = await model.generateContent(prompt);
    const quizResponse = result.response.text();
    
    // Parse the JSON string from the Gemini response
    const quizData = JSON.parse(quizResponse);

    // Create quiz data with book reference
    const quizToSave = {
      book: bookId,
      bookTitle: bookTitle,
      questions: quizData.questions
    };

    // Save the new quiz to the database
    const newQuiz = new Quiz(quizToSave);
    await newQuiz.save();
    
    console.log('Quiz generated and saved successfully!');
    return newQuiz;

  } catch (error) {
    console.error('Error generating quiz:', error);
    throw new Error('Failed to generate quiz.');
  }
};

// Alternative function that accepts a book object directly
const generateQuizFromBookObject = async (book) => {
  try {
    // Extract book content from the book object
    // Assuming the content is in the 'lines' array
    const bookContent = book.lines.map(line => 
      `${line.Arabic || ''} ${line.English || ''} ${line.commentary || ''}`
    ).join('\n');

    return await generateQuizFromBook(bookContent, book._id, book.title);
  } catch (error) {
    console.error('Error generating quiz from book object:', error);
    throw new Error('Failed to generate quiz from book object.');
  }
};

module.exports = { 
  generateQuizFromBook, 
  generateQuizFromBookObject 
};