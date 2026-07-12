/**
 * 换流阀组部件基础数据（来料检验对象与检验项目模板）
 *
 * 组部件清单依据 T/CAPEC 18-2020《电力工业 晶闸管换流阀制造监理技术要求》
 * 5.2 原材料及组部件检查、5.3 制造组装工序检查所列对象编制；
 * 检验项目与判定依据 GB/T 20990.1-2020《高压直流输电晶闸管阀 第1部分：电气试验》
 * 及各组部件对应的国家/行业标准、产品技术规格书编制。
 *
 * AQL 分级原则（本系统质量策划规定，检索 GB/T 2828.1-2012 表2-A）：
 *   关键件 AQL=0.65（直接影响阀安全运行的有源/贮能器件）
 *   重要件 AQL=1.0 （影响电气与冷却性能的部件）
 *   一般件 AQL=2.5 （结构与辅助部件）
 */

import type { ComponentType } from './types';

export const COMPONENT_TYPES: ComponentType[] = [
  {
    id: 'thyristor',
    code: 'CV-01',
    name: '晶闸管',
    category: '关键件',
    aql: 0.65,
    description:
      '电触发/光触发大功率晶闸管，换流阀核心开关器件。逐只进行外观与关键电参数抽验，参数应与厂家出厂数据一致。',
    items: [
      { id: 'thy-app', name: '外观与标识检查', method: '目视', requirement: '管壳无裂纹、划伤、变形，台面无损伤，型号/序列号标识清晰可追溯', kind: 'qualitative', basis: 'T/CAPEC 18-2020 5.3.1；产品技术规格书' },
      { id: 'thy-vdrm', name: '断态重复峰值电压 VDRM', method: '晶闸管特性测试台', requirement: '不低于规格书额定值（示例：8500 V 级）', kind: 'quantitative', unit: 'V', min: 8500, basis: 'GB/T 15291《半导体器件 第6部分：晶闸管》；规格书' },
      { id: 'thy-idrm', name: '断态重复峰值电流 IDRM', method: '晶闸管特性测试台（额定结温）', requirement: '≤ 400 mA（8500 V 施压下）', kind: 'quantitative', unit: 'mA', max: 400, basis: 'GB/T 15291；规格书' },
      { id: 'thy-vtm', name: '通态峰值电压 VTM', method: '大电流通态压降测试', requirement: '≤ 2.0 V（规定通态电流下）', kind: 'quantitative', unit: 'V', max: 2.0, basis: 'GB/T 15291；规格书' },
      { id: 'thy-gate', name: '门极触发特性 VGT/IGT', method: '门极特性测试', requirement: '触发电压/电流在规格书范围内，触发可靠', kind: 'qualitative', basis: 'GB/T 15291；规格书' },
    ],
  },
  {
    id: 'heatsink',
    code: 'CV-02',
    name: '散热器',
    category: '重要件',
    aql: 1.0,
    description: '铝合金/纯铝水冷散热器，与晶闸管压装构成散热通道，内部水道承受长期水压。',
    items: [
      { id: 'hs-app', name: '外观检查', method: '目视', requirement: '压接面无划伤、磕碰、腐蚀，水嘴螺纹完好，内腔洁净无残屑', kind: 'qualitative', basis: 'T/CAPEC 18-2020 5.3.1；图纸' },
      { id: 'hs-flat', name: '压接面平面度', method: '平面度仪/刀口尺', requirement: '≤ 0.02 mm', kind: 'quantitative', unit: 'mm', max: 0.02, basis: '产品图纸技术要求' },
      { id: 'hs-rough', name: '压接面表面粗糙度 Ra', method: '粗糙度仪', requirement: 'Ra ≤ 1.6 μm', kind: 'quantitative', unit: 'μm', max: 1.6, basis: '产品图纸技术要求；GB/T 1031' },
      { id: 'hs-press', name: '水压密封试验', method: '1.5 倍额定水压保压 30 min', requirement: '无渗漏、无压降异常', kind: 'qualitative', basis: 'GB/T 30425《高压直流输电换流阀水冷却设备》；规格书' },
    ],
  },
  {
    id: 'reactor',
    code: 'CV-03',
    name: '阀电抗器（阳极饱和电抗器）',
    category: '关键件',
    aql: 0.65,
    description: '串联于晶闸管阀段，抑制开通 di/dt 与关断过冲的饱和电抗器，含水冷或自冷结构。',
    items: [
      { id: 'rx-app', name: '外观与装配检查', method: '目视', requirement: '铁心无锈蚀、包封无开裂，引线端子无损伤，铭牌参数与订货一致', kind: 'qualitative', basis: 'T/CAPEC 18-2020 5.3.3；图纸' },
      { id: 'rx-ind', name: '电感量（未饱和）', method: 'LCR 电桥（规定频率）', requirement: '标称值 ±10%（示例标称 12 mH → 10.8–13.2 mH）', kind: 'quantitative', unit: 'mH', min: 10.8, max: 13.2, basis: '产品技术规格书' },
      { id: 'rx-dcr', name: '绕组直流电阻', method: '直流电阻测试仪', requirement: '≤ 2.0 mΩ 且与批内均值偏差 ≤ ±5%', kind: 'quantitative', unit: 'mΩ', max: 2.0, basis: '产品技术规格书' },
      { id: 'rx-ins', name: '匝间/对地绝缘检查', method: '工频耐压 + 绝缘电阻', requirement: '按规格书施压无击穿闪络，绝缘电阻 ≥ 1000 MΩ', kind: 'qualitative', basis: 'GB/T 20990.1-2020；规格书' },
    ],
  },
  {
    id: 'damping-cap',
    code: 'CV-04',
    name: '阻尼电容器',
    category: '关键件',
    aql: 0.65,
    description: 'RC 阻尼回路电容器，均化晶闸管级间电压分布并抑制换相过冲。',
    items: [
      { id: 'dc-app', name: '外观检查', method: '目视', requirement: '外壳无变形渗漏，套管无裂纹，引出端子无松动', kind: 'qualitative', basis: 'GB/T 17702《电力电子电容器》；图纸' },
      { id: 'dc-cap', name: '电容量偏差', method: '电容电桥（1 kHz）', requirement: '标称值 ±5%（示例标称 1.5 μF → 1.425–1.575 μF）', kind: 'quantitative', unit: 'μF', min: 1.425, max: 1.575, basis: 'GB/T 17702；规格书' },
      { id: 'dc-tand', name: '损耗角正切 tanδ', method: '电容电桥', requirement: '≤ 0.0010（工频）', kind: 'quantitative', unit: '', max: 0.001, basis: 'GB/T 17702；规格书' },
      { id: 'dc-wv', name: '端子间耐压试验', method: '直流耐压（出厂试验电压的 75% 复验）', requirement: '无击穿、无闪络', kind: 'qualitative', basis: 'GB/T 17702；规格书' },
    ],
  },
  {
    id: 'damping-res',
    code: 'CV-05',
    name: '阻尼电阻',
    category: '重要件',
    aql: 1.0,
    description: 'RC 阻尼回路无感电阻，多为厚膜/线绕水冷结构，长期承受高频电流。',
    items: [
      { id: 'dr-app', name: '外观检查', method: '目视', requirement: '瓷体/基板无裂纹，涂层完整，端子无氧化', kind: 'qualitative', basis: 'GB/T 5729《电子设备用固定电阻器》；图纸' },
      { id: 'dr-r', name: '电阻值偏差', method: '数字电桥（四线制）', requirement: '标称值 ±5%（示例标称 36 Ω → 34.2–37.8 Ω）', kind: 'quantitative', unit: 'Ω', min: 34.2, max: 37.8, basis: 'GB/T 5729；规格书' },
      { id: 'dr-ind', name: '残余电感', method: 'LCR 电桥（100 kHz）', requirement: '≤ 3 μH', kind: 'quantitative', unit: 'μH', max: 3, basis: '产品技术规格书' },
      { id: 'dr-ins', name: '绝缘电阻（对安装面）', method: '1000 V 兆欧表', requirement: '≥ 1000 MΩ', kind: 'quantitative', unit: 'MΩ', min: 1000, basis: 'GB/T 5729；规格书' },
    ],
  },
  {
    id: 'grading-res',
    code: 'CV-06',
    name: '直流均压电阻',
    category: '重要件',
    aql: 1.0,
    description: '并联于晶闸管级，保证阀段直流与低频电压均匀分布的高阻精密电阻。',
    items: [
      { id: 'gr-app', name: '外观检查', method: '目视', requirement: '本体无裂纹破损，标称值印字清晰', kind: 'qualitative', basis: 'GB/T 5729；图纸' },
      { id: 'gr-r', name: '电阻值偏差', method: '高阻计/数字电桥', requirement: '标称值 ±2%（示例标称 100 kΩ → 98–102 kΩ）', kind: 'quantitative', unit: 'kΩ', min: 98, max: 102, basis: '产品技术规格书' },
      { id: 'gr-tc', name: '电阻温度系数', method: '恒温槽两点法（供方数据复核）', requirement: '≤ 100 ppm/K', kind: 'quantitative', unit: 'ppm/K', max: 100, basis: '产品技术规格书' },
    ],
  },
  {
    id: 'tcu',
    code: 'CV-07',
    name: '晶闸管控制单元（TCU/TE 板）',
    category: '关键件',
    aql: 0.65,
    description: '每个晶闸管级配套的触发与监测电子单元，完成取能、触发、状态回报与保护性触发（BOD）。',
    items: [
      { id: 'tcu-app', name: '外观与工艺检查', method: '目视/放大镜', requirement: '焊点饱满无虚焊连锡，三防漆覆盖均匀，元器件无机械损伤', kind: 'qualitative', basis: 'T/CAPEC 18-2020 5.3.3；IPC-A-610 工艺等级；规格书' },
      { id: 'tcu-func', name: '功能测试（触发/回报）', method: '专用测试台架', requirement: '取能启动电压、触发脉冲幅值与宽度、回检光信号均在规格范围内', kind: 'qualitative', basis: '产品技术规格书；GB/T 20990.1-2020' },
      { id: 'tcu-bod', name: '保护性触发（BOD）动作电压', method: '测试台架升压', requirement: '动作电压在规格书整定范围内（示例 7600–8000 V）', kind: 'quantitative', unit: 'V', min: 7600, max: 8000, basis: '产品技术规格书' },
      { id: 'tcu-aging', name: '老化筛选记录审查', method: '文件见证', requirement: '整批 100% 通过高温老化筛选并有可追溯记录', kind: 'qualitative', basis: 'T/CAPEC 18-2020 5.2；规格书' },
    ],
  },
  {
    id: 'water-pipe',
    code: 'CV-08',
    name: '水冷管件（PVDF 管/接头）',
    category: '重要件',
    aql: 1.0,
    description: '阀内冷却水路 PVDF 管道、接头与卡箍，长期承受去离子水压力并要求低离子析出。',
    items: [
      { id: 'wp-app', name: '外观检查', method: '目视', requirement: '管件无划伤气泡杂质，端面平整，规格标识清晰', kind: 'qualitative', basis: 'GB/T 30425；图纸' },
      { id: 'wp-dim', name: '外径/壁厚尺寸', method: '游标卡尺/千分尺', requirement: '外径公差 ±0.15 mm（示例 DN25 外径 32 mm → 31.85–32.15 mm）', kind: 'quantitative', unit: 'mm', min: 31.85, max: 32.15, basis: '产品图纸技术要求' },
      { id: 'wp-press', name: '水压试验', method: '1.5 倍额定压力保压 30 min', requirement: '无渗漏、无可见变形', kind: 'qualitative', basis: 'GB/T 30425；规格书' },
      { id: 'wp-cert', name: '材质证明审查', method: '文件见证', requirement: 'PVDF 原料牌号、卫生与析出指标检测报告齐全有效', kind: 'qualitative', basis: 'T/CAPEC 18-2020 5.2' },
    ],
  },
  {
    id: 'fiber',
    code: 'CV-09',
    name: '触发/回检光纤',
    category: '重要件',
    aql: 1.0,
    description: '阀控设备与 TCU 间传输触发与回报信号的光纤（含接头），衰减与机械性能直接影响触发可靠性。',
    items: [
      { id: 'fb-app', name: '外观检查', method: '目视', requirement: '护套无破损压痕，接头端面清洁无划伤', kind: 'qualitative', basis: 'T/CAPEC 18-2020 5.2；规格书' },
      { id: 'fb-att', name: '链路插入损耗', method: '光源+光功率计', requirement: '≤ 3.0 dB（含两端接头，650 nm/规格书规定波长）', kind: 'quantitative', unit: 'dB', max: 3.0, basis: 'GB/T 15972.40《光纤试验方法规范》；规格书' },
      { id: 'fb-len', name: '长度检查', method: '钢卷尺', requirement: '订货长度 −0/+50 mm', kind: 'qualitative', basis: '产品图纸' },
    ],
  },
  {
    id: 'insulation',
    code: 'CV-10',
    name: '绝缘件（层压板/绝缘拉杆）',
    category: '重要件',
    aql: 1.0,
    description: '环氧玻璃布层压板、绝缘拉杆等阀塔结构绝缘件，承担机械载荷与电气绝缘双重功能。',
    items: [
      { id: 'in-app', name: '外观检查', method: '目视', requirement: '无分层、裂纹、气泡，边缘加工光滑无毛刺', kind: 'qualitative', basis: 'GB/T 1303《电气用热固性树脂工业硬质层压板》；图纸' },
      { id: 'in-dim', name: '关键尺寸', method: '卡尺/三坐标（按图纸抽测）', requirement: '孔距/长度公差 ±0.2 mm（以图纸为准）', kind: 'qualitative', basis: '产品图纸技术要求' },
      { id: 'in-ir', name: '绝缘电阻', method: '2500 V 兆欧表', requirement: '≥ 10000 MΩ', kind: 'quantitative', unit: 'MΩ', min: 10000, basis: 'GB/T 1303；规格书' },
      { id: 'in-hipot', name: '工频耐压抽验', method: '试验变压器', requirement: '按规格书试验电压 1 min 无击穿、无闪络', kind: 'qualitative', basis: 'GB/T 1408.1《绝缘材料电气强度试验方法》；规格书' },
    ],
  },
  {
    id: 'busbar',
    code: 'CV-11',
    name: '母排（铜排/连接排）',
    category: '一般件',
    aql: 2.5,
    description: 'T2 铜母排及级间连接排，传导阀段主电流，表面多为镀银/镀锡处理。',
    items: [
      { id: 'bb-app', name: '外观与镀层检查', method: '目视', requirement: '表面无划伤起皮，镀层均匀无露铜、无起泡', kind: 'qualitative', basis: 'GB/T 5585.1《电工用铜、铝及其合金母线》；图纸' },
      { id: 'bb-dim', name: '截面尺寸', method: '游标卡尺', requirement: '宽/厚公差按 GB/T 5585.1（示例厚度 10 mm → 9.85–10.15 mm）', kind: 'quantitative', unit: 'mm', min: 9.85, max: 10.15, basis: 'GB/T 5585.1' },
      { id: 'bb-plate', name: '镀层厚度', method: '镀层测厚仪', requirement: '镀银 ≥ 8 μm（或按图纸）', kind: 'quantitative', unit: 'μm', min: 8, basis: '产品图纸技术要求' },
      { id: 'bb-cert', name: '材质证明审查', method: '文件见证', requirement: 'T2 铜材质单与第三方成分检测报告齐全', kind: 'qualitative', basis: 'GB/T 5231《加工铜及铜合金牌号和化学成分》' },
    ],
  },
];

export function getComponentType(id: string): ComponentType | undefined {
  return COMPONENT_TYPES.find((c) => c.id === id);
}

/** 常见供应商示例（演示数据用，为通用类别名称，不指向任何真实企业） */
export const DEMO_SUPPLIERS = [
  '西安半导体器件供应商A',
  '株洲功率器件供应商B',
  '桂林电容器供应商C',
  '北京电抗器供应商D',
  '苏州精密机械供应商E',
];
