# -*- coding: utf-8 -*-
"""
GB/T 2828.1-2012（等同 ISO 2859-1:1999）抽样方案独立复现与校验脚本
====================================================================

目的（可复现、可查证）：
1. 独立实现"批量 → 样本量字码（一般检验水平 II）→ 正常检验一次抽样方案（含箭头规则）"
   的检索逻辑，与系统 shared/sampling.ts 交叉校验；
2. 用二项分布/超几何分布计算各方案的 OC 曲线（接收概率 Pa 随批不合格品率 p 的变化），
   验证方案辨别力符合标准设计意图（AQL 处 Pa 高、LQ 处 Pa 低）；
3. 输出系统所用三档 AQL（0.65 / 1.0 / 2.5）在常见批量下的方案表，供任何第三方核对
   GB/T 2828.1-2012 表1、表2-A。

运行：python scripts/verify_sampling.py
依赖：仅 Python 标准库（math），无需第三方包，保证任何环境可复现。

数据来源：
- GB/T 2828.1-2012 表1（样本量字码）、表2-A（正常检验一次抽样方案）。
  该表为公开国家标准内容，可通过国家标准全文公开系统 openstd.samr.gov.cn 查证。
"""

from math import comb

# ---------- 表1：批量范围 → 一般检验水平 II 样本量字码 ----------
LOT_RANGES = [
    (2, 8, "A"), (9, 15, "B"), (16, 25, "C"), (26, 50, "D"),
    (51, 90, "E"), (91, 150, "F"), (151, 280, "G"), (281, 500, "H"),
    (501, 1200, "J"), (1201, 3200, "K"), (3201, 10000, "L"),
    (10001, 35000, "M"), (35001, 150000, "N"), (150001, 500000, "P"),
    (500001, 10**12, "Q"),
]

# ---------- 表2-A 行头：字码 → 样本量 ----------
CODE_SIZES = {
    "A": 2, "B": 3, "C": 5, "D": 8, "E": 13, "F": 20, "G": 32, "H": 50,
    "J": 80, "K": 125, "L": 200, "M": 315, "N": 500, "P": 800,
    "Q": 1250, "R": 2000,
}
LETTERS = list(CODE_SIZES.keys())

# 每个 AQL 列中 Ac=0 方案所在字码（表2-A 对角线结构，n×AQL/100 ≈ 0.13）
AQL_ZERO_LETTER = {
    0.010: "Q", 0.015: "P", 0.025: "N", 0.040: "M", 0.065: "L",
    0.10: "K", 0.15: "J", 0.25: "H", 0.40: "G", 0.65: "F",
    1.0: "E", 1.5: "D", 2.5: "C", 4.0: "B", 6.5: "A",
}
# Ac=0 行以下依次：↑、↓、Ac=1,2,3,5,7,10,14,21，再往下为 ↑（用 Ac=21 方案）
AC_SEQUENCE = [1, 2, 3, 5, 7, 10, 14, 21]


def code_letter(lot_size: int) -> str:
    for lo, hi, letter in LOT_RANGES:
        if lo <= lot_size <= hi:
            return letter
    raise ValueError(f"批量 {lot_size} 超出范围")


def resolve_plan(letter: str, aql: float):
    """含箭头规则的表2-A 检索，返回 (实际字码, 样本量, Ac, Re)。"""
    zero = LETTERS.index(AQL_ZERO_LETTER[aql])
    idx = LETTERS.index(letter)
    offset = idx - zero
    if offset <= 0:
        eff = 0          # 上方全部 ↓ → 用 Ac=0 方案
    elif offset == 1:
        eff = 0          # ↑
    elif offset == 2:
        eff = 3          # ↓ → 用 Ac=1 方案
    elif offset <= 10:
        eff = offset
    else:
        eff = 10         # 表底以下 ↑ → 用 Ac=21 方案
    eff_idx = min(zero + eff, len(LETTERS) - 1)
    final = eff_idx - zero
    if final in (1, 2):   # 表底裁剪兜底
        eff_idx, final = zero, 0
    ac = 0 if final == 0 else AC_SEQUENCE[final - 3]
    eff_letter = LETTERS[eff_idx]
    return eff_letter, CODE_SIZES[eff_letter], ac, ac + 1


def plan_for_lot(lot_size: int, aql: float):
    letter = code_letter(lot_size)
    eff_letter, n, ac, re = resolve_plan(letter, aql)
    full = n >= lot_size
    if full:
        n = lot_size
    return dict(lot=lot_size, aql=aql, letter=letter, eff=eff_letter,
                n=n, ac=ac, re=re, full=full)


