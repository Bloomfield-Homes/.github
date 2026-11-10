// Failed-check context for a /laurel comment that links an Actions run or job, so the agent sees the failure.

const RUN_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/g;

// Lines that name a failure in Vitest, Jest, RSpec and Actions annotation output.
const FAILURE_LINE = /##\[error\]|\bFAIL\b|×|✗|AssertionError|Failure\/Error|\bError:|rspec \.\/|❯ /;

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

const MAX_REFS = 3;
const MAX_JOBS = 3;
const CONTEXT_LINES = 3;
const MAX_LINES = 150;
const MAX_CHARS = 15000;

/** Run and job ids from every Actions URL in the text, in order, each once. */
function findRunRefs(text) {
  const refs = [];
  const seen = new Set();
  for (const m of (text || '').matchAll(RUN_URL)) {
    const ref = { owner: m[1], repo: m[2], runId: Number(m[3]), jobId: m[4] ? Number(m[4]) : null };
    const key = `${ref.owner}/${ref.repo}/${ref.runId}/${ref.jobId}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

/** Each failure line of a job log and the lines after it, without timestamps or colour codes. */
function failureExcerpt(log) {
  const lines = (log || '').split('\n').map((l) => l.replace(TIMESTAMP, '').replace(ANSI, '').trimEnd());
  const keep = new Set();
  lines.forEach((line, i) => {
    if (!FAILURE_LINE.test(line)) return;
    for (let j = i; j <= Math.min(i + CONTEXT_LINES, lines.length - 1); j += 1) keep.add(j);
  });
  const picked = [...keep].sort((a, b) => a - b).slice(0, MAX_LINES).map((i) => lines[i]);
  return picked.join('\n').slice(0, MAX_CHARS);
}

// The job log endpoint redirects to plain text, which Octokit may hand back as an ArrayBuffer.
function asText(data) {
  return typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
}

async function failedJobs({ github, owner, repo, ref }) {
  if (ref.jobId) {
    const { data } = await github.rest.actions.getJobForWorkflowRun({ owner, repo, job_id: ref.jobId });
    return [data];
  }
  const { data } = await github.rest.actions.listJobsForWorkflowRun({
    owner, repo, run_id: ref.runId, filter: 'latest', per_page: 100,
  });
  return data.jobs.filter((job) => job.conclusion === 'failure').slice(0, MAX_JOBS);
}

/** Markdown with an excerpt per failed job the comment links in this repo, or '' when there are none. */
async function checkLogContext({ github, owner, repo, body, log }) {
  const sameRepo = (ref) =>
    ref.owner.toLowerCase() === owner.toLowerCase() && ref.repo.toLowerCase() === repo.toLowerCase();
  const refs = findRunRefs(body).filter(sameRepo).slice(0, MAX_REFS);
  const sections = [];
  for (const ref of refs) {
    try {
      for (const job of await failedJobs({ github, owner, repo, ref })) {
        const { data } = await github.rest.actions.downloadJobLogsForWorkflowRun({ owner, repo, job_id: job.id });
        const excerpt = failureExcerpt(asText(data));
        if (excerpt) sections.push(`## ${job.name} (job ${job.id})\n\n\`\`\`\n${excerpt}\n\`\`\``);
      }
    } catch (e) {
      log.warning(`Could not read the log for run ${ref.runId}: ${e.message}`);
    }
  }
  if (!sections.length) return '';
  return `# Failing check logs\n\nFailure lines from the runs the request links.\n\n${sections.join('\n\n')}\n`;
}

module.exports = { findRunRefs, failureExcerpt, checkLogContext };
