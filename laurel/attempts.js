// A cap on Laurel runs per issue or PR, so a bot loop (fix, fail, fix again) stops on its own.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many earlier runs of this workflow worked on the same issue or PR in the last day. GitHub titles a run after
 * its issue or PR, so the title is the match. A skipped run (its job `if` was false) did no work and is not counted.
 */
function recentAttempts(runs, { title, selfId, now = Date.now() }) {
  const since = now - DAY_MS;
  return runs.filter((r) => r.id !== selfId &&
    r.display_title === title &&
    r.conclusion !== 'skipped' &&
    Date.parse(r.created_at) >= since).length;
}

/** The comment that says Laurel stopped, with what a person can do about it. */
function capComment(count, limit) {
  return `Laurel has run ${count} times on this in the last 24 hours, and the limit is ${limit}, so it did not ` +
    'start. Repeated runs usually mean it is stuck on something it cannot fix. Read its last comment, fix the ' +
    'blocker by hand or edit the request, then try again tomorrow, or ask an admin to raise `max_runs_per_day`.';
}

module.exports = { recentAttempts, capComment };
