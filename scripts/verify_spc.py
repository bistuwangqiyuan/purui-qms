# -*- coding: utf-8 -*-
"""
SPC 统计计算独立复现与校验脚本
====================================================================

目的（可复现、可查证）：
1. 用与系统 shared/spc.ts 完全相同的固定数据集（25 子组 × 5），
   以 Python 独立实现 Xbar-R 控制限、Cp/Cpk/Pp/Ppk、PPM、柏拉图计算；
2. 两种语言独立计算结果必须一致（系统提供 /api/spc/selftest 端点返回
   TypeScript 侧计算结果，e2e 测试中与本脚本输出交叉断言）；
3. 输出全部中间量，供任何第三方手工核对。

公式与系数依据：
- GB/T 4091-2001《常规控制图》（等同 ISO 8258）表 2：
  n=5 时 A2=0.577，D3=0，D4=2.114，d2=2.326
- Cp=(USL-LSL)/(6σ̂w)，Cpk=min(USL-μ, μ-LSL)/(3σ̂w)，σ̂w=R̄/d2
- Pp/Ppk 同式，σ 用样本标准差 s（n-1）
- PPM = 不合格品数/检验总数 × 1e6

运行：python scripts/verify_spc.py（仅标准库，零依赖）
"""

import math

# 与 shared/spc.ts SPC_SAMPLE_SUBGROUPS 完全一致的固定数据
SUBGROUPS = [
    [1.502, 1.498, 1.505, 1.500, 1.497],
    [1.510, 1.495, 1.500, 1.503, 1.499],
    [1.490, 1.505, 1.510, 1.494, 1.500],
    [1.500, 1.500, 1.497, 1.506, 1.502],
    [1.495, 1.503, 1.500, 1.492, 1.508],
    [1.505, 1.497, 1.500, 1.501, 1.495],
    [1.500, 1.510, 1.490, 1.500, 1.505],
    [1.498, 1.500, 1.503, 1.497, 1.500],
    [1.503, 1.494, 1.500, 1.508, 1.496],
    [1.500, 1.502, 1.498, 1.500, 1.504],
    [1.492, 1.500, 1.505, 1.499, 1.501],
    [1.500, 1.497, 1.500, 1.503, 1.500],
    [1.507, 1.500, 1.495, 1.500, 1.498],
    [1.500, 1.504, 1.500, 1.492, 1.503],
    [1.496, 1.500, 1.502, 1.505, 1.499],
    [1.500, 1.493, 1.500, 1.507, 1.500],
    [1.503, 1.500, 1.497, 1.500, 1.502],
    [1.499, 1.505, 1.500, 1.495, 1.500],
    [1.500, 1.500, 1.508, 1.494, 1.501],
    [1.497, 1.502, 1.500, 1.500, 1.496],
    [1.505, 1.500, 1.499, 1.503, 1.500],
    [1.500, 1.496, 1.504, 1.500, 1.507],
    [1.493, 1.500, 1.501, 1.498, 1.500],
    [1.500, 1.505, 1.497, 1.500, 1.503],
    [1.502, 1.499, 1.500, 1.506, 1.494],
]
USL, LSL = 1.575, 1.425

# GB/T 4091-2001 表 2（n=5）
A2, D3, D4, D2_CONST = 0.577, 0.0, 2.114, 2.326

PARETO_DATA = [
    ("外观划伤", 42), ("尺寸超差", 18), ("标识不清", 8), ("性能不合格", 5), ("包装破损", 2),
]


def mean(xs):
    return sum(xs) / len(xs)


def stdev(xs):
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def main():
    print("=" * 72)
    print("一、Xbar-R 控制图（GB/T 4091-2001 表 2 系数，n=5）")
    print("=" * 72)
    xbars = [mean(g) for g in SUBGROUPS]
    ranges = [max(g) - min(g) for g in SUBGROUPS]
    xbarbar = mean(xbars)
    rbar = mean(ranges)
    xbar_ucl = xbarbar + A2 * rbar
    xbar_lcl = xbarbar - A2 * rbar
    r_ucl = D4 * rbar
    r_lcl = D3 * rbar
    sigma_w = rbar / D2_CONST
    print(f"Xbarbar(总均值)  = {xbarbar:.6f}")
    print(f"Rbar(平均极差) = {rbar:.6f}")
    print(f"Xbar 图 UCL/LCL = {xbar_ucl:.6f} / {xbar_lcl:.6f}")
    print(f"R 图 UCL/LCL = {r_ucl:.6f} / {r_lcl:.6f}")
    print(f"sigma_within = Rbar/d2 = {sigma_w:.7f}")

    print()
    print("=" * 72)
    print("二、过程能力 Cp/Cpk（组内）与 Pp/Ppk（整体）")
    print("=" * 72)
    all_values = [v for g in SUBGROUPS for v in g]
    mu = mean(all_values)
    s = stdev(all_values)
    cp = (USL - LSL) / (6 * sigma_w)
    cpk = min(USL - mu, mu - LSL) / (3 * sigma_w)
    pp = (USL - LSL) / (6 * s)
    ppk = min(USL - mu, mu - LSL) / (3 * s)
    print(f"μ = {mu:.6f}，s（整体）= {s:.7f}")
    print(f"Cp  = {cp:.4f}   Cpk = {cpk:.4f}")
    print(f"Pp  = {pp:.4f}   Ppk = {ppk:.4f}")

    print()
    print("=" * 72)
    print("三、PPM 与柏拉图")
    print("=" * 72)
    ppm = round(3 / 12500 * 1e6)
    print(f"PPM（3 件不合格 / 12500 件受检）= {ppm}")
    total = sum(c for _, c in PARETO_DATA)
    cum = 0
    for name, c in sorted(PARETO_DATA, key=lambda x: -x[1]):
        cum += c
        print(f"  {name:<8} {c:>4} 件  累计 {cum / total * 100:6.2f}%")

    print()
    print("=" * 72)
    print("四、与 TypeScript 端（shared/spc.ts spcSelfTest）交叉断言值")
    print("=" * 72)
    expected = {
        "xbarbar": round(xbarbar, 6),
        "rbar": round(rbar, 6),
        "xbarUCL": round(xbar_ucl, 6),
        "xbarLCL": round(xbar_lcl, 6),
        "rUCL": round(r_ucl, 6),
        "rLCL": round(r_lcl, 6),
        "sigmaWithin": round(sigma_w, 7),
        "cp": round(cp, 4),
        "cpk": round(cpk, 4),
        "pp": round(pp, 4),
        "ppk": round(ppk, 4),
        "ppmValue": ppm,
        "paretoTop": "外观划伤",
        "paretoTopCumPct": round(42 / total * 100, 2),
    }
    import json
    print(json.dumps(expected, ensure_ascii=False, indent=2))
    print()
    print("将以上 JSON 与系统 GET /api/spc/selftest 的返回逐项比对，全部一致即验证通过")
    print("（scripts/e2e-test.mjs 已包含该自动断言）。")


if __name__ == "__main__":
    main()
