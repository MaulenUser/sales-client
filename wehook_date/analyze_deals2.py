import json
from collections import defaultdict

with open('C:/Users/momir/OneDrive/Рабочий стол/ai-auditor-front-main/wehook_date/deals.json', encoding='utf-8') as f:
    deals = json.load(f)

with open('C:/Users/momir/OneDrive/Рабочий стол/ai-auditor-front-main/wehook_date/users.json', encoding='utf-8') as f:
    users = json.load(f)

user_map = {u['ID']: (u.get('NAME','') + ' ' + u.get('LAST_NAME','')).strip() for u in users}

total = len(deals)
with_sum = [d for d in deals if float(d.get('OPPORTUNITY') or 0) > 0]
no_sum   = [d for d in deals if float(d.get('OPPORTUNITY') or 0) == 0]

print(f"Всего сделок:           {total}")
print(f"С заполненной суммой:   {len(with_sum)} ({len(with_sum)*100//total}%)")
print(f"Без суммы (0):          {len(no_sum)} ({len(no_sum)*100//total}%)")

print()
print("=== Сделки с заполненной суммой ===")
print(f"  {'ID':<8} {'Статус':<10} {'Сумма KZT':>14}  Менеджер -> Название")
print("  " + "-"*80)
for d in sorted(with_sum, key=lambda x: -float(x.get('OPPORTUNITY') or 0)):
    sem = d.get('STAGE_SEMANTIC_ID','?')
    sem_label = {'S':'WON','F':'LOSE','P':'В работе'}.get(sem, sem)
    uid = d.get('ASSIGNED_BY_ID','')
    mgr = user_map.get(uid, 'ID='+str(uid))
    opp = float(d.get('OPPORTUNITY') or 0)
    print(f"  {d['ID']:<8} {sem_label:<10} {opp:>14,.0f}  {mgr} -> {d['TITLE'][:50]}")

print()
print("=== Распределение по статусам (все 1174 сделки) ===")
by_sem = defaultdict(int)
for d in deals:
    sem = d.get('STAGE_SEMANTIC_ID','?')
    by_sem[{'S':'WON (успех)','F':'LOSE (провал)','P':'В работе'}.get(sem, sem)] += 1
for k, v in sorted(by_sem.items(), key=lambda x: -x[1]):
    print(f"  {k:<20}: {v} сделок")
