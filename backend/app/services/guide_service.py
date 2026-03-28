"""Guide export service (PDF generation)."""
import asyncio
from app.models.guide import Guide
from app.models.guide_step import GuideStep


async def generate_guide_pdf(guide: Guide, steps: list[GuideStep]) -> bytes:
    """Generate a PDF of the guide using WeasyPrint."""
    from weasyprint import HTML, CSS

    # Build HTML
    steps_html = ""
    for i, step in enumerate(steps, 1):
        screenshot_html = ""
        if step.screenshot_id and step.file_path_cache:
            screenshot_html = f'<img src="{step.file_path_cache}" alt="Step {i}" class="screenshot">'

        content_html = ""
        if step.content:
            import re
            # Basic Markdown to HTML (bold, italic, code)
            content = step.content
            content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', content)
            content = re.sub(r'\*(.+?)\*', r'<em>\1</em>', content)
            content = re.sub(r'`(.+?)`', r'<code>\1</code>', content)
            paragraphs = content.split("\n\n")
            content_html = "".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paragraphs if p.strip())

        steps_html += f"""
        <div class="step">
            <div class="step-number">{i}</div>
            <div class="step-content">
                <h3>{step.title or f"Step {i}"}</h3>
                {content_html}
                {screenshot_html}
            </div>
        </div>
        """

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{guide.title}</title>
<style>
  body {{ font-family: -apple-system, Arial, sans-serif; margin: 40px; color: #1a1a1a; line-height: 1.6; }}
  h1 {{ font-size: 28px; color: #111; margin-bottom: 8px; }}
  .description {{ color: #555; font-size: 16px; margin-bottom: 40px; }}
  .step {{ display: flex; gap: 20px; margin-bottom: 32px; padding-bottom: 32px; border-bottom: 1px solid #e5e7eb; }}
  .step-number {{ font-size: 24px; font-weight: 700; color: #6366f1; min-width: 36px; }}
  .step-content h3 {{ margin: 0 0 8px; font-size: 18px; }}
  .step-content p {{ margin: 4px 0; color: #374151; }}
  .screenshot {{ max-width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 12px; }}
  code {{ background: #f3f4f6; padding: 2px 4px; border-radius: 3px; font-family: monospace; }}
</style>
</head>
<body>
  <h1>{guide.title}</h1>
  {"<p class='description'>" + guide.description + "</p>" if guide.description else ""}
  {steps_html}
</body>
</html>"""

    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(
        None,
        lambda: HTML(string=html).write_pdf(),
    )
    return pdf_bytes
