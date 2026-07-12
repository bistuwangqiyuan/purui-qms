import { useEffect, useState } from 'react';
import type { ComponentType } from '../../shared/types';
import { api } from '../api';

const STANDARDS = [
  {
    code: 'GB/T 19001-2016 / ISO 9001:2015',
    name: '质量管理体系 要求',
    use: '本系统流程设计依据：8.4 外部提供的过程、产品和服务的控制（来料检验）、8.7 不合格输出的控制（MRB 处置）、7.5 成文信息（记录留痕）。',
  },
  {
    code: 'GB/T 2828.1-2012 / ISO 2859-1:1999',
    name: '计数抽样检验程序 第1部分：按接收质量限（AQL）检索的逐批检验抽样计划',
    use: '来料批抽样方案的唯一检索依据：表1（样本量字码，一般检验水平 II）、表2-A（正常检验一次抽样方案，含箭头规则）。系统实现与仓库内 scripts/verify_sampling.py 交叉校验，任何第三方可运行复现。',
  },
  {
    code: 'GB/T 20990.1-2020（MOD IEC 60700-1:2015）',
    name: '高压直流输电晶闸管阀 第1部分：电气试验',
    use: '晶闸管阀电气型式试验与产品试验的项目、要求及判据；本系统组部件电气类检验项目的上位依据。',
  },
  {
    code: 'T/CAPEC 18-2020',
    name: '电力工业 晶闸管换流阀制造监理技术要求',
    use: '换流阀原材料及组部件检查对象清单（5.2、5.3 条）：晶闸管、散热器、阀电抗器、阻尼电容器、阻尼电阻、均压电阻、晶闸管控制单元、水冷管件等，本系统 11 类组部件基础数据据此编制。',
  },
  {
    code: 'GB/T 15291',
    name: '半导体器件 第6部分：晶闸管',
    use: '晶闸管 VDRM、IDRM、VTM、门极特性等参数测试方法依据。',
  },
  {
    code: 'GB/T 17702-2021',
    name: '电力电子电容器',
    use: '阻尼电容器电容量偏差、损耗角正切、耐压试验依据。',
  },
  {
    code: 'GB/T 30425-2013',
    name: '高压直流输电换流阀水冷却设备',
    use: '散热器、水冷管件水压密封试验依据。',
  },
  {
    code: 'GB/T 5585.1',
    name: '电工用铜、铝及其合金母线 第1部分：铜和铜合金母线',
    use: '母排截面尺寸公差与材质要求依据。',
  },
  {
    code: 'GB/T 1303 / GB/T 1408.1',
    name: '电气用热固性树脂工业硬质层压板 / 绝缘材料电气强度试验方法',
    use: '绝缘件外观、绝缘电阻与工频耐压抽验依据。',
  },
];

const IMAGES = [
  {
    file: 'hero-transmission.jpg',
    desc: '登录页背景：高压输电铁塔与线路（日落）',
    source: 'Unsplash 图片 photo-1473341304170-971dccb5ac1e（Unsplash License，可免费商用、无需署名）',
  },
  {
    file: 'standards-lab.jpg',
    desc: '本页横幅：变电站电力变压器设备',
    source: 'Unsplash 图片 photo-1509390144018-eeaf65052242（Unsplash License，可免费商用、无需署名）',
  },
];

