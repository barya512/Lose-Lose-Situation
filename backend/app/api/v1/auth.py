"""Auth + current-user endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.deps import get_current_user
from app.auth.security import create_access_token
from app.db.base import get_session
from app.db.models import User
from app.schemas.auth import Credentials, InventoryItemOut, MeOut, TokenOut, UserOut

router = APIRouter(tags=["auth"])


def _token_response(user: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/auth/guest", response_model=TokenOut)
async def guest(session: AsyncSession = Depends(get_session)) -> TokenOut:
    user = await service.create_guest(session)
    return _token_response(user)


@router.post("/auth/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register(body: Credentials, session: AsyncSession = Depends(get_session)) -> TokenOut:
    try:
        user = await service.register(session, body.username, body.password)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return _token_response(user)


@router.post("/auth/login", response_model=TokenOut)
async def login(body: Credentials, session: AsyncSession = Depends(get_session)) -> TokenOut:
    user = await service.login(session, body.username, body.password)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad credentials")
    return _token_response(user)


@router.get("/me", response_model=MeOut)
async def me(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    inventory_rows = await service.load_inventory(session, user.id)
    inventory = [
        InventoryItemOut(
            item_key=item.key,
            name=item.name,
            rarity=item.rarity,
            effect_type=item.effect_type,
            magnitude=item.magnitude,
            active=inv.active,
        )
        for inv, item in inventory_rows
    ]
    # Build from UserOut fields explicitly so pydantic never lazy-loads the ORM
    # `inventory` relationship (which would raise MissingGreenlet on an AsyncSession).
    user_out = UserOut.model_validate(user)
    return MeOut(**user_out.model_dump(), inventory=inventory)
