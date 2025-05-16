from constants import INSERTION_COST, DELETION_COST, UNKNOWN_COST

def phonological_cost(a, b, ft):
    if a == b:
        return 0
    if a is None or b is None:
        return INSERTION_COST if a is None else DELETION_COST
    f1 = ft.fts(a)
    f2 = ft.fts(b)
    if not f1 or not f2:
        return UNKNOWN_COST
    return len(f1.differing_specs(f2))

def symbol(val):
    return {1: '+', 0: '0', -1: '-'}.get(val, '?')

def align_segments(seg1, seg2, ft):
    m, n = len(seg1), len(seg2)
    dp = [[float("inf")] * (n + 1) for _ in range(m + 1)]
    back = [[None] * (n + 1) for _ in range(m + 1)]
    dp[0][0] = 0

    for i in range(m + 1):
        for j in range(n + 1):
            if i < m and j < n:
                cost = phonological_cost(seg1[i], seg2[j], ft)
                if dp[i + 1][j + 1] > dp[i][j] + cost:
                    dp[i + 1][j + 1] = dp[i][j] + cost
                    back[i + 1][j + 1] = (i, j)
            if i < m:
                if dp[i + 1][j] > dp[i][j] + DELETION_COST:
                    dp[i + 1][j] = dp[i][j] + DELETION_COST
                    back[i + 1][j] = (i, j)
            if j < n:
                if dp[i][j + 1] > dp[i][j] + INSERTION_COST:
                    dp[i][j + 1] = dp[i][j] + INSERTION_COST
                    back[i][j + 1] = (i, j)

    aligned = []
    i, j = m, n
    while i > 0 or j > 0:
        pi, pj = back[i][j]
        a = seg1[pi] if i - pi == 1 else None
        b = seg2[pj] if j - pj == 1 else None
        aligned.append((a, b))
        i, j = pi, pj

    return aligned[::-1]
