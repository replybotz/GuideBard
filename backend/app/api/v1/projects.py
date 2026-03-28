"""Projects CRUD."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.dependencies import get_current_user, get_tenant_session
from app.models.project import Project
from app.models.recording import Recording
from app.models.guide import Guide
from app.models.video import Video

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    title: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None


class ProjectResponse(BaseModel):
    id: str
    title: str
    description: str | None
    thumbnail_url: str | None
    status: str
    created_at: str

    class Config:
        from_attributes = True


class ProjectSummary(ProjectResponse):
    recording_count: int = 0
    guide_count: int = 0
    video_count: int = 0


@router.get("", response_model=list[ProjectSummary])
async def list_projects(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    result = await db.execute(
        select(Project).where(Project.tenant_id == tenant.id).order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()

    summaries = []
    for p in projects:
        rec_count = (await db.execute(
            select(func.count()).where(Recording.project_id == p.id)
        )).scalar_one()
        guide_count = (await db.execute(
            select(func.count()).where(Guide.project_id == p.id)
        )).scalar_one()
        video_count = (await db.execute(
            select(func.count()).where(Video.project_id == p.id)
        )).scalar_one()
        summaries.append(ProjectSummary(
            id=str(p.id),
            title=p.title,
            description=p.description,
            thumbnail_url=p.thumbnail_url,
            status=p.status,
            created_at=p.created_at.isoformat(),
            recording_count=rec_count,
            guide_count=guide_count,
            video_count=video_count,
        ))
    return summaries


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: ProjectCreate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    project = Project(tenant_id=tenant.id, title=body.title, description=body.description)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectResponse(
        id=str(project.id), title=project.title, description=project.description,
        thumbnail_url=project.thumbnail_url, status=project.status,
        created_at=project.created_at.isoformat(),
    )


@router.get("/{project_id}", response_model=ProjectSummary)
async def get_project(
    project_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    p = await db.get(Project, project_id)
    if not p or p.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Project not found")

    rec_count = (await db.execute(select(func.count()).where(Recording.project_id == p.id))).scalar_one()
    guide_count = (await db.execute(select(func.count()).where(Guide.project_id == p.id))).scalar_one()
    video_count = (await db.execute(select(func.count()).where(Video.project_id == p.id))).scalar_one()

    return ProjectSummary(
        id=str(p.id), title=p.title, description=p.description,
        thumbnail_url=p.thumbnail_url, status=p.status,
        created_at=p.created_at.isoformat(),
        recording_count=rec_count, guide_count=guide_count, video_count=video_count,
    )


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    p = await db.get(Project, project_id)
    if not p or p.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Project not found")

    if body.title is not None:
        p.title = body.title
    if body.description is not None:
        p.description = body.description
    if body.status is not None:
        p.status = body.status

    await db.commit()
    await db.refresh(p)
    return ProjectResponse(
        id=str(p.id), title=p.title, description=p.description,
        thumbnail_url=p.thumbnail_url, status=p.status,
        created_at=p.created_at.isoformat(),
    )


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: uuid.UUID,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_session),
):
    _, tenant = auth
    p = await db.get(Project, project_id)
    if not p or p.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(p)
    await db.commit()
