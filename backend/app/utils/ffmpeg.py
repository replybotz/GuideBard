"""FFmpeg subprocess helpers."""
import asyncio
import subprocess
import os
from pathlib import Path
from app.config import settings


async def run_ffmpeg(*args: str) -> tuple[int, str, str]:
    """Run an ffmpeg command asynchronously. Returns (returncode, stdout, stderr)."""
    cmd = ["ffmpeg", "-y", *args]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode(), stderr.decode()


async def concat_chunks(chunk_paths: list[str], output_path: str) -> str:
    """Concatenate WebM video chunks into a single file."""
    concat_file = output_path + ".concat.txt"
    with open(concat_file, "w") as f:
        for path in sorted(chunk_paths):
            f.write(f"file '{path}'\n")
    rc, _, stderr = await run_ffmpeg(
        "-f", "concat", "-safe", "0",
        "-i", concat_file,
        "-c", "copy",
        output_path,
    )
    os.unlink(concat_file)
    if rc != 0:
        raise RuntimeError(f"FFmpeg concat failed: {stderr}")
    return output_path


async def transcode_to_mp4(input_path: str, output_path: str) -> str:
    """Transcode any input video to H.264/AAC MP4."""
    rc, _, stderr = await run_ffmpeg(
        "-i", input_path,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "-threads", str(settings.ffmpeg_threads),
        output_path,
    )
    if rc != 0:
        raise RuntimeError(f"FFmpeg transcode failed: {stderr}")
    return output_path


async def extract_thumbnail(video_path: str, output_path: str, time_seconds: float = 1.0) -> str:
    """Extract a single frame as a JPEG thumbnail."""
    rc, _, stderr = await run_ffmpeg(
        "-ss", str(time_seconds),
        "-i", video_path,
        "-vframes", "1",
        "-q:v", "2",
        output_path,
    )
    if rc != 0:
        raise RuntimeError(f"FFmpeg thumbnail failed: {stderr}")
    return output_path


async def get_video_info(video_path: str) -> dict:
    """Return duration_ms, width, height, fps using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_streams", "-show_format",
        video_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    import json
    data = json.loads(stdout.decode())
    video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    duration = float(data.get("format", {}).get("duration", 0))
    fps_str = video_stream.get("r_frame_rate", "30/1")
    num, den = fps_str.split("/")
    fps = round(int(num) / int(den))
    return {
        "duration_ms": int(duration * 1000),
        "width": video_stream.get("width"),
        "height": video_stream.get("height"),
        "fps": fps,
    }


async def compose_video(
    recording_path: str,
    audio_path: str,
    output_path: str,
    trim_start_ms: int = 0,
    trim_end_ms: int | None = None,
    captions: list | None = None,
    width: int = 1920,
    height: int = 1080,
) -> str:
    """
    Compose final video: trim recording, overlay audio, burn-in captions.
    Produces H.264/AAC MP4.
    """
    args = []

    # Input: video (with optional trim)
    if trim_start_ms > 0:
        args += ["-ss", str(trim_start_ms / 1000)]
    args += ["-i", recording_path]

    # Input: audio
    args += ["-i", audio_path]

    # Map video from first input, audio from second
    args += ["-map", "0:v:0", "-map", "1:a:0"]

    # Duration limit from trim
    if trim_end_ms is not None:
        duration_s = (trim_end_ms - trim_start_ms) / 1000
        args += ["-t", str(duration_s)]

    # Caption filter (SRT-style burn-in)
    vf_filters = []
    if captions:
        srt_path = output_path + ".srt"
        _write_srt(captions, srt_path)
        vf_filters.append(f"subtitles={srt_path}:force_style='FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2'")

    if vf_filters:
        args += ["-vf", ",".join(vf_filters)]

    args += [
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-shortest",
        "-movflags", "+faststart",
        "-threads", str(settings.ffmpeg_threads),
        output_path,
    ]

    rc, _, stderr = await run_ffmpeg(*args)
    if rc != 0:
        raise RuntimeError(f"FFmpeg compose failed: {stderr}")
    return output_path


def _write_srt(captions: list, path: str):
    """Write captions list [{start_ms, end_ms, text}] as an SRT file."""
    def ms_to_srt_time(ms: int) -> str:
        h = ms // 3600000
        m = (ms % 3600000) // 60000
        s = (ms % 60000) // 1000
        ms_r = ms % 1000
        return f"{h:02d}:{m:02d}:{s:02d},{ms_r:03d}"

    with open(path, "w", encoding="utf-8") as f:
        for i, cap in enumerate(captions, 1):
            f.write(f"{i}\n")
            f.write(f"{ms_to_srt_time(cap['start_ms'])} --> {ms_to_srt_time(cap['end_ms'])}\n")
            f.write(f"{cap['text']}\n\n")
