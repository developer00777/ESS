#!/usr/bin/env python3
"""
Renders docs/leave-and-attendance-policy.md to "leave polcies.pdf".

The PDF is the artefact HR uploads and the LLM extractor reads, but the markdown
is the source of truth — editing the PDF directly would leave the two to drift.
Run this after changing the policy text.

    python3 scripts/build-policy-pdf.py

Deliberately a small subset of markdown: headings, bullets, bold and paragraphs
are all the policy document uses, and a full markdown engine would be a
dependency for no gain.
"""

import html
import re
import sys
from pathlib import Path

from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "leave-and-attendance-policy.md"
TARGET = ROOT / "leave polcies.pdf"


def inline(text: str) -> str:
    """Markdown emphasis to ReportLab markup, escaping everything else."""
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"`(.+?)`", r"<font face='Courier'>\1</font>", text)
    return text


def build() -> None:
    if not SOURCE.exists():
        sys.exit(f"missing source: {SOURCE}")

    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body", parent=styles["Normal"], fontSize=9.5, leading=14, spaceAfter=7, alignment=TA_LEFT
    )
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=17, leading=21, spaceAfter=10)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, leading=17, spaceBefore=14, spaceAfter=8)
    h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontSize=11, leading=15, spaceBefore=11, spaceAfter=6)

    flow = []
    bullets: list[str] = []

    def flush_bullets() -> None:
        if not bullets:
            return
        flow.append(
            ListFlowable(
                [ListItem(Paragraph(inline(b), body), leftIndent=12) for b in bullets],
                bulletType="bullet",
                start="•",
                leftIndent=14,
            )
        )
        bullets.clear()

    for raw in SOURCE.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()

        if line.startswith("- ") or line.startswith("* "):
            bullets.append(line[2:].strip())
            continue
        flush_bullets()

        if not line or line == "---":
            continue
        if line.startswith("### "):
            flow.append(Paragraph(inline(line[4:]), h3))
        elif line.startswith("## "):
            flow.append(Paragraph(inline(line[3:]), h2))
        elif line.startswith("# "):
            flow.append(Paragraph(inline(line[2:]), h1))
        else:
            flow.append(Paragraph(inline(line), body))

    flush_bullets()

    SimpleDocTemplate(
        str(TARGET),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title="Leave & Attendance Policy",
    ).build(flow)

    print(f"wrote {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
