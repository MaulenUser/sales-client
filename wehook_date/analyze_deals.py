import json
from collections import defaultdict

with open('C:/Users/momir/OneDrive/Рабочий стол/ai-auditor-front-main/wehook_date/users.json', encoding='utf-8') as f:
    users = json.load(f)

with open('C:/Users/momir/OneDrive/Рабочий стол/ai-auditor-front-main/wehook_date/deals.json', encoding='utf-8') as f:
    deals = json.load(f)

user_map = {}
print("=== СОТРУДНИКИ ===")
for u in users:
    name = (u.get('NAME','') + ' ' + u.get('LAST_NAME','')).strip()
    user_map[u['ID']] = name
    print(f"  ID={u['ID']:>4}  {name}  pos=({u.get('WORK_POSITION','')})  active={u.get('ACTIVE')}")

print()

# Успешные по STAGE_SEMANTIC_ID = 'S'
won = [d for d in deals if d.get('STAGE_SEMANTIC_ID') == 'S']
print(f"=== УСПЕШНЫЕ (SEMANTIC=S): {len(won)} ===")
for d in won:
    uid = d.get('ASSIGNED_BY_ID','')
    name = user_map.get(uid, 'ID='+str(uid))
    print(f"  ID={d['ID']}  {d['TITLE']}  {d['OPPORTUNITY']} {d['CURRENCY_ID']}  -> {name}")

print()

# По CLOSED=Y
closed = [d for d in deals if d.get('CLOSED') == 'Y']
print(f"=== CLOSED=Y: {len(closed)} ===")
by_mgr = defaultdict(lambda: {'count': 0, 'sum': 0.0, 'deals': []})
for d in closed:
    uid = d.get('ASSIGNED_BY_ID', '')
    name = user_map.get(uid, 'ID='+str(uid))
    by_mgr[name]['count'] += 1
    try:
        by_mgr[name]['sum'] += float(d.get('OPPORTUNITY') or 0)
    except Exception:
        pass
    by_mgr[name]['deals'].append(d)

for mgr, v in sorted(by_mgr.items(), key=lambda x: -x[1]['sum']):
    print(f"  {mgr}: {v['count']} сделок, сумма={v['sum']:,.0f} KZT")

print()

# По STAGE_SEMANTIC_ID = 'S' или 'F' - все завершённые
print("=== ВСЕ ЗАВЕРШЁННЫЕ (S+F) по менеджерам ===")
by_mgr2 = defaultdict(lambda: {'won': 0, 'lost': 0, 'won_sum': 0.0, 'lost_sum': 0.0})
for d in deals:
    uid = d.get('ASSIGNED_BY_ID', '')
    name = user_map.get(uid, 'ID='+str(uid))
    sem = d.get('STAGE_SEMANTIC_ID', 'P')
    opp = 0.0
    try:
        opp = float(d.get('OPPORTUNITY') or 0)
    except Exception:
        pass
    if sem == 'S':
        by_mgr2[name]['won'] += 1
        by_mgr2[name]['won_sum'] += opp
    elif sem == 'F':
        by_mgr2[name]['lost'] += 1
        by_mgr2[name]['lost_sum'] += opp

print(f"  {'Менеджер':<30} {'Выиграно':>8} {'Сумма WON':>15} {'Проиграно':>10} {'Сумма LOSE':>15}")
print("  " + "-"*80)
for mgr, v in sorted(by_mgr2.items(), key=lambda x: -x[1]['won_sum']):
    print(f"  {mgr:<30} {v['won']:>8} {v['won_sum']:>14,.0f} {v['lost']:>10} {v['lost_sum']:>14,.0f}")
