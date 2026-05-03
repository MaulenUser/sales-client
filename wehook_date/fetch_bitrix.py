import requests
import json
import csv
import os
import time
from datetime import datetime

WEBHOOK = "https://sapaplast.bitrix24.kz/rest/1/bioc1b5xzu2usp6x"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
DATE_FROM = "2026-04-01"
DATE_TO   = "2026-05-03"


def fetch_all(method, params=None, list_key="result"):
    """Paginate through all records for a given method."""
    items = []
    start = 0
    while True:
        p = dict(params or {})
        p["start"] = start
        try:
            r = requests.get(f"{WEBHOOK}/{method}", params=p, timeout=30)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"  ERROR {method} start={start}: {e}")
            break

        result = data.get("result", [])
        # tasks returns {"result": {"tasks": [...]}}
        if isinstance(result, dict):
            for v in result.values():
                if isinstance(v, list):
                    result = v
                    break
        if not result:
            break
        items.extend(result)
        total = data.get("total", len(items))
        print(f"  {method}: fetched {len(items)}/{total}", end="\r")
        if len(items) >= total or "next" not in data:
            break
        start = data["next"]
        time.sleep(0.2)
    print(f"  {method}: total fetched = {len(items)}")
    return items


def save_json(name, data):
    path = os.path.join(OUT_DIR, f"{name}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Saved {path}")


def save_csv(name, data):
    if not data:
        print(f"  No data for {name}, skipping CSV")
        return
    path = os.path.join(OUT_DIR, f"{name}.csv")
    # flatten nested dicts/lists to string
    def flatten(val):
        if isinstance(val, (dict, list)):
            return json.dumps(val, ensure_ascii=False)
        return val
    keys = list(data[0].keys())
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        writer.writeheader()
        for row in data:
            writer.writerow({k: flatten(row.get(k)) for k in keys})
    print(f"  Saved {path}")