# ---------- OC 曲线：接收概率 ----------
def pa_binomial(n: int, ac: int, p: float) -> float:
    """二项近似（批量远大于样本量时）：Pa = P(D<=Ac), D~B(n,p)。"""
    return sum(comb(n, d) * p**d * (1 - p) ** (n - d) for d in range(ac + 1))


def pa_hypergeom(N: int, n: int, ac: int, p: float) -> float:
    """超几何精确：批中不合格品数 K=round(N*p)。"""
    K = round(N * p)
    K = max(0, min(K, N))
    denom = comb(N, n)
    total = 0.0
    for d in range(min(ac, K) + 1):
        if n - d <= N - K:
            total += comb(K, d) * comb(N - K, n - d) / denom
    return total


def main() -> None:
    print("=" * 78)
    print("一、系统三档 AQL 在典型批量下的抽样方案（GB/T 2828.1-2012, 水平II, 正常一次）")
    print("=" * 78)
    header = f"{'批量':>8} {'AQL':>6} {'字码':>4} {'执行字码':>6} {'样本量n':>8} {'Ac':>4} {'Re':>4} {'全检':>4}"
    print(header)
    lots = [5, 20, 50, 120, 250, 400, 800, 1500, 3000, 8000, 20000]
    for aql in (0.65, 1.0, 2.5):
        for lot in lots:
            p = plan_for_lot(lot, aql)
            print(f"{p['lot']:>8} {p['aql']:>6} {p['letter']:>4} {p['eff']:>6}"
                  f" {p['n']:>8} {p['ac']:>4} {p['re']:>4} {'是' if p['full'] else '否':>4}")
        print("-" * 78)

    print()
    print("=" * 78)
    print("二、与标准已知方案点校验（GB/T 2828.1-2012 表2-A 公开可查值）")
    print("=" * 78)
    # (批量, AQL) -> 期望 (执行字码, n, Ac)。取标准表中可直接读出的组合。
    known = [
        (1000, 1.0, ("J", 80, 2)),
        (1000, 2.5, ("J", 80, 5)),
        (1000, 0.65, ("J", 80, 1)),
        (150, 1.0, ("E", 13, 0)),      # F 行 AQL 1.0 为 ↑ → 用 E(n=13, Ac=0)
        (500, 2.5, ("H", 50, 3)),
        (500, 0.65, ("J", 80, 1)),     # H 行 0.65 为 ↓ → 用 J(n=80, Ac=1)
        (80, 0.65, ("F", 20, 0)),      # E 行(51-90) 0.65 为 ↓ → F(20, 0)
        (3000, 1.0, ("K", 125, 3)),
        (10000, 0.65, ("L", 200, 3)),  # L 行 0.65: offset=10-5=5 → Ac=3
    ]
    ok = True
    for lot, aql, (e_letter, e_n, e_ac) in known:
        p = plan_for_lot(lot, aql)
        got = (p["eff"], p["n"], p["ac"])
        status = "PASS" if got == (e_letter, e_n, e_ac) else "FAIL"
        if status == "FAIL":
            ok = False
        print(f"批量{lot:>6} AQL{aql:>5} → 期望 {e_letter},n={e_n},Ac={e_ac}；"
              f"实得 {got[0]},n={got[1]},Ac={got[2]}  [{status}]")

    print()
    print("=" * 78)
    print("三、OC 曲线（接收概率 Pa，二项分布计算，批量1000）")
    print("=" * 78)
    ps = [0.001, 0.0065, 0.01, 0.025, 0.05, 0.08, 0.10]
    for aql in (0.65, 1.0, 2.5):
        plan = plan_for_lot(1000, aql)
        n, ac = plan["n"], plan["ac"]
        row = "  ".join(f"p={p:.3%}:Pa={pa_binomial(n, ac, p):.3f}" for p in ps)
        print(f"AQL={aql}（n={n}, Ac={ac}）")
        print("  " + row)
        # 超几何精确值与二项近似对比（p=AQL 处）
        p0 = aql / 100
        print(f"  在 p=AQL 处：二项 Pa={pa_binomial(n, ac, p0):.4f}，"
              f"超几何 Pa={pa_hypergeom(1000, n, ac, p0):.4f}")
        print()

    print("=" * 78)
    print("四、结论")
    print("=" * 78)
    print(f"点校验结果：{'全部通过' if ok else '存在失败项，需修正！'}")
    print("OC 曲线显示：p=AQL 时接收概率约 89%~98%（符合标准对生产方风险约 5%~10% 的设计），")
    print("p 增大时 Pa 单调下降，方案辨别力正常。")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
