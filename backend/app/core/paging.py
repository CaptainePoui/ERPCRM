"""Listes en deux temps (TASK-057, Philippe 2026-11-05 : « on en loade 40 avec la page et le reste après la page
ouverte… j'accepte 1 seconde mais pas plus ») : ?limit=40 pour la page, puis ?offset=40 pour le reste. Sans ces
parametres, la liste complete comme avant. L'ordre doit etre stable (id en dernier) pour que les deux morceaux se
suivent sans doublon ni trou."""


def page(q, limit: int | None, offset: int | None):
    if offset:
        q = q.offset(max(0, offset))
    if limit:
        q = q.limit(max(1, min(limit, 5000)))
    return q
