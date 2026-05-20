import { describe, it, expect } from 'vitest';
import { getSpecialistAgentPrompt, Discipline, DISCIPLINE_NAMES } from '../templates';

describe('Specialist Agent Prompts', () => {
  const disciplines: Discipline[] = ["EL", "ME", "FS", "P&D", "ELV", "BW"];

  it('should generate a valid prompt for each discipline', () => {
    disciplines.forEach(d => {
      const prompt = getSpecialistAgentPrompt(d);
      const name = DISCIPLINE_NAMES[d];
      
      expect(prompt).toContain(name);
      expect(prompt).toContain('Interface');
      expect(prompt).toContain('Requirement');
      expect(prompt).toContain('Glossary');
      expect(prompt).toContain('Risk');
      expect(prompt).toContain('connection point');
    });
  });

  it('should include the full list of disciplines for context', () => {
    const prompt = getSpecialistAgentPrompt("EL");
    expect(prompt).toContain("EL, ME, FS, P&D, ELV, BW");
  });
});
