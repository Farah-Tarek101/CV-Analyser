const express = require('express');
const http = require('http');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

const STOPWORDS = new Set(
  `a an the and or but if in on at to for of as by with from up about into through during before after above below between out over under again further then once here there when where why how all both each few more most other some such no nor not only own same so than too very can will just don should now i me my we our you your he him she her it its they them their what which who this that these those am is are was were be been being have has had having do does did doing would could should ought may might must shall will`.split(
    /\s+/
  )
);

const TERM_ALIASES = new Map(
  Object.entries({
    js: 'javascript',
    ts: 'typescript',
    node: 'nodejs',
    'node.js': 'nodejs',
    reactjs: 'react',
    vuejs: 'vue',
    ai: 'artificial intelligence',
    ml: 'machine learning',
    postgresql: 'postgres',
    mongo: 'mongodb',
    gcp: 'google cloud',
    aws: 'amazon web services',
    az: 'azure',
    py: 'python',
    tf: 'tensorflow',
    scikitlearn: 'scikit learn',
    scikit: 'scikit learn',
    postman: 'api testing',
    nosql: 'mongodb',
    k8s: 'kubernetes',
    ci_cd: 'ci cd',
    cicd: 'ci cd',
    qa: 'quality assurance',
    ux: 'user experience',
    ui: 'user interface',
  })
);

const cleanText = (text) => {
  const lowered = String(text).toLowerCase().replace(/[^\w\s]/gi, ' ');
  const tokens = lowered.split(/\s+/).filter(Boolean);
  return tokens.filter((w) => w.length > 1 && !STOPWORDS.has(w));
};

const normalizeToken = (token) => {
  let normalized = token.trim().toLowerCase();
  if (normalized.endsWith('ing') && normalized.length > 5) normalized = normalized.slice(0, -3);
  else if (normalized.endsWith('ed') && normalized.length > 4) normalized = normalized.slice(0, -2);
  else if (normalized.endsWith('ies') && normalized.length > 5)
    normalized = `${normalized.slice(0, -3)}y`;
  else if (
    normalized.endsWith('s') &&
    normalized.length > 4 &&
    !/(ss|us|is|js)$/.test(normalized)
  )
    normalized = normalized.slice(0, -1);
  return TERM_ALIASES.get(normalized) || normalized;
};

const normalizeTokens = (tokens) => tokens.map(normalizeToken);

const uniqueTerms = (terms) => [...new Set(terms.filter(Boolean))];

const extractPhrases = (tokens, minN = 2, maxN = 3) => {
  const phrases = [];
  for (let n = minN; n <= maxN; n += 1) {
    for (let i = 0; i <= tokens.length - n; i += 1) {
      const chunk = tokens.slice(i, i + n);
      if (chunk.some((w) => w.length < 2)) continue;
      phrases.push(chunk.join(' '));
    }
  }
  return uniqueTerms(phrases);
};

const termCoverage = (cvTerms, weightedTermsMap) => {
  const cv = new Set(cvTerms);
  const terms = [...weightedTermsMap.keys()];
  if (!terms.length) return { score: 0, matched: [], missing: [] };
  const totalWeight = terms.reduce((sum, term) => sum + weightedTermsMap.get(term), 0);
  const matched = terms.filter((t) => cv.has(t));
  const matchedWeight = matched.reduce((sum, term) => sum + weightedTermsMap.get(term), 0);
  const missing = terms
    .filter((t) => !cv.has(t))
    .sort((a, b) => weightedTermsMap.get(b) - weightedTermsMap.get(a));
  const score = totalWeight ? Math.round((matchedWeight / totalWeight) * 1000) / 10 : 0;
  return { score, matched, missing };
};

