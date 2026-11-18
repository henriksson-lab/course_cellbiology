# Design principles

These rules govern how we build course material in this repository. Check every
new lecture, quiz and question set against them. Adapted from the 3MB00A course
(`../quantbio-3MB00A/designprinciples.md`); this course has no programming.

See [audience.md](audience.md) for who we design for, [elo.md](elo.md) for what
we teach and [courseplan.md](courseplan.md) for the formal syllabus.

## 1. Self-contained: the book is optional

A student who never opens *Molecular Biology of the Cell* must still be able to
follow every lecture and pass the exam. Each lecture may end with an optional
"Read more" line naming book chapters, but no slide may say "see the book" for
something we need.

## 2. Pictures carry the explanation

**At least 50 % of content slides have an explanatory picture**: a diagram we
draw (SVG) or a real image (micrograph, structure, time-lapse frame, clinical
image). Cell biology is spatial; prefer a picture to a bullet list whenever the
point is *where* something is, *which way* it moves, or *what it looks like*.

- **Mix diagrams and real images.** A diagram explains the mechanism; a real
  micrograph shows students that the diagram is about something real. Aim for at
  least two real images per lecture.
- **Licensing:** the site is public. Use only material we may reuse: our own SVGs,
  CC0, CC BY or CC BY-SA images (e.g. Wikimedia Commons, Cell Image Library, Human
  Protein Atlas, RCSB PDB / Mol* renderings, EMDB, Servier Medical Art, NIH/NIGMS
  image gallery, OpenOrganelle, Allen Cell Explorer: check each source's terms).
  **Never copy figures from MBoC or other textbooks.** Record every external image
  in the unit's `credits.md` (source URL, author, licence).
- Run the figure QA checklist (`plan/figure-qa-checklist.md`) on every SVG.

## 3. One lecture ≈ 45 minutes

A deck is recorded or given as a ~45-minute lecture: **15–19 content slides**,
with 19 as a ceiling, not a target. If a topic needs more, split it into two
units rather than cutting good material, as in 3MB00A.

## 4. Every lecture has the same skeleton

1. **About this lecture**: what you will be able to explain, and which ELO(s).
2. **The question**: a biological puzzle or observation that motivates the topic.
3. Content slides, including at least one **"How do we know?"** method slide.
4. **Why it matters**: one or two slides on a drug, drug-delivery technology or
   disease that depends on this lecture's content. Name the molecular target and
   connect it to a slide earlier in the lecture. Point forward to the later
   programme course where it returns (Sjukdomslära, Immunologi, Kliniska
   prövningar och läkemedelsutveckling).
5. **Summary**: 3–5 take-home points, matched to the ELO wording.

Speaker notes (`::: notes`) on every slide, as in 3MB00A.

## 5. Build on what they know; do not re-teach it

Students have had biochemistry, the central dogma, gene regulation, chemistry
(ΔG, equilibria) and genetics. Use **one recap slide** at most when a lecture
needs it, labelled as recap. Use their chemistry where it pays (Nernst, K_d,
dose–response) without deriving it again.

## 6. Mechanism before names

Lead with what the machine does and why, then name the parts. Keep the number of
protein names per slide small; a name that does not come back later in the
course probably does not belong on a slide.

## 7. Practice per ELO, at G and VG level

The exam passes each ELO separately. Every quiz and study question is tagged with
its ELO. Every lecture's study questions include at least one VG-style question:
predict, compare, explain an unexpected result, or design an experiment.

## 8. Honest about simplification

When a slide simplifies (one pathway out of a network, a cartoon organelle), say
so in a word, and say where the fuller picture comes, if it comes in this
programme.
