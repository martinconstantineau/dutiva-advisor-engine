/// <reference types="vitest/globals" />
/**
 * Precision regression tests for the deterministic safety/routing layer.
 *
 * Two classes of false positive were short-circuiting legitimate HR questions:
 *
 *  1. classifySensitiveInput() flagged any bare weapon noun (gun/knife/weapon)
 *     as a CRISIS, sending benign questions to the self-harm hotline response
 *     with zero HR guidance. The fix requires explicit violence intent.
 *
 *  2. routeAdvisorMessage() treated bare topical words ("sport", "game") as
 *     out-of-scope even when the message carried clear workplace/HR context.
 *
 * Both fixes must NOT reduce genuine-crisis recall — the recall cases below
 * assert that self-harm and credible threats are still classified as crisis.
 */
import { classifySensitiveInput } from '../safety/classifySensitiveInput';
import { routeAdvisorMessage } from '../core/routeAdvisorMessage';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

function makeCtx(userMessage: string): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: 'test-session',
    userMessage,
    history: [],
    locale: 'en',
    province: null,
    employerProvince: null,
    remoteWork: false,
    mode: 'hr_compliance',
    isFederallyRegulated: null,
    unionized: null,
    enableRetrieval: true,
    enableWorkspacePayload: true,
    enableDrafting: true,
    includeDebug: false,
  });
}

describe('classifySensitiveInput — weapon-noun false positives are fixed', () => {
  const benign = [
    'Is a nail gun regulated under workplace safety standards for our warehouse staff?',
    'An employee cut themselves with a knife while prepping food in the kitchen, is this a workers comp claim?',
    'What is our policy on weapons in the workplace?',
    'Do we need to report a workplace injury from a box knife to the safety committee?',
  ];

  for (const msg of benign) {
    it(`does not classify as crisis: "${msg.slice(0, 48)}…"`, () => {
      expect(classifySensitiveInput(msg).level).not.toBe('crisis');
    });
  }
});

describe('classifySensitiveInput — genuine-crisis recall is preserved', () => {
  const crises = [
    'I want to kill myself',
    'I want to hurt myself because of what happened at work',
    "I don't want to live anymore",
    'I am going to hurt someone',
    'He brought a gun to work and is going to shoot everyone',
    'An employee threatened a coworker with a knife',
    "I'm going to stab my manager",
  ];

  for (const msg of crises) {
    it(`still classifies as crisis: "${msg.slice(0, 48)}…"`, () => {
      expect(classifySensitiveInput(msg).level).toBe('crisis');
    });
  }
});

describe('routeAdvisorMessage — out-of-scope false positives are fixed', () => {
  it('does not redirect an HR liability question mentioning "sport"', () => {
    const route = routeAdvisorMessage(
      makeCtx('An employee was injured playing a sport at our company event, do we have liability?'),
    );
    expect(route.intent).not.toBe('out_of_scope');
  });

  it('does not redirect an HR question mentioning "game" at the office', () => {
    const route = routeAdvisorMessage(
      makeCtx('We have a game-like fantasy football pool at the office that is distracting employees, is this a problem?'),
    );
    expect(route.intent).not.toBe('out_of_scope');
  });

  it('still routes genuinely off-topic questions to out_of_scope', () => {
    expect(routeAdvisorMessage(makeCtx('How do I make pasta carbonara?')).intent).toBe('out_of_scope');
    expect(routeAdvisorMessage(makeCtx('What is the weather like today?')).intent).toBe('out_of_scope');
  });
});