const buildSuggestions = (score, analysis) => {
  const lines = [];
  if (score < 40) {
    lines.push(
      'Match is low: align your summary and experience bullets with the job’s required skills and outcomes.'
    );
  } else if (score < 70) {
    lines.push(
      'Solid overlap: tighten wording to mirror the job’s key terms where truthful.'
    );
  } else {
    lines.push('Strong keyword overlap: keep claims concrete and quantified.');
  }

  const requiredGaps = (analysis?.missingBySection?.requiredSkills || []).slice(0, 8);
  if (requiredGaps.length) {
    lines.push(`Focus first on missing required terms: ${requiredGaps.join(', ')}.`);
  }

  const notable = (analysis?.missingKeywords || []).filter((w) => w.length > 2).slice(0, 12);
  if (notable.length) {
    lines.push(`Additional gaps from the job description: ${notable.join(', ')}.`);
  } else {
    lines.push('No obvious term gaps detected. Next, improve achievement quality and clarity.');
  }

  lines.push(
    'Tip: ensure each must-have appears naturally in summary, skills, and measurable experience bullets (if honestly applicable).'
  );

  return lines;
};

const bucketJobDescription = (jobText) => {
  const sections = {
    required: [],
    experience: [],
    nice: [],
  };

  let current = 'required';
  const lines = String(jobText || '').split(/\r?\n/);
  for (const line of lines) {
    const l = line.toLowerCase();
    const lineText = line.trim();
    const afterColon = lineText.includes(':') ? lineText.split(':').slice(1).join(':').trim() : '';
    if (
      /\b(required|must have|requirements|minimum qualifications|qualifications)\b/.test(l)
    ) {
      current = 'required';
      if (afterColon) sections[current].push(afterColon);
      continue;
    }
    if (/\b(experience|responsibilities|what you will do|duties)\b/.test(l)) {
      current = 'experience';
      if (afterColon) sections[current].push(afterColon);
      continue;
    }
    if (/\b(nice to have|preferred|bonus|plus|good to have)\b/.test(l)) {
      current = 'nice';
      if (afterColon) sections[current].push(afterColon);
      continue;
    }
    if (line.trim()) sections[current].push(line);
  }

  // If JD has no recognizable headings, treat whole text as required.
  if (!sections.required.length && !sections.experience.length && !sections.nice.length) {
    sections.required = [jobText];
  }
  return sections;
};

const buildTermSetFromText = (text) => {
  const words = normalizeTokens(cleanText(text));
  const phrases = extractPhrases(words, 2, 3);
  return {
    words,
    phrases,
    terms: uniqueTerms([...words, ...phrases]),
  };
};

const PRIORITY_LINE_HINT =
  /\b(must|required|mandatory|minimum|strong|expert|proficient|hands[-\s]?on|need|essential)\b/i;

const accumulateTermWeights = (map, terms, weight) => {
  for (const term of terms) {
    map.set(term, (map.get(term) || 0) + weight);
  }
};

const readableTerms = (terms) =>
  terms.filter((term) => {
    const parts = term.split(/\s+/).filter(Boolean);
    return parts.length <= 2;
  });

