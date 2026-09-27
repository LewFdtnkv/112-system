from collections.abc import AsyncIterator
from io import BytesIO
from uuid import UUID

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.uploads import read_upload
from app.models import User, UserActivity, UserPhoto


def normalize_photo(content):
    try:
        with Image.open(BytesIO(content)) as image:
            if image.format not in ("JPEG", "PNG") or image.width * image.height > 16_000_000:
                raise ValueError()
            # Pillow.verify stops at IEND without reading its checksum.
            if image.format == "PNG" and not content.endswith(b"\x00\x00\x00\x00IEND\xaeB`\x82"):
                raise ValueError()
            image.verify()
        # Verification checks PNG checksums and completeness; decoding alone does not.
        with Image.open(BytesIO(content)) as image:
            image.load()
            image.thumbnail((512, 512))
            output = BytesIO()
            image.convert("RGB").save(output, format="JPEG", quality=85)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise HTTPException(422, "Choose a valid PNG or JPEG photo up to 16 megapixels") from None


async def save_photo(
    session: AsyncSession, user_id: UUID, actor_id: UUID, chunks: AsyncIterator[bytes]
):
    if await session.get(User, user_id) is None:
        raise HTTPException(404, "User not found")
    content = await read_upload(chunks)
    normalized = await run_in_threadpool(normalize_photo, content)
    from sqlalchemy.dialects.postgresql import insert

    await session.execute(
        insert(UserPhoto)
        .values(user_id=user_id, content=normalized)
        .on_conflict_do_update(index_elements=["user_id"], set_={"content": normalized})
    )
    session.add(UserActivity(user_id=user_id, actor_id=actor_id, kind="account.photo_changed"))
    await session.commit()
