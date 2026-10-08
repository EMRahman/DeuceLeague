# Simulations

Each folder is one dated simulation of a club, with its report, findings, issue drafts and request log. Newest last.

- [2026-09-30: two seasons of a club](2026-09-30-two-season-club/README.md)
- [2026-10-01: two seasons with GPT agents](2026-10-01-two-season-gpt/README.md)
- [2026-10-02: email invitations and shared-IP joining](2026-10-02-email-joining/README.md)
- [2026-10-03: two seasons with Claude agents](2026-10-03-two-season-claude/README.md)
- [2026-10-04: a 150-member club over two seasons](2026-10-04-150-member-club/README.md)
- [2026-10-07: blank-start self-signup club over two seasons](2026-10-07-self-signup-club/README.md)

## Next work

The [four work items agreed on 2 October](2026-10-01-two-season-gpt/issues.md)
cover independent score entry, coach result overrides, newcomer status, and
email invitations with required contact details and a higher per-IP joining
allowance. All four are implemented. The [3 October two-season run](2026-10-03-two-season-claude/report.md) tested them with persona agents on the real local runtime; its ranked pain points are the candidates for the next work list.

The [4 October run](2026-10-04-150-member-club/report.md) tested the work merged on 3 and 4 October at the size of a real club (150 members). Its ranked pain points, chiefly scale on the coach's Members and Results pages, mid-season withdrawal and contact details, are candidates for the next work list.

The [7 October blank-start model](2026-10-07-self-signup-club/report.md) adds a
self-signup launch and two seasons with player WhatsApp coordination. It uses
the current league engine and join validation, but its Worker/browser run was
blocked by this environment's loopback restriction; its work candidates need
live UI verification.