def main():
    print(f"\n=== Bitrix24 export {DATE_FROM} to {DATE_TO} ===\n")

    # ── 1. DEALS ────────────────────────────────────────────────────────────
    print("Deals...")
    deals = fetch_all("crm.deal.list", {
        "select[]": [
            "ID","TITLE","TYPE_ID","CATEGORY_ID","STAGE_ID","STAGE_SEMANTIC_ID",
            "PROBABILITY","CURRENCY_ID","OPPORTUNITY","BEGINDATE","CLOSEDATE",
            "DATE_CREATE","DATE_MODIFY","ASSIGNED_BY_ID","CREATED_BY_ID",
            "CONTACT_ID","COMPANY_ID","LEAD_ID","SOURCE_ID","SOURCE_DESCRIPTION",
            "COMMENTS","CLOSED","IS_NEW","IS_RECURRING","IS_RETURN_CUSTOMER",
            "UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN","UTM_CONTENT","UTM_TERM",
        ],
        "filter[>=DATE_CREATE]": DATE_FROM,
        "filter[<=DATE_CREATE]": DATE_TO,
        "order[DATE_CREATE]": "ASC",
    })
    save_json("deals", deals)
    save_csv("deals", deals)

    # ── 2. LEADS ─────────────────────────────────────────────────────────────
    print("Leads...")
    leads = fetch_all("crm.lead.list", {
        "select[]": [
            "ID","TITLE","STATUS_ID","STATUS_SEMANTIC_ID","OPPORTUNITY",
            "CURRENCY_ID","SOURCE_ID","SOURCE_DESCRIPTION",
            "NAME","LAST_NAME","PHONE","EMAIL","DATE_CREATE","DATE_MODIFY",
            "ASSIGNED_BY_ID","CREATED_BY_ID","COMMENTS","CLOSED",
            "UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN","UTM_CONTENT","UTM_TERM",
        ],
        "filter[>=DATE_CREATE]": DATE_FROM,
        "filter[<=DATE_CREATE]": DATE_TO,
        "order[DATE_CREATE]": "ASC",
    })
    save_json("leads", leads)
    save_csv("leads", leads)

    # ── 3. CONTACTS ──────────────────────────────────────────────────────────
    print("Contacts...")
    contacts = fetch_all("crm.contact.list", {
        "select[]": [
            "ID","NAME","LAST_NAME","SECOND_NAME","TYPE_ID","SOURCE_ID",
            "PHONE","EMAIL","DATE_CREATE","DATE_MODIFY",
            "ASSIGNED_BY_ID","CREATED_BY_ID","COMPANY_ID","COMMENTS",
        ],
        "filter[>=DATE_CREATE]": DATE_FROM,
        "filter[<=DATE_CREATE]": DATE_TO,
        "order[DATE_CREATE]": "ASC",
    })
    save_json("contacts", contacts)
    save_csv("contacts", contacts)

    # ── 4. COMPANIES ─────────────────────────────────────────────────────────
    print("Companies...")
    companies = fetch_all("crm.company.list", {
        "select[]": [
            "ID","TITLE","COMPANY_TYPE","INDUSTRY","REVENUE","CURRENCY_ID",
            "PHONE","EMAIL","DATE_CREATE","DATE_MODIFY",
            "ASSIGNED_BY_ID","CREATED_BY_ID","COMMENTS",
        ],
        "filter[>=DATE_CREATE]": DATE_FROM,
        "filter[<=DATE_CREATE]": DATE_TO,
        "order[DATE_CREATE]": "ASC",
    })
    save_json("companies", companies)
    save_csv("companies", companies)

    # ── 5. TASKS ─────────────────────────────────────────────────────────────
    print("Tasks...")
    tasks = fetch_all("tasks.task.list", {
        "select[]": [
            "ID","TITLE","STATUS","PRIORITY","RESPONSIBLE_ID","CREATED_BY",
            "DEADLINE","DATE_CREATE","CLOSED_DATE","DESCRIPTION",
            "GROUP_ID","STAGE_ID","DURATION_FACT","DURATION_PLAN",
        ],
        "filter[>=CREATED_DATE]": DATE_FROM,
        "filter[<=CREATED_DATE]": DATE_TO,
        "order[CREATED_DATE]": "ASC",
    }, list_key="tasks")
    save_json("tasks", tasks)
    save_csv("tasks", tasks)

    # ── 6. TELEPHONY CALLS ───────────────────────────────────────────────────
    print("Calls (voip.call.get list)...")
    calls = fetch_all("voip.call.search", {
        "FILTER[>=DATE_CREATE]": DATE_FROM,
        "FILTER[<=DATE_CREATE]": DATE_TO,
    })
    if not calls:
        # fallback: crm.activity.list filtered by type=2 (call)
        print("  Trying crm.activity.list for calls...")
        calls = fetch_all("crm.activity.list", {
            "select[]": [
                "ID","SUBJECT","DIRECTION","DURATION","COMPLETED",
                "DATE_CREATE","START_TIME","END_TIME","DEADLINE",
                "RESPONSIBLE_ID","AUTHOR_ID","OWNER_TYPE_ID","OWNER_ID",
                "DESCRIPTION","TYPE_ID","PROVIDER_ID","ASSOCIATED_ENTITY_ID",
            ],
            "filter[TYPE_ID]": 2,
            "filter[>=DATE_CREATE]": DATE_FROM,
            "filter[<=DATE_CREATE]": DATE_TO,
            "order[DATE_CREATE]": "ASC",
        })
    save_json("calls", calls)
    save_csv("calls", calls)

    # ── 7. OPEN LINES MESSAGES (WhatsApp/Telegram) ───────────────────────────
    print("Open lines sessions...")
    sessions = fetch_all("imopenlines.session.list", {
        "filter[>=DATE_CREATE]": DATE_FROM,
        "filter[<=DATE_CREATE]": DATE_TO,
    })
    save_json("openlines_sessions", sessions)
    save_csv("openlines_sessions", sessions)

    # ── 8. USERS (no date filter) ─────────────────────────────────────────────
    print("Users...")
    users = fetch_all("user.get", {
        "select[]": [
            "ID","NAME","LAST_NAME","EMAIL","ACTIVE","WORK_POSITION",
            "UF_DEPARTMENT","DATE_REGISTER","LAST_LOGIN","IS_ONLINE",
        ],
    })
    save_json("users", users)
    save_csv("users", users)

    # ── SUMMARY ───────────────────────────────────────────────────────────────
    print("\n=== DONE ===")
    print(f"  Deals:    {len(deals)}")
    print(f"  Leads:    {len(leads)}")
    print(f"  Contacts: {len(contacts)}")
    print(f"  Companies:{len(companies)}")
    print(f"  Tasks:    {len(tasks)}")
    print(f"  Calls:    {len(calls)}")
    print(f"  Sessions: {len(sessions)}")
    print(f"  Users:    {len(users)}")
    print(f"\n  Output: {OUT_DIR}")


if __name__ == "__main__":
    main()
