"""Guide export service (PDF generation)."""
import asyncio
import base64
import re
from app.models.guide import Guide
from app.models.guide_step import GuideStep


async def generate_guide_pdf(guide: Guide, steps: list[GuideStep]) -> bytes:
    """Generate a PDF of the guide using WeasyPrint.

    Screenshots are fetched from MinIO and embedded as base64 data URIs so the
    PDF is fully self-contained and renders correctly without network access.
    """
    from weasyprint import HTML
    from app.services.storage_service import StorageService
    from app.database import AsyncSessionLocal
    from app.models.screenshot import Screenshot
    from sqlalchemy import select
    from sqlalchemy import text as sa_text

    storage = StorageService()

    # Pre-fetch all screenshot bytes async before entering the sync executor
    screenshot_b64: dict[str, str] = {}
    step_screenshot_ids = [s.screenshot_id for s in steps if s.screenshot_id]

    if step_screenshot_ids:
        async with AsyncSessionLocal() as db:
            await db.execute(
                sa_text("SET LOCAL app.current_tenant_id = :tid"),
                {"tid": str(guide.tenant_id)},
            )
            result = await db.execute(
                select(Screenshot).where(Screenshot.id.in_(step_screenshot_ids))
            )
            screenshots = {str(s.id): s for s in result.scalars().all()}

        for sid, screenshot in screenshots.items():
            if screenshot.file_path:
                try:
                    img_bytes = await storage.download_bytes("screenshots", screenshot.file_path)
                    screenshot_b64[sid] = base64.b64encode(img_bytes).decode()
                except Exception:
                    pass

    # Build HTML (sync — will be run in executor)
    def _build_and_render() -> bytes:
        steps_html = ""
        for i, step in enumerate(steps, 1):
            screenshot_html = ""
            sid = str(step.screenshot_id) if step.screenshot_id else None
            if sid and sid in screenshot_b64:
                screenshot_html = (
                    f'<img src="data:image/png;base64,{screenshot_b64[sid]}" '
                    f'alt="Step {i}" class="screenshot">'
                )

            content_html = ""
            if step.content:
                content = step.content
                content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', content)
                content = re.sub(r'\*(.+?)\*', r'<em>\1</em>', content)
                content = re.sub(r'`(.+?)`', r'<code>\1</code>', content)
                paragraphs = content.split("\n\n")
                content_html = "".join(
                    f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paragraphs if p.strip()
                )

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

        description_html = (
            f"<p class='description'>{guide.description}</p>" if guide.description else ""
        )

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
  {description_html}
  {steps_html}
</body>
</html>"""

        return HTML(string=html).write_pdf()

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _build_and_render)
