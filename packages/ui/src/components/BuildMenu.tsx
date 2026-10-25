import { useState } from 'react';
import { cmd, sendCmd, useHud } from '../store/hud-store';

interface BuildCard {
  name: string;
  cost: Partial<Record<'food' | 'wood' | 'iron' | 'metal', number>>;
  desc: string;
}

/** 建造菜单: 分类 Tab + 建筑卡 (美术文档 §4.2: 成本不足置灰但显示缺口) */
const TABS: { key: string; label: string; cards: BuildCard[] }[] = [
  {
    key: 'civic',
    label: '民生',
    cards: [
      { name: '民居', cost: { wood: 20 }, desc: '住房 +8 人口上限' },
      { name: '净水站', cost: { wood: 15, iron: 5 }, desc: '净水产出' },
      { name: '文化建筑', cost: { wood: 30 }, desc: '民心 +' },
    ],
  },
  {
    key: 'industry',
    label: '工业',
    cards: [
      { name: '锯木厂', cost: { wood: 25 }, desc: '原木→木板' },
      { name: '冶炼厂', cost: { wood: 20, iron: 10 }, desc: '铁矿→精炼金属' },
      { name: '提炼厂', cost: { iron: 20, metal: 5 }, desc: '雾晶→能量块' },
    ],
  },
  {
    key: 'military',
    label: '军事',
    cards: [
      { name: '兵营', cost: { wood: 30, iron: 10 }, desc: '训练可指挥单位' },
      { name: '机修库', cost: { iron: 25 }, desc: '战地维修' },
      { name: '指挥所', cost: { wood: 40, metal: 10 }, desc: '驻防点与集结令' },
    ],
  },
  {
    key: 'defense',
    label: '防御',
    cards: [
      { name: '箭塔', cost: { wood: 30, iron: 5 }, desc: '廉价单体, 克轻甲/空军' },
      { name: '霜冻塔', cost: { wood: 25, iron: 15 }, desc: '减速软控核心' },
      { name: '城墙', cost: { wood: 10 }, desc: '强制集火区' },
    ],
  },
  {
    key: 'research',
    label: '科研',
    cards: [
      { name: '科研所', cost: { wood: 35, iron: 10 }, desc: '科技点产出' },
      { name: '情报站', cost: { wood: 20, metal: 5 }, desc: '侦察雾中敌军' },
      { name: '解析室', cost: { iron: 30 }, desc: '敌人素材→针对性科技' },
    ],
  },
];

export function BuildMenu() {
  const [tab, setTab] = useState(0);
  const { resources, placement } = useHud();
  const cards = TABS[tab]!.cards;

  const canAfford = (c: BuildCard) =>
    (['food', 'wood', 'iron', 'metal'] as const).every((k) => resources[k] >= (c.cost[k] ?? 0));

  return (
    <div className="hud-panel build-menu">
      <div className="build-tabs">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            className={`build-tab ${i === tab ? 'active' : ''}`}
            onClick={() => setTab(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="build-cards">
        {cards.map((c) => {
          const afford = canAfford(c);
          const costText = (['food', 'wood', 'iron', 'metal'] as const)
            .filter((k) => c.cost[k])
            .map((k) => `${k === 'food' ? '食' : k === 'wood' ? '木' : k === 'iron' ? '铁' : '金'}${c.cost[k]}`)
            .join(' ');
          return (
            <button
              key={c.name}
              className={`build-card ${placement === c.name ? 'active' : ''}`}
              disabled={!afford}
              title={c.desc}
              onClick={() => sendCmd(placement === c.name ? cmd.cancelPlacement() : cmd.placeBuilding(c.name))}
            >
              <div className="name">{c.name}</div>
              <div className={`cost ${afford ? '' : 'short'}`}>{costText}</div>
              <div className="desc">{c.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