const buildSectionTermWeights = (lines, baseWeight) => {
  const weights = new Map();
  for (const line of lines) {
    const lineTerms = buildTermSetFromText(line).terms;
    if (!lineTerms.length) continue;
    const boost = PRIORITY_LINE_HINT.test(line) ? 1.35 : 1;
    accumulateTermWeights(weights, lineTerms, baseWeight * boost);
  }
  return weights;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const scoreLabel100 = (score) => {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Moderate';
  return 'Limited';
};

const scoreLabel10 = (score) => {
  if (score >= 8.5) return 'Excellent';
  if (score >= 7) return 'Good';
  if (score >= 5.5) return 'Moderate';
  return 'Limited';
};

const countMatches = (text, regex) => (String(text).match(regex) || []).length;

const detectCvSignals = (cvText) => {
  const text = String(cvText || '');
  const lowered = text.toLowerCase();
  const lineCount = text.split(/\r?\n/).filter((l) => l.trim()).length;

  const hasSummary = /\b(summary|profile|objective)\b/.test(lowered);
  const hasSkills = /\bskills?\b/.test(lowered);
  const hasExperience = /\bexperience|employment|work history\b/.test(lowered);
  const hasEducation = /\beducation|degree|university|college\b/.test(lowered);
  const hasProjects = /\bprojects?\b/.test(lowered);

  const numberMentions = countMatches(text, /\b\d+([.,]\d+)?(%|k|m)?\b/g);
  const dateMentions = countMatches(text, /\b(19|20)\d{2}\b/g);
  const actionVerbMentions = countMatches(
    lowered,
    /\b(led|built|improved|reduced|increased|managed|designed|implemented|delivered|optimized|launched)\b/g
  );
  const measurableMentions = countMatches(
    lowered,
    /\b(increased|reduced|improved|achieved|saved|grew|boosted)\b/g
  );
  const certifications = countMatches(
    lowered,
    /\b(certified|certification|diploma|course|training|aws certified|google certified)\b/g
  );

  const sectionHits = [hasSummary, hasSkills, hasExperience, hasEducation, hasProjects].filter(Boolean)
    .length;

  return {
    lineCount,
    sectionHits,
    hasSummary,
    hasSkills,
    hasExperience,
    hasEducation,
    hasProjects,
    numberMentions,
    dateMentions,
    actionVerbMentions,
    measurableMentions,
    certifications,
  };
};

const buildNarrative = ({
  scoreBreakdown,
  missingBySection,
  matchedKeywords,
  stats,
  cvSignals,
}) => {
  const skillsScore = Math.round(
    scoreBreakdown.requiredSkills * 0.7 + scoreBreakdown.experienceTools * 0.3
  );
  const judgmentBase = scoreBreakdown.experienceTools * 0.6 + scoreBreakdown.requiredSkills * 0.4;
  const judgmentScore = Math.round(
    clamp(judgmentBase + Math.min(cvSignals.measurableMentions * 2, 12), 0, 100)
  );
  const initiativeBase = scoreBreakdown.niceToHave * 0.45 + scoreBreakdown.experienceTools * 0.35;
  const initiativeScore = Math.round(
    clamp(
      initiativeBase +
        Math.min(cvSignals.certifications * 4, 10) +
        Math.min(cvSignals.actionVerbMentions * 0.8, 8),
      0,
      100
    )
  );

  const structure = clamp(4 + cvSignals.sectionHits * 1.2, 3, 10);
  const evidenceQuality = clamp(
    4 + cvSignals.actionVerbMentions * 0.35 + cvSignals.measurableMentions * 0.5,
    3,
    10
  );
  const achievementClarity = clamp(4 + cvSignals.actionVerbMentions * 0.3, 3, 10);
  const quantification = clamp(2.5 + cvSignals.numberMentions * 0.45, 2, 10);
  const atsReadiness = clamp(
    4 +
      (cvSignals.hasSkills ? 1.2 : 0) +
      (cvSignals.hasExperience ? 1.2 : 0) +
      (cvSignals.hasEducation ? 0.8 : 0) +
      Math.min(stats.cvUniqueTermsWithPhrases / 120, 2),
    3,
    10
  );

  const presentation100 = Math.round(
    ((structure + evidenceQuality + achievementClarity + quantification + atsReadiness) / 5) * 10
  );

  const strengths = [];
  if (scoreBreakdown.requiredSkills >= 70)
    strengths.push('Strong overlap with required skills from the job description.');
  if (scoreBreakdown.experienceTools >= 65)
    strengths.push('Experience language aligns well with responsibilities and execution expectations.');
  if (cvSignals.numberMentions >= 4)
    strengths.push('CV includes quantitative evidence, which improves credibility and decision confidence.');
  if (cvSignals.sectionHits >= 4)
    strengths.push('CV has a clear structure across major sections (summary/skills/experience/education).');
  if (matchedKeywords.length)
    strengths.push(`Top aligned terms include: ${matchedKeywords.slice(0, 6).join(', ')}.`);
  if (!strengths.length)
    strengths.push('Core alignment exists; with tighter keyword targeting, match quality can improve quickly.');

  const blockers = [];
  if (missingBySection.requiredSkills.length)
    blockers.push(
      `Missing required terms: ${missingBySection.requiredSkills.slice(0, 8).join(', ')}.`
    );
  if (scoreBreakdown.experienceTools < 55)
    blockers.push('Experience bullets may not clearly show direct execution of required tasks/tools.');
  if (quantification < 5.5)
    blockers.push('Low quantification: add measurable outcomes (volumes, %, SLAs, impact) to experience bullets.');
  if (!cvSignals.hasSkills)
    blockers.push('No clearly labeled Skills section detected; ATS and recruiters may miss key competencies.');
  if (!cvSignals.hasSummary)
    blockers.push('No concise role-targeted summary detected; add a short profile aligned to this job.');
  if (!blockers.length)
    blockers.push('No major blockers detected; refine terminology and provide stronger proof points for final polish.');

  return {
    jobMatchQuality: {
      score: Math.round((skillsScore + judgmentScore + initiativeScore) / 3),
      label: scoreLabel100(Math.round((skillsScore + judgmentScore + initiativeScore) / 3)),
      dimensions: {
        skills: {
          score: skillsScore,
          title: 'Skills',
          subtitle: 'Can you do the job today?',
          description:
            'Skills measure technical qualifications and proven ability to execute role-critical work.',
        },
        judgment: {
          score: judgmentScore,
          title: 'Judgment',
          subtitle: 'Will you make good decisions?',
          description:
            'Judgment reflects decision quality, responsibility, and how clearly outcomes are demonstrated.',
        },
        initiativeAdaptability: {
          score: initiativeScore,
          title: 'Initiative & Adaptability',
          subtitle: 'Will you adapt and grow?',
          description:
            'Initiative & Adaptability measure growth signals, self-direction, and ability to evolve with role changes.',
        },
      },
      strengths: strengths.slice(0, 8),
      blockers: blockers.slice(0, 8),
    },
    cvPresentation: {
      score: presentation100,
      label: scoreLabel100(presentation100),
      breakdown: {
        structure: Math.round(structure * 10) / 10,
        evidenceQuality: Math.round(evidenceQuality * 10) / 10,
        achievementClarity: Math.round(achievementClarity * 10) / 10,
        quantification: Math.round(quantification * 10) / 10,
        atsReadiness: Math.round(atsReadiness * 10) / 10,
      },
      doingWell: strengths.slice(0, 6),
      toImprove: blockers.slice(0, 8),
    },
  };
};

const SYSTEM_PROMPT = `You are an expert recruiter and ATS evaluator.
Return ONLY valid JSON that matches the requested schema.
Do not include markdown or extra commentary.
Use balanced, realistic scoring and avoid inflated numbers.
Prioritize required skills and evidence quality.
`;

const AI_RESPONSE_SCHEMA = {
  name: 'cv_job_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      jobMatchQuality: {
        type: 'object',
        additionalProperties: false,
        properties: {
          score: { type: 'number' },
          label: { type: 'string' },
          dimensions: {
            type: 'object',
            additionalProperties: false,
            properties: {
              skills: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  score: { type: 'number' },
                  title: { type: 'string' },
                  subtitle: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['score', 'title', 'subtitle', 'description'],
              },
              judgment: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  score: { type: 'number' },
                  title: { type: 'string' },
                  subtitle: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['score', 'title', 'subtitle', 'description'],
              },
              initiativeAdaptability: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  score: { type: 'number' },
                  title: { type: 'string' },
                  subtitle: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['score', 'title', 'subtitle', 'description'],
              },
            },
            required: ['skills', 'judgment', 'initiativeAdaptability'],
          },
          strengths: { type: 'array', items: { type: 'string' } },
          blockers: { type: 'array', items: { type: 'string' } },
        },
        required: ['score', 'label', 'dimensions', 'strengths', 'blockers'],
      },
      cvPresentation: {
        type: 'object',
        additionalProperties: false,
        properties: {
          score: { type: 'number' },
          label: { type: 'string' },
          breakdown: {
            type: 'object',
            additionalProperties: false,
            properties: {
              structure: { type: 'number' },
              evidenceQuality: { type: 'number' },
              achievementClarity: { type: 'number' },
              quantification: { type: 'number' },
              atsReadiness: { type: 'number' },
            },
            required: [
              'structure',
              'evidenceQuality',
              'achievementClarity',
              'quantification',
              'atsReadiness',
            ],
          },
          doingWell: { type: 'array', items: { type: 'string' } },
          toImprove: { type: 'array', items: { type: 'string' } },
        },
        required: ['score', 'label', 'breakdown', 'doingWell', 'toImprove'],
      },
      missingKeywords: { type: 'array', items: { type: 'string' } },
      matchedKeywords: { type: 'array', items: { type: 'string' } },
    },
    required: ['jobMatchQuality', 'cvPresentation', 'missingKeywords', 'matchedKeywords'],
  },
};

