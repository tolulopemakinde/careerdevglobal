export const careerCoachFieldCount = 4;
export const careerCoachAnswerLimit = 2000;

export type CareerCoachSession = {
  revision: string;
  next_step: number;
  answers: string[];
  saved_goal_id: string | null;
};

export function advanceCareerCoachSession(step: number, answers: string[]) {
  if (!Number.isInteger(step) || step < 0 || step >= careerCoachFieldCount || answers.length !== careerCoachFieldCount) {
    throw new Error("Open the current coaching step before continuing.");
  }

  const cleanAnswers = answers.map(answer => answer.trim());
  if (cleanAnswers.slice(0, step + 1).some(answer => !answer)) {
    throw new Error("Add a short answer before continuing.");
  }
  if (cleanAnswers.some(answer => answer.length > careerCoachAnswerLimit)) {
    throw new Error("Keep each coaching answer within 2,000 characters.");
  }

  return { next_step: step + 1, answers: cleanAnswers };
}
