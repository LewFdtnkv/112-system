"""Shared byte limit for uploaded files, including chunked requests."""

from collections.abc import AsyncIterator

from fastapi import HTTPException

MAX_UPLOAD_BYTES = 1024 * 1024


async def read_upload(chunks: AsyncIterator[bytes]) -> bytes:
    content = bytearray()
    async for chunk in chunks:
        # Check before copying: an oversized chunk must not grow our buffer.
        if len(content) + len(chunk) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "File must not exceed 1 MiB")
        content.extend(chunk)
    return bytes(content)
