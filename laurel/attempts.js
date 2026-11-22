// A cap on Laurel runs per issue or PR, so a bot loop (fix, fail, fix again) stops on its own.

const DAY_MS = 24 * 60 * 60 * 1000;
/** The workflow step a run reaches only when the cap let it start. Only runs that reached it count. */
const STARTED_STEP = 'Laurel started';

/**
 * Earlier runs of this workflow on the same issue or PR in the last day. GitHub titles a run after its issue or
 * PR, so the title is the match. A skipped run (its job `if` was false) did no work and is left out.
 */
function candidateRuns(runs, { title, selfId, now = Date.now() }) {
  const since = now - DAY_MS;
  return runs.filter((r) => r.id !== selfId &&
    r.display_title === title &&
    r.conclusion !== 'skipped' &&
    Date.parse(r.created_at) >= since);
}

/** Whether a run got past the cap, from its jobs. A run the cap refused never reaches STARTED_STEP. */
function startedRun(jobs) {
  return jobs.some((j) => (j.steps || []).some((s) => s.name === STARTED_STEP && s.conclusion === 'success'));
}

/** The comment that says Laurel stopped, with what a person can do about it. */
function capComment(count, limit) {
  return `Laurel has run ${count} times on this in the last 24 hours, and the limit is ${limit}, so it did not ` +
    'start. Repeated runs usually mean it is stuck on something it cannot fix. Read its last comment, fix the ' +
    'blocker by hand or edit the request, then try again tomorrow, or ask an admin to raise `max_runs_per_day`.';
}

module.exports = { STARTED_STEP, candidateRuns, startedRun, capComment };
