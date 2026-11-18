// The action's prompt tells the model to push and to link a PR it cannot open. The workflow does both,
// so sentences narrating either are dropped from Laurel's comment.
const PUSH_TALK = /\b(unable|cannot|can't|not able|couldn't|could not)\b[^\n]*\bpush|\bpush(es|ed|ing)?\b[^\n]*\b(blocked|denied|requires|needs|permission)\b|\b(hasn't|has not|wasn't|was not|not) been pushed\b|\bcreate (the|a) PR\b|\bPR can be created\b|\bopen (the|a) (PR|pull request)\b/i;
const EMPTY_ITEM = /^\s*[-*]\s*(\*\*[^*]+\*\*:?)?\s*$/;

function scrubLine(line) {
  if (!PUSH_TALK.test(line)) return line;
  const lead = (line.match(/^\s*[-*]\s+/) || [''])[0];
  const kept = line.slice(lead.length).split(/(?<=[.!?])\s+/).filter((s) => !PUSH_TALK.test(s)).join(' ');
  return kept ? lead + kept : '';
}

function scrubPushTalk(body) {
  return body
    .replace(/^\s*[-*] \[[ xX]\] [^\n]*\b(create|open)\b[^\n]*\b(PR|pull request)\b[^\n]*\n?/gim, '')
    .replace(/^\s*[-*] \[ \] [^\n]*\bpush\b[^\n]*\n?/gim, '')
    .split(/\n{2,}/)
    .map((p) => p.split('\n').map(scrubLine).filter((l) => l.trim() !== '' && !EMPTY_ITEM.test(l)).join('\n'))
    .filter((p) => p.trim() !== '')
    .join('\n\n');
}

module.exports = { PUSH_TALK, scrubPushTalk };