const withTimeout = async (promise, ms) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('AI request timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const clampScore = (value) => Math.round(clamp(Number(value) || 0, 0, 100));
const clamp10 = (value) => Math.round(clamp(Number(value) || 0, 0, 10) * 10) / 10;

const enrichWithAi = async (cvText, jobText, baseResult) => {
  if (!OPENAI_API_KEY) return baseResult;

  const userPrompt = `
Analyze candidate CV against job description and return strict JSON.

Use this baseline engine result as context, but improve narrative quality:
${JSON.stringify(
    {
      matchScorePercent: baseResult.matchScorePercent,
      scoreBreakdown: baseResult.scoreBreakdown,
      missingBySection: baseResult.missingBySection,
      matchedKeywords: baseResult.matchedKeywords?.slice(0, 30),
    },
    null,
    2
  )}

CV:
${String(cvText).slice(0, 14000)}

JOB DESCRIPTION:
${String(jobText).slice(0, 14000)}
`;

  const request = fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: AI_RESPONSE_SCHEMA,
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  }).then((r) => r.json());

  const response = await withTimeout(request, 20000);
  const content = response?.choices?.[0]?.message?.content;
  if (!content) return baseResult;

  const ai = JSON.parse(content);
  return {
    ...baseResult,
    matchScorePercent:
      Math.round((clampScore(ai.jobMatchQuality?.score) * 0.65 + baseResult.matchScorePercent * 0.35) * 10) /
      10,
    missingKeywords: Array.isArray(ai.missingKeywords)
      ? uniqueTerms(ai.missingKeywords).slice(0, 80)
      : baseResult.missingKeywords,
    matchedKeywords: Array.isArray(ai.matchedKeywords)
      ? uniqueTerms(ai.matchedKeywords).slice(0, 80)
      : baseResult.matchedKeywords,
    jobMatchQuality: {
      ...baseResult.jobMatchQuality,
      ...(ai.jobMatchQuality || {}),
      score: clampScore(ai.jobMatchQuality?.score ?? baseResult.jobMatchQuality?.score),
      dimensions: {
        ...baseResult.jobMatchQuality.dimensions,
        ...(ai.jobMatchQuality?.dimensions || {}),
        skills: {
          ...baseResult.jobMatchQuality.dimensions.skills,
          ...(ai.jobMatchQuality?.dimensions?.skills || {}),
          score: clampScore(
            ai.jobMatchQuality?.dimensions?.skills?.score ??
              baseResult.jobMatchQuality.dimensions.skills.score
          ),
        },
        judgment: {
          ...baseResult.jobMatchQuality.dimensions.judgment,
          ...(ai.jobMatchQuality?.dimensions?.judgment || {}),
          score: clampScore(
            ai.jobMatchQuality?.dimensions?.judgment?.score ??
              baseResult.jobMatchQuality.dimensions.judgment.score
          ),
        },
        initiativeAdaptability: {
          ...baseResult.jobMatchQuality.dimensions.initiativeAdaptability,
          ...(ai.jobMatchQuality?.dimensions?.initiativeAdaptability || {}),
          score: clampScore(
            ai.jobMatchQuality?.dimensions?.initiativeAdaptability?.score ??
              baseResult.jobMatchQuality.dimensions.initiativeAdaptability.score
          ),
        },
      },
      strengths: Array.isArray(ai.jobMatchQuality?.strengths)
        ? ai.jobMatchQuality.strengths.slice(0, 8)
        : baseResult.jobMatchQuality.strengths,
      blockers: Array.isArray(ai.jobMatchQuality?.blockers)
        ? ai.jobMatchQuality.blockers.slice(0, 8)
        : baseResult.jobMatchQuality.blockers,
    },
    cvPresentation: {
      ...baseResult.cvPresentation,
      ...(ai.cvPresentation || {}),
      score: clampScore(ai.cvPresentation?.score ?? baseResult.cvPresentation.score),
      breakdown: {
        structure: clamp10(
          ai.cvPresentation?.breakdown?.structure ?? baseResult.cvPresentation.breakdown.structure
        ),
        evidenceQuality: clamp10(
          ai.cvPresentation?.breakdown?.evidenceQuality ??
            baseResult.cvPresentation.breakdown.evidenceQuality
        ),
        achievementClarity: clamp10(
          ai.cvPresentation?.breakdown?.achievementClarity ??
            baseResult.cvPresentation.breakdown.achievementClarity
        ),
        quantification: clamp10(
          ai.cvPresentation?.breakdown?.quantification ??
            baseResult.cvPresentation.breakdown.quantification
        ),
        atsReadiness: clamp10(
          ai.cvPresentation?.breakdown?.atsReadiness ?? baseResult.cvPresentation.breakdown.atsReadiness
        ),
      },
      doingWell: Array.isArray(ai.cvPresentation?.doingWell)
        ? ai.cvPresentation.doingWell.slice(0, 8)
        : baseResult.cvPresentation.doingWell,
      toImprove: Array.isArray(ai.cvPresentation?.toImprove)
        ? ai.cvPresentation.toImprove.slice(0, 8)
        : baseResult.cvPresentation.toImprove,
    },
  };
};

