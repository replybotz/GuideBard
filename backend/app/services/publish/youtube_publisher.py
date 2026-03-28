"""YouTube Data API v3 publisher."""
import json
from app.utils.encryption import decrypt


def _get_credentials(target) -> dict:
    """Decrypt and return target credentials."""
    creds = target.credentials or {}
    if "_encrypted" in creds:
        return json.loads(decrypt(creds["_encrypted"]))
    return creds


async def upload_to_youtube(
    target,
    video_path: str,
    title: str,
    description: str = "",
    tags: list[str] | None = None,
    privacy_status: str = "private",
) -> tuple[str, str]:
    """
    Upload a video to YouTube using the Data API v3 resumable upload.
    Returns (video_id, video_url).
    """
    import asyncio
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from google.oauth2.credentials import Credentials

    creds_data = _get_credentials(target)
    credentials = Credentials(
        token=creds_data.get("access_token"),
        refresh_token=creds_data.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=creds_data.get("client_id"),
        client_secret=creds_data.get("client_secret"),
    )

    def _upload():
        youtube = build("youtube", "v3", credentials=credentials)
        body = {
            "snippet": {
                "title": title[:100],
                "description": description[:5000],
                "tags": tags or [],
                "categoryId": "27",  # Education
            },
            "status": {
                "privacyStatus": privacy_status,
                "selfDeclaredMadeForKids": False,
            },
        }
        media = MediaFileUpload(video_path, mimetype="video/mp4", resumable=True, chunksize=5 * 1024 * 1024)
        request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

        response = None
        while response is None:
            status, response = request.next_chunk()

        video_id = response["id"]
        return video_id, f"https://www.youtube.com/watch?v={video_id}"

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _upload)


def get_oauth_url(client_id: str, redirect_uri: str) -> str:
    """Generate YouTube OAuth2 authorization URL."""
    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(
        {"web": {"client_id": client_id, "client_secret": "", "redirect_uris": [redirect_uri], "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token"}},
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
        redirect_uri=redirect_uri,
    )
    auth_url, _ = flow.authorization_url(access_type="offline", include_granted_scopes="true")
    return auth_url
