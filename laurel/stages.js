// Laurel's staged runs. Each stage is a fresh agent (a goldfish); the issue is the elephant that carries
// state between them, as comments tagged with the stage and a hash of the issue body.

const crypto = require('crypto');
const fs = require('fs');

const DIFF_LIMIT = 60000; // characters of diff sent to the reviewer
const BLOCKED = /^BLOCKED:\s*(.+)$/m;
const DONE = /^DONE:\s*(.+)$/m;
const DONE_RULE = 'If the default branch already meets every acceptance criterion, change nothing and reply with ' +
  'one line: DONE: <the file and code that already meets them>.';

/** A short hash of the issue body. An edited issue gets a new revision, so earlier stage output stops matching. */
function issueRev(body) {
  return crypto.createHash('sha256').update((body || '').trim()).digest('hex').slice(0, 12);
}

function marker(stage, rev) {
  return `<!-- laurel:${stage} rev=${rev} -->`;
}

/** The text of the newest comment for this stage and revision, without its marker and heading, or null. */
function findStage(comments, stage, rev) {
  const tag = marker(stage, rev);
  const hit = [...comments].reverse().find((c) => c.body && c.body.startsWith(tag));
  if (!hit) return null;
  return hit.body.slice(tag.length).replace(/^\s*\*\*[^\n]*\*\*\s*/, '').trim();
}

function stageComment(stage, rev, heading, text) {
  return `${marker(stage, rev)}\n**${heading}**\n\n${text.trim()}`;
}

/** The agent's final answer from claude-code-action's execution file, or '' when there is none. */
function resultText(executionFile) {
  try {
    const lines = JSON.parse(fs.readFileSync(executionFile, 'utf8'));
    const result = lines.find((m) => m.type === 'result');
    return result && typeof result.result === 'string' ? result.result.trim() : '';
  } catch {
    return '';
  }
}

/** The reason when an agent declared the stage impossible, else null. */
function blockedReason(text) {
  const m = (text || '').match(BLOCKED);
  return m ? m[1].trim() : null;
}

/** The evidence when an agent found the issue already done, else null. */
function doneReason(text) {
  const m = (text || '').match(DONE);
  return m ? m[1].trim() : null;
}

function doneComment(evidence) {
  return `**Laurel found this already done.** ${evidence}\n\n**Next:** close this issue.`;
}

function issueBlock(issue) {
  return `Issue #${issue.number}: ${issue.title}\n\n${issue.body || ''}`;
}

const UNREACHABLE = 'a browser, screenshots, a running app, installed packages or another repository';

function planPrompt({ issue, files }) {
  return [
    issueBlock(issue),
    '',
    'Files in this repository (first 500):',
    files,
    '',
    'You are the planning stage. Read at most 8 files, only what you need to plan the smallest change ' +
      'that meets the acceptance criteria above. Do not edit anything. Reply with exactly these sections:',
    '## Files: each file to change, one per line.',
    '## Changes: for each file, the exact change, specific enough to make without further reading.',
    '## Criteria met: each acceptance criterion the change meets.',
    `## Criteria skipped: each criterion that needs ${UNREACHABLE}, and why.`,
    'If the change cannot be planned from this repository, reply with one line: BLOCKED: <reason>.',
    DONE_RULE,
  ].join('\n');
}

function buildPrompt({ issue, plan }) {
  return [
    issueBlock(issue),
    '',
    'Plan:',
    plan,
    '',
    'You are the build stage. Make exactly the change in the plan, commit it to the current branch, and stop. ' +
      'Read only the files the plan names and files they directly import. If the plan is wrong or cannot be ' +
      'followed, do not explore: reply with one line, BLOCKED: <reason>. Otherwise reply with Summary, Files ' +
      'and Assumptions sections. ' + DONE_RULE,
  ].join('\n');
}

function fixPrompt({ issue, plan, review }) {
  return [
    issueBlock(issue),
    '',
    'Plan:',
    plan,
    '',
    'Review of the committed change:',
    review,
    '',
    'You are the fix stage. Fix only the blockers and unmet criteria the review lists, commit, and stop. ' +
      'Read only the files involved. If a finding is wrong or needs ' + UNREACHABLE + ', leave it and say why. ' +
      'Reply with Summary, Files and Assumptions sections.',
  ].join('\n');
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['criteria', 'blockers'],
  properties: {
    criteria: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        required: ['criterion', 'status', 'evidence'],
        properties: {
          criterion: { type: 'string' },
          status: { type: 'string', enum: ['met', 'unmet', 'partial', 'unverifiable'] },
          evidence: { type: 'string' },
        },
      },
    },
    blockers: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
};

const REVIEW_SYSTEM = 'You review a code change against its GitHub issue. Reply with JSON only, matching the schema.';

function reviewPrompt({ issue, plan, diff }) {
  const clipped = diff.length > DIFF_LIMIT ? `${diff.slice(0, DIFF_LIMIT)}\n[diff truncated]` : diff;
  return [
    issueBlock(issue),
    '',
    'Plan:',
    plan,
    '',
    'Diff:',
    clipped,
    '',
    'Grade each acceptance criterion as met, unmet, partial, or unverifiable (needs ' + UNREACHABLE + '), ' +
      'citing the diff as evidence. List as blockers only problems that make the change wrong: a bug, or an ' +
      'unmet criterion the change could have met. Keep each entry to one sentence.',
  ].join('\n');
}

/** Problems worth one fix pass: blockers, plus criteria the change could have met but did not. */
function needsFix(review) {
  const unmet = (review.criteria || []).filter((c) => c.status === 'unmet' || c.status === 'partial');
  return (review.blockers || []).length > 0 || unmet.length > 0;
}

function formatReview(review) {
  const rows = (review.criteria || []).map((c) => `| ${c.criterion} | ${c.status} | ${c.evidence} |`);
  const table = ['| Criterion | Status | Evidence |', '|---|---|---|', ...rows].join('\n');
  const blockers = (review.blockers || []).length
    ? `\n\nBlockers:\n${review.blockers.map((b) => `- ${b}`).join('\n')}`
    : '\n\nNo blockers.';
  return table + blockers;
}

module.exports = {
  issueRev, marker, findStage, stageComment, resultText, blockedReason, doneReason, doneComment, DONE_RULE,
  planPrompt, buildPrompt, fixPrompt, reviewPrompt, REVIEW_SCHEMA, REVIEW_SYSTEM, needsFix, formatReview,
};