const analyzeMatch = (cvText, jobText) => {
  const cv = buildTermSetFromText(cvText);
  const sections = bucketJobDescription(jobText);

  const requiredWeights = buildSectionTermWeights(sections.required, 1);
  const experienceWeights = buildSectionTermWeights(sections.experience, 1);
  const niceWeights = buildSectionTermWeights(sections.nice, 1);
  const required = [...requiredWeights.keys()];
  const experience = [...experienceWeights.keys()];
  const nice = [...niceWeights.keys()];

  // Fallback: when a section is empty, leave it out of weighted sum.
  const requiredCoverage = termCoverage(cv.terms, requiredWeights);
  const experienceCoverage = termCoverage(cv.terms, experienceWeights);
  const niceCoverage = termCoverage(cv.terms, niceWeights);

  const configuredWeights = [
    { name: 'requiredSkills', value: 0.5, coverage: requiredCoverage, hasTerms: required.length > 0 },
    { name: 'experienceTools', value: 0.3, coverage: experienceCoverage, hasTerms: experience.length > 0 },
    { name: 'niceToHave', value: 0.2, coverage: niceCoverage, hasTerms: nice.length > 0 },
  ];
  const activeWeights = configuredWeights.filter((w) => w.hasTerms);
  const totalWeight = activeWeights.reduce((sum, w) => sum + w.value, 0) || 1;
  const normalized = activeWeights.map((w) => ({ ...w, normalizedWeight: w.value / totalWeight }));

  const weightedScore =
    Math.round(
      normalized.reduce((sum, w) => sum + w.coverage.score * w.normalizedWeight, 0) * 10
    ) / 10;

  const allMissing = readableTerms(
    uniqueTerms([
      ...requiredCoverage.missing,
      ...experienceCoverage.missing,
      ...niceCoverage.missing,
    ])
  );
  const allMatched = readableTerms(
    uniqueTerms([
      ...requiredCoverage.matched,
      ...experienceCoverage.matched,
      ...niceCoverage.matched,
    ])
  );
  const cvSignals = detectCvSignals(cvText);
  const narrative = buildNarrative({
    scoreBreakdown: {
      requiredSkills: requiredCoverage.score,
      experienceTools: experienceCoverage.score,
      niceToHave: niceCoverage.score,
    },
    missingBySection: {
      requiredSkills: readableTerms(requiredCoverage.missing),
      experienceTools: readableTerms(experienceCoverage.missing),
      niceToHave: readableTerms(niceCoverage.missing),
    },
    matchedKeywords: allMatched,
    stats: {
      cvUniqueTermsWithPhrases: new Set(cv.terms).size,
    },
    cvSignals,
  });

  return {
    matchScorePercent: weightedScore,
    missingKeywords: allMissing,
    matchedKeywords: allMatched.slice(0, 80),
    missingBySection: {
      requiredSkills: readableTerms(requiredCoverage.missing).slice(0, 40),
      experienceTools: readableTerms(experienceCoverage.missing).slice(0, 40),
      niceToHave: readableTerms(niceCoverage.missing).slice(0, 40),
    },
    jobMatchQuality: narrative.jobMatchQuality,
    cvPresentation: narrative.cvPresentation,
    scoreBreakdown: {
      requiredSkills: requiredCoverage.score,
      experienceTools: experienceCoverage.score,
      niceToHave: niceCoverage.score,
      weights: normalized.reduce((acc, w) => {
        acc[w.name] = w.normalizedWeight;
        return acc;
      }, {}),
    },
    stats: {
      cvTokenCount: cv.words.length,
      cvUniqueTerms: new Set(cv.words).size,
      cvUniqueTermsWithPhrases: new Set(cv.terms).size,
      jobUniqueTermsWithPhrases: new Set(uniqueTerms([...required, ...experience, ...nice])).size,
      matchedTerms: allMatched.length,
      missingTerms: allMissing.length,
      cvSignalSummary: scoreLabel10(
        (narrative.cvPresentation.breakdown.structure +
          narrative.cvPresentation.breakdown.evidenceQuality +
          narrative.cvPresentation.breakdown.achievementClarity +
          narrative.cvPresentation.breakdown.quantification +
          narrative.cvPresentation.breakdown.atsReadiness) /
          5
      ),
    },
  };
};

