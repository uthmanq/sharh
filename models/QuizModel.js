import mongoose from 'mongoose';

const { Schema } = mongoose;

const AnswerOptionSchema = new Schema({
  text: {
    type: String,
    required: true,
  },
  isCorrect: {
    type: Boolean,
    required: true,
    default: false,
  },
});

const QuestionSchema = new Schema({
  questionText: {
    type: String,
    required: true,
  },
  options: {
    type: [AnswerOptionSchema],
    required: true,
  },
  rationale: {
    type: String,
    required: true,
  },
});

const QuizSchema = new Schema({
  book: {
    type: Schema.Types.ObjectId,
    ref: 'Book',
    required: true,
  },
  bookTitle: {
    type: String,
    required: true,
  },
  questions: {
    type: [QuestionSchema],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Quiz = mongoose.model('Quiz', QuizSchema);