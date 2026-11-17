import type { Level } from '../types.js';

/** Writing prompts per level for `eng write`. */
export const WRITING_TASKS: Record<Level, string[]> = {
  A1: [
    'Introduce yourself: your name, age, city and job or studies (4–5 sentences).',
    'Describe your family (4–5 sentences).',
    'Describe your typical day from morning to evening.',
  ],
  A2: [
    'Write about what you did last weekend.',
    'Write a short message to a friend inviting them to a trip. Say where, when and why.',
    'Describe your favourite place in your city and why you like it.',
  ],
  B1: [
    'Write about an experience that changed you. What happened and what did you learn?',
    'Write an email to a manager asking for a day off. Give a reason and suggest a solution.',
    'Should students wear uniforms? Give your opinion with two reasons.',
  ],
  B2: [
    'Is social media doing more harm than good? Write a balanced argument.',
    'Write a review of a film, book or app you used recently, with recommendations.',
    'Some people think working from home should be the norm. Discuss both views and give your opinion.',
  ],
  C1: [
    'Write a formal proposal to your company suggesting a change that would improve productivity.',
    '“Success is mostly luck.” To what extent do you agree?',
    'Write a reflective essay on how technology has changed the way people form relationships.',
  ],
};