async function extractCvText(file) {
  if (!file) return '';
  const ext = path.extname(file.originalname || '').toLowerCase();
  const buf = fs.readFileSync(file.path);
  try {
    if (ext === '.pdf') {
      const data = await pdfParse(buf);
      return data.text || '';
    }
    return buf.toString('utf8');
  } finally {
    fs.unlink(file.path, () => {});
  }
}

const app = express();
const preferredPort = process.env.PORT ? Number(process.env.PORT) : 3001;
const portLocked = Boolean(process.env.PORT);

const apiPortFile = path.join(__dirname, '..', '.api-port');

function writeApiPort(port) {
  try {
    fs.writeFileSync(apiPortFile, String(port), 'utf8');
  } catch {
    /* ignore */
  }
}

function startServer() {
  if (portLocked) {
    const server = http.createServer(app);
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `Port ${preferredPort} is already in use. Stop the other process or choose another PORT.`
        );
        process.exit(1);
      }
      throw err;
    });
    server.listen(preferredPort, () => {
      writeApiPort(preferredPort);
      console.log(`CV analyzer API http://localhost:${preferredPort}`);
    });
    return;
  }

  let port = preferredPort;
  const maxPort = preferredPort + 40;

  const tryListen = () => {
    const server = http.createServer(app);
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && port < maxPort) {
        port += 1;
        tryListen();
        return;
      }
      console.error(err);
      process.exit(1);
    });
    server.listen(port, () => {
      writeApiPort(port);
      console.log(`CV analyzer API http://localhost:${port}`);
      if (port !== preferredPort) {
        console.log(
          'Another process was using the default port. Restart Vite (npm run dev) so the proxy reads .api-port, or set VITE_API_TARGET in client/.env'
        );
      }
    });
  };

  tryListen();
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.post('/upload', upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Field name: cv' });
    }
    const text = await extractCvText(req.file);
    return res.json({ ok: true, charCount: text.length, preview: text.slice(0, 500) });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Upload failed' });
  }
});