export default function Standards() {
  const [types, setTypes] = useState<ComponentType[]>([]);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const load = (retry: number) => {
      api
        .componentTypes()
        .then((t) => { if (!cancelled) setTypes(t); })
        .catch((e) => {
          if (cancelled) return;
          if (retry > 0) setTimeout(() => load(retry - 1), 1500);
          else setLoadError(e instanceof Error ? e.message : '加载失败');
        });
    };
    load(2);
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>标准与依据</h1>
          <div className="sub">本系统全部规则、数据、图片的出处，公开可查证</div>
        </div>
      </div>

      <div className="hero-banner">
        <img src="/images/standards-lab.jpg" alt="工业设施" />
        <div className="veil" />
        <div className="txt">
          <h2>实事求是 · 数据可证</h2>
          <p>
            系统内每一条判定规则（抽样方案、Ac/Re、检验项目限值）均标注标准出处；
            抽样逻辑可用仓库内 Python 脚本独立复现，欢迎任何第三方检验。
          </p>
        </div>
        <div className="credit">图片来源：Unsplash（Unsplash License）</div>
      </div>

      <div className="card">
        <h2>引用标准清单</h2>
        {STANDARDS.map((s) => (
          <div className="std-item" key={s.code}>
            <div><span className="code">{s.code}</span>　{s.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{s.use}</div>
          </div>
        ))}
        <div className="hint" style={{ fontSize: 12.5 }}>
          国家标准原文可通过"国家标准全文公开系统"（openstd.samr.gov.cn）免费查阅；
          团体标准可通过"全国团体标准信息平台"（www.ttbz.org.cn）检索。
        </div>
      </div>

      <div className="card">
        <h2>AQL 分级原则（本系统质量策划规定）</h2>
        <table className="tbl">
          <thead>
            <tr><th>组部件类别</th><th>AQL</th><th>判定理由</th></tr>
          </thead>
          <tbody>
            <tr><td>关键件（晶闸管、阀电抗器、阻尼电容器、TCU）</td><td className="num">0.65</td><td>直接影响阀安全运行与换流可靠性的有源/贮能器件，失效后果严重</td></tr>
            <tr><td>重要件（散热器、阻尼电阻、均压电阻、水冷管件、光纤、绝缘件）</td><td className="num">1.0</td><td>影响电气性能、冷却与绝缘可靠性的部件</td></tr>
            <tr><td>一般件（母排等结构连接件）</td><td className="num">2.5</td><td>结构与辅助部件，缺陷可在装配环节进一步拦截</td></tr>
          </tbody>
        </table>
        <div className="hint" style={{ fontSize: 12.5, marginTop: 8 }}>
          AQL 取值属于企业质量策划决策（GB/T 2828.1-2012 第 5 章规定 AQL 由负责部门指定），
          此三档取值为行业常用实践；正式投产使用前应由质量部门按供货合同与技术协议评审确认。
        </div>
      </div>

      <div className="card">
        <h2>组部件检验模板一览（{types.length} 类）</h2>
        {loadError && <div className="alert error">检验模板加载失败：{loadError}，请刷新页面重试</div>}
        {types.map((t) => (
          <details key={t.id} style={{ marginBottom: 8 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              {t.code} · {t.name}（{t.category}，AQL {t.aql}，{t.items.length} 个检验项目）
            </summary>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', margin: '6px 0' }}>{t.description}</div>
            <table className="tbl" style={{ marginBottom: 10 }}>
              <thead><tr><th>项目</th><th>方法</th><th>技术要求</th><th>依据</th></tr></thead>
              <tbody>
                {t.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.name}</td>
                    <td>{it.method}</td>
                    <td>{it.requirement}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{it.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
        <div className="hint" style={{ fontSize: 12.5 }}>
          模板中的具体限值（如 VDRM ≥ 8500 V、电容量 ±5%）为按公开标准与行业通用规格编制的
          示例默认值；正式使用时应按对应供货技术协议/图纸修订，修订权限属管理员。
        </div>
      </div>

      <div className="card">
        <h2>图片来源与许可</h2>
        <table className="tbl">
          <thead><tr><th>文件</th><th>用途</th><th>来源与许可</th></tr></thead>
          <tbody>
            {IMAGES.map((im) => (
              <tr key={im.file}>
                <td><code>/images/{im.file}</code></td>
                <td>{im.desc}</td>
                <td>{im.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hint" style={{ fontSize: 12.5, marginTop: 8 }}>
          Unsplash License 允许免费用于商业与非商业用途，无需许可与署名（署名系自愿致谢）。
          详见 unsplash.com/license。图片具体出处链接见仓库 README。
        </div>
      </div>

      <div className="card">
        <h2>数据可复现性声明</h2>
        <p style={{ fontSize: 13.5 }}>
          抽样方案（样本量字码、n、Ac/Re）由 <code>shared/sampling.ts</code> 按 GB/T 2828.1-2012
          表1、表2-A 实现；仓库内 <code>scripts/verify_sampling.py</code>（仅用 Python 标准库）
          独立实现同一检索逻辑并对 9 个标准已知方案点做断言校验、计算 OC 曲线（二项分布与超几何分布），
          运行 <code>python scripts/verify_sampling.py</code> 即可复现。演示数据由固定随机种子生成
          （<code>netlify/functions/seed-data.ts</code>），批次带"演示"标记，与真实业务数据严格区分。
        </p>
      </div>
    </>
  );
}
