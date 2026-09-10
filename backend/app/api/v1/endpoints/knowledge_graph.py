from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from neo4j import AsyncGraphDatabase
from app.core.config import settings
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole

router = APIRouter()


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Accès administrateur requis")
    return current_user


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    group_id: str | None = None
    properties: dict


class GraphLink(BaseModel):
    source: str
    target: str
    label: str
    fact: str | None = None


class GraphData(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]
    total_relations: int


_driver = None


def _get_driver():
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(settings.NEO4J_URI, auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD))
    return _driver


def _jsonable(v):
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    if hasattr(v, "iso_format"):  # neo4j.time.DateTime/Date/Time/Duration
        return v.iso_format()
    return str(v)


def _clean_properties(props: dict) -> dict:
    return {k: _jsonable(v) for k, v in props.items() if "embedding" not in k.lower()}


@router.get("/graph", response_model=GraphData)
async def get_knowledge_graph(
    group_id: str | None = Query(None, description="Filtrer par domaine (platform/erpcrm/sipv)"),
    limit: int = Query(3000, ge=1, le=5000),
    _: User = Depends(require_admin),
):
    # Episodic exclu par defaut : ce sont des traces de provenance (l'episode
    # source), pas des concepts -- les afficher doublait chaque concept avec
    # son episode source du meme nom, confusion signalee par Philippe le
    # 2026-09-04 (ex: "Captaine" apparaissant deux fois).
    #
    # MATCH (n:Entity) puis OPTIONAL MATCH vers les relations, plutot qu'un
    # MATCH (n)-[r]->(m) direct filtre par NOT Episodic : un Entity isole (sans
    # relation vers un autre Entity, seulement vers son episode source exclu)
    # doit quand meme apparaitre -- premiere version buguee, un Entity seul
    # (ex: "Captaine" avant tout autre concept lie) ne remontait plus du tout.
    n_where = "WHERE n.group_id = $group_id" if group_id else ""
    query = f"""
        MATCH (n:Entity)
        {n_where}
        WITH n, COUNT {{ (n)--() }} AS degree
        ORDER BY degree DESC
        LIMIT $limit
        OPTIONAL MATCH (n)-[r]->(m:Entity)
        RETURN n, r, m
    """
    total_query = f"""
        MATCH (n:Entity)-[r]->(m:Entity)
        {n_where}
        RETURN count(r) AS total
    """
    params = {"limit": limit}
    if group_id:
        params["group_id"] = group_id

    nodes: dict[str, GraphNode] = {}
    links: list[GraphLink] = []
    total_relations = 0
    try:
        driver = _get_driver()
        async with driver.session(database=settings.NEO4J_DATABASE) as session:
            total_result = await session.run(total_query, params)
            total_record = await total_result.single()
            total_relations = total_record["total"] if total_record else 0

            result = await session.run(query, params)
            async for record in result:
                # m/r peuvent etre None (OPTIONAL MATCH) -- un Entity sans
                # relation vers un autre Entity doit quand meme apparaitre.
                for node in (record["n"], record["m"]):
                    if node is None:
                        continue
                    nid = node.element_id
                    if nid not in nodes:
                        props = dict(node)
                        labels = list(node.labels)
                        nodes[nid] = GraphNode(
                            id=nid,
                            label=props.get("name") or props.get("summary") or (labels[0] if labels else "?"),
                            type=labels[0] if labels else "Entity",
                            group_id=props.get("group_id"),
                            properties=_clean_properties(props),
                        )
                rel = record["r"]
                if rel is not None:
                    links.append(GraphLink(
                        source=record["n"].element_id,
                        target=record["m"].element_id,
                        label=rel.type,
                        fact=dict(rel).get("fact"),
                    ))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Connexion Neo4j impossible : {e}")

    return GraphData(nodes=list(nodes.values()), links=links, total_relations=total_relations)