app.post('/api/analyze', upload.single('cv'), async (req, res) => {
  try {
    const jobDescription = req.body.jobDescription || '';
    let cvRaw = req.body.cvText || '';

    if (req.file) {
      cvRaw = await extractCvText(req.file);
    }

    if (!String(jobDescription).trim()) {
      return res.status(400).json({ error: 'jobDescription is required' });
    }
    if (!String(cvRaw).trim()) {
      return res
        .status(400)
        .json({ error: 'Provide a CV file (PDF or .txt) or paste cvText in the form.' });
    }

    const baseResult = analyzeMatch(cvRaw, jobDescription);
    const result = await enrichWithAi(cvRaw, jobDescription, baseResult).catch(() => baseResult);
    const suggestions = buildSuggestions(result.matchScorePercent, result);

    return res.json({
      matchScorePercent: result.matchScorePercent,
      missingKeywords: result.missingKeywords.slice(0, 80),
      matchedKeywords: result.matchedKeywords,
      missingBySection: result.missingBySection,
      jobMatchQuality: result.jobMatchQuality,
      cvPresentation: result.cvPresentation,
      suggestions,
      scoreBreakdown: result.scoreBreakdown,
      stats: {
        ...result.stats,
        analysisEngine: OPENAI_API_KEY ? 'hybrid_ai' : 'rule_based',
        aiModel: OPENAI_API_KEY ? AI_MODEL : null,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Analyze failed' });
  }
});

app.post('/api/analyze-json', async (req, res) => {
  try {
    const { cvText, jobDescription } = req.body || {};
    if (!String(jobDescription || '').trim()) {
      return res.status(400).json({ error: 'jobDescription is required' });
    }
    if (!String(cvText || '').trim()) {
      return res.status(400).json({ error: 'cvText is required' });
    }
    const baseResult = analyzeMatch(cvText, jobDescription);
    const result = await enrichWithAi(cvText, jobDescription, baseResult).catch(() => baseResult);
    const suggestions = buildSuggestions(result.matchScorePercent, result);
    return res.json({
      matchScorePercent: result.matchScorePercent,
      missingKeywords: result.missingKeywords.slice(0, 80),
      matchedKeywords: result.matchedKeywords,
      missingBySection: result.missingBySection,
      jobMatchQuality: result.jobMatchQuality,
      cvPresentation: result.cvPresentation,
      suggestions,
      scoreBreakdown: result.scoreBreakdown,
      stats: {
        ...result.stats,
        analysisEngine: OPENAI_API_KEY ? 'hybrid_ai' : 'rule_based',
        aiModel: OPENAI_API_KEY ? AI_MODEL : null,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Analyze failed' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

startServer();
