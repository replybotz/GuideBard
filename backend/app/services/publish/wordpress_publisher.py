"""WordPress REST API publisher using Application Passwords."""
import json
import base64
import httpx
from app.utils.encryption import decrypt


def _get_credentials(target) -> dict:
    creds = target.credentials or {}
    if "_encrypted" in creds:
        return json.loads(decrypt(creds["_encrypted"]))
    return creds


def _auth_header(creds: dict) -> dict:
    username = creds.get("username", "")
    app_password = creds.get("app_password", "")
    token = base64.b64encode(f"{username}:{app_password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _site_url(target) -> str:
    settings = target.settings_ or {}
    url = settings.get("site_url", "").rstrip("/")
    return f"{url}/wp-json/wp/v2"


async def test_connection(target) -> tuple[bool, str]:
    """Test if WordPress credentials are valid."""
    try:
        creds = _get_credentials(target)
        base_url = _site_url(target)
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{base_url}/users/me",
                headers=_auth_header(creds),
            )
            if resp.status_code == 200:
                user = resp.json()
                return True, f"Connected as: {user.get('name', 'unknown')}"
            return False, f"Auth failed: HTTP {resp.status_code}"
    except Exception as e:
        return False, str(e)


async def publish_to_wordpress(
    target,
    title: str,
    guide=None,
    video=None,
    post_status: str = "draft",
) -> tuple[int, str]:
    """
    Publish guide and/or video to WordPress as a post.
    Returns (post_id, post_url).
    """
    creds = _get_credentials(target)
    base_url = _site_url(target)
    headers = {**_auth_header(creds), "Content-Type": "application/json"}

    # Build post content
    content_parts = []

    if video and video.file_path:
        # Embed YouTube URL if available, otherwise note it's being processed
        content_parts.append(f"<!-- wp:video --><figure class=\"wp-block-video\"><video controls src=\"{video.file_path}\"></video></figure><!-- /wp:video -->")

    if guide:
        # Add guide description
        if guide.description:
            content_parts.append(f"<!-- wp:paragraph --><p>{guide.description}</p><!-- /wp:paragraph -->")

        # Add steps
        steps = getattr(guide, "_steps_list", [])
        for i, step in enumerate(steps, 1):
            step_blocks = []
            if step.title:
                step_blocks.append(f"<!-- wp:heading {{\"level\":3}} --><h3>{i}. {step.title}</h3><!-- /wp:heading -->")
            if step.content:
                # Convert basic markdown to HTML paragraphs
                html_content = step.content.replace("\n\n", "</p><p>").replace("\n", "<br>")
                step_blocks.append(f"<!-- wp:paragraph --><p>{html_content}</p><!-- /wp:paragraph -->")
            content_parts.extend(step_blocks)

    full_content = "\n".join(content_parts)

    post_data = {
        "title": title,
        "content": full_content,
        "status": post_status,
        "format": "standard",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base_url}/posts",
            headers=headers,
            json=post_data,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"WordPress publish failed: {resp.status_code} {resp.text}")

        post = resp.json()
        return post["id"], post.get("link", "")
