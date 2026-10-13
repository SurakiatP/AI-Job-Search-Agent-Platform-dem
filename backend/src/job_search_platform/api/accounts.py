"""Account routes: signup, verification, login, password reset, account and connected agents."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from job_search_platform.api.dependencies import Services, get_services, owner_actor, write_actor
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import COOKIE_NAME

router = APIRouter()


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SignupRequest(_Body):
    email: str = Field(max_length=254)
    password: str = Field(max_length=256)
    locale: Literal["th", "en"] = "th"


class LoginRequest(_Body):
    email: str = Field(max_length=254)
    password: str = Field(max_length=256)


class TokenRequest(_Body):
    token: str = Field(min_length=1, max_length=256)


class ForgotPasswordRequest(_Body):
    email: str = Field(max_length=254)


class ResetPasswordRequest(_Body):
    token: str = Field(min_length=1, max_length=256)
    password: str = Field(max_length=256)


class DeleteAccountRequest(_Body):
    password: str = Field(max_length=256)
    confirm_email: str = Field(max_length=254)


class CheckEmailView(_Body):
    status: Literal["check_email"]


class AccountView(_Body):
    id: UUID
    email: str
    locale: Literal["th", "en"]
    email_verified: bool
    created_at: datetime


class LoginView(_Body):
    user: AccountView
    csrf_token: str


class SessionStateView(_Body):
    authenticated: Literal[True]
    csrf_token: str
    expires_at: datetime
    user: AccountView


class AgentView(_Body):
    id: UUID
    project_id: UUID
    project_name: str
    label: str | None
    capabilities: list[str]
    expires_at: datetime
    revoked_at: datetime | None


CHECK_EMAIL = {"status": "check_email"}


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/auth/signup", status_code=202, response_model=CheckEmailView)
async def signup(body: SignupRequest, request: Request, services: Services = Depends(get_services)):
    await asyncio.to_thread(services.accounts.signup, body.email, body.password, body.locale, _ip(request))
    return CHECK_EMAIL


@router.post("/auth/verify-email", status_code=204)
async def verify_email(body: TokenRequest, services: Services = Depends(get_services)):
    await asyncio.to_thread(services.accounts.verify_email, body.token)
    return Response(status_code=204)


@router.post("/auth/resend-verification", status_code=202, response_model=CheckEmailView)
async def resend_verification(actor=Depends(owner_actor), services: Services = Depends(get_services)):
    await asyncio.to_thread(services.accounts.resend_verification, actor.user_id)
    return CHECK_EMAIL


@router.post("/auth/login", response_model=LoginView)
async def login(body: LoginRequest, request: Request, services: Services = Depends(get_services)):
    exchange = await asyncio.to_thread(services.accounts.login, body.email, body.password, _ip(request))
    user = await asyncio.to_thread(services.accounts.account, exchange.actor.user_id)
    response = JSONResponse(LoginView(user=user, csrf_token=exchange.csrf_token).model_dump(mode="json"))
    response.set_cookie(COOKIE_NAME, exchange.session_cookie, httponly=True,
                        secure=services.owner_sessions.secure_cookies, samesite="strict", path="/",
                        expires=exchange.expires_at)
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/auth/session", response_model=SessionStateView)
async def restore_session(request: Request, services: Services = Depends(get_services)):
    cookie = request.cookies.get(COOKIE_NAME)
    if not cookie:
        raise ServiceError("unauthorized")
    exchange = await services.owner_sessions.current(
        cookie, origin=request.headers.get("origin", ""), host=request.headers.get("host", ""))
    user = await asyncio.to_thread(services.accounts.account, exchange.actor.user_id)
    return JSONResponse(SessionStateView(authenticated=True, csrf_token=exchange.csrf_token,
                                         expires_at=exchange.expires_at, user=user).model_dump(mode="json"),
                        headers={"Cache-Control": "no-store"})


@router.post("/auth/logout", status_code=204)
async def logout(request: Request, actor=Depends(write_actor), services: Services = Depends(get_services)):
    await asyncio.to_thread(services.accounts.logout, request.cookies[COOKIE_NAME])
    response = Response(status_code=204)
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@router.post("/auth/password/forgot", status_code=202, response_model=CheckEmailView)
async def forgot_password(body: ForgotPasswordRequest, services: Services = Depends(get_services)):
    await asyncio.to_thread(services.accounts.forgot_password, body.email)
    return CHECK_EMAIL


@router.post("/auth/password/reset", status_code=204)
async def reset_password(body: ResetPasswordRequest, services: Services = Depends(get_services)):
    await asyncio.to_thread(services.accounts.reset_password, body.token, body.password)
    return Response(status_code=204)


@router.get("/account", response_model=AccountView)
async def get_account(actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await asyncio.to_thread(services.accounts.account, actor.user_id)


@router.delete("/account", status_code=204)
async def delete_account(body: DeleteAccountRequest, actor=Depends(write_actor),
                         services: Services = Depends(get_services)):
    await asyncio.to_thread(services.accounts.request_deletion, actor.user_id, body.password, body.confirm_email)
    response = Response(status_code=204)
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@router.get("/account/agents", response_model=list[AgentView])
async def list_agents(actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await asyncio.to_thread(services.accounts.agents, actor.user_id)
