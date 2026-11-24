"""
汇总 Copilot Studio 评估导出的 CSV：每个评委的通过数、Credits、平均回答长度、内部文字泄露。
用法（在仓库根目录运行）：python scripts/analyse_results.py
"""
import csv
import glob
import os
import re

# 内部文字泄露的关键词（检索报错、重试之类的过渡话）
LEAK = re.compile(r"retry|retrying|errored|search tool|search is failing|search failed|another approach", re.I)

# 题号按 test_set_v1.csv 的顺序排列，用来给结果标上 A1、E2 这样的编号
with open("tests/test_set_v1.csv", encoding="utf-8") as f:
    questions = {row["question"]: row["id"] for row in csv.DictReader(f)}

for path in sorted(glob.glob("results/*.csv")):
    with open(path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    # 每个评委（testMethodType_n）各自统计 Pass 的数量
    judges = {}
    for col in rows[0]:
        if col.startswith("testMethodType_"):
            n = col.split("_")[1]
            judges[rows[0][col]] = sum(r[f"result_{n}"] == "Pass" for r in rows)

    credits = sum(float(r["Credits used"]) for r in rows)
    avg_words = sum(len(r["actualResponse"].split()) for r in rows) / len(rows)
    leaks = [questions.get(r["question"], "?") for r in rows if LEAK.search(r["actualResponse"])]

    print(os.path.basename(path))
    print(f"  questions: {len(rows)}  judges (Pass count): {judges}")
    print(f"  credits: {credits:.1f}  avg words: {avg_words:.0f}  leaks: {leaks or 'none'}")